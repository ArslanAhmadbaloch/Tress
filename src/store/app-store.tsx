/**
 * Local-first application store.
 *
 * Everything lives on device. The shape mirrors what a Supabase schema
 * will look like, and all writes funnel through the actions here, so
 * swapping the persistence layer later touches this file only.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { toDateKey } from '@/lib/date';
import {
  addMissingAngles,
  doseCount,
  dosesTaken,
  EMPTY_DATA,
  migrateStoredData,
  patchPhotoIn,
  type AppData,
  type JournalEntry,
  type Gender,
  type Journey,
  type Photo,
  type PhotoSession,
  type PhotoSessionScan,
  type Product,
  type Profile,
  type RoutineItem,
  type RoutineLog,
  upsertProduct,
  withoutProduct,
} from '@/types/domain';

const STORAGE_KEY = 'hj.data.v1';

function makeId(prefix: string): string {
  // Good enough for local records; the backend will issue real ids.
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

/**
 * Everything the funnel gathered.
 *
 * Taken whole rather than in pieces: a journey is created once, at the
 * moment the person's card is revealed to them, and every answer that led
 * there belongs to it.
 */
export type CreateJourneyInput = {
  displayName: string;
  age?: number;
  gender?: Gender;
  avatarUri?: string;
  journey: Omit<Journey, 'id' | 'profileId' | 'createdAt'>;
  /** Seeded from what they said they are already doing. */
  routineSeeds: Pick<
    RoutineItem,
    'label' | 'icon' | 'timeOfDay' | 'timesPerWeek'
  >[];
};

type AppStore = {
  data: AppData;
  /** False until the first read from disk resolves. */
  isLoaded: boolean;

  createJourney: (input: CreateJourneyInput) => void;
  updateJourney: (patch: Partial<Omit<Journey, 'id' | 'profileId'>>) => void;
  updateProfile: (patch: Partial<Omit<Profile, 'id' | 'createdAt'>>) => void;

  /**
   * Saves a new set. `scan` is the continuous hair scan's own record of
   * its run (see `PhotoSessionScan`); a set taken one angle at a time
   * passes none, and the session it makes is exactly the session it
   * always made.
   */
  addSession: (
    photos: Omit<Photo, 'id' | 'sessionId'>[],
    note?: string,
    scan?: PhotoSessionScan,
  ) => PhotoSession | null;
  /**
   * Adds the angles an existing session lacks; photographs for angles it
   * already holds are dropped. See `sessionToExtend` for when a capture
   * takes this route instead of `addSession`.
   */
  extendSession: (
    sessionId: string,
    photos: Omit<Photo, 'id' | 'sessionId'>[],
  ) => PhotoSession | null;
  /** Lands a measurement that finished after its photograph was saved. */
  patchPhoto: (
    sessionId: string,
    photoId: string,
    patch: Partial<Omit<Photo, 'id' | 'sessionId'>>,
  ) => void;
  updateSessionNote: (sessionId: string, note: string) => void;
  /** Renames an update. An empty title restores the automatic milestone. */
  renameSession: (sessionId: string, title: string) => void;
  deleteSession: (sessionId: string) => void;

  addRoutineItem: (input: Omit<RoutineItem, 'id' | 'journeyId' | 'createdAt'>) => void;
  updateRoutineItem: (
    itemId: string,
    patch: Partial<Omit<RoutineItem, 'id' | 'journeyId' | 'createdAt'>>,
  ) => void;
  archiveRoutineItem: (itemId: string) => void;
  /** Records one more dose for today, wrapping back to none when full. */
  advanceRoutineToday: (itemId: string) => void;
  /**
   * Caches a looked-up or typed product. Upsert by barcode: a fresh lookup
   * replaces a stale one, and a manual entry is replaced if the database
   * later knows the code. Products are never deleted individually — they
   * are database records, not personal ones; resetAll clears them.
   */
  saveProduct: (product: Product) => void;
  /** Unlinks an item's product. The item and its history are untouched. */
  detachProduct: (itemId: string) => void;

  addJournalEntry: (body: string, sessionId?: string) => void;
  deleteJournalEntry: (entryId: string) => void;

  /** Wipes every local record. Used by "delete my data" in settings. */
  resetAll: () => Promise<void>;
};

const AppStoreContext = createContext<AppStore | null>(null);

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(EMPTY_DATA);
  const [isLoaded, setIsLoaded] = useState(false);

  // Persist on a short delay so rapid taps (ticking off a routine) don't
  // hammer AsyncStorage with a write per keystroke.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasLoaded = useRef(false);

  useEffect(() => {
    let cancelled = false;

    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (cancelled || !raw) return;
        /*
          Every migration lives in `migrateStoredData`, where it can be
          tested against a blob shaped like the one on a phone that has
          not been updated yet. It hands back data this version can
          render, or null for a record it cannot read at all.
        */
        const loaded = migrateStoredData(JSON.parse(raw));
        if (loaded) setData(loaded);
      })
      .catch(() => {
        // Corrupt or unreadable storage: start clean rather than crash.
      })
      .finally(() => {
        if (cancelled) return;
        hasLoaded.current = true;
        setIsLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hasLoaded.current) return;

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data)).catch(
        () => undefined,
      );
    }, 250);

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [data]);

  const createJourney = useCallback((input: CreateJourneyInput) => {
    const now = new Date().toISOString();
    const profileId = makeId('prof');
    const journeyId = makeId('jrn');

    setData((prev) => ({
      ...prev,
      profile: {
        id: profileId,
        displayName: input.displayName.trim() || 'You',
        age: input.age,
        gender: input.gender,
        avatarUri: input.avatarUri,
        createdAt: now,
      },
      journey: {
        ...input.journey,
        id: journeyId,
        profileId,
        createdAt: now,
      },
      routineItems: input.routineSeeds.map((seed) => ({
        ...seed,
        id: makeId('rti'),
        journeyId,
        // Seven times a week is daily; anything less is a weekly target.
        cadence:
          seed.timesPerWeek === undefined || seed.timesPerWeek >= 7
            ? ('daily' as const)
            : ('weekly' as const),
        createdAt: now,
      })),
      onboardingCompletedAt: now,
    }));
  }, []);

  const updateJourney = useCallback(
    (patch: Partial<Omit<Journey, 'id' | 'profileId'>>) => {
      setData((prev) =>
        prev.journey
          ? { ...prev, journey: { ...prev.journey, ...patch } }
          : prev,
      );
    },
    [],
  );

  const updateProfile = useCallback(
    (patch: Partial<Omit<Profile, 'id' | 'createdAt'>>) => {
      setData((prev) =>
        prev.profile
          ? { ...prev, profile: { ...prev.profile, ...patch } }
          : prev,
      );
    },
    [],
  );

  const addSession = useCallback(
    (photos: Omit<Photo, 'id' | 'sessionId'>[], note?: string, scan?: PhotoSessionScan) => {
      let created: PhotoSession | null = null;

      setData((prev) => {
        if (!prev.journey) return prev;

        const sessionId = makeId('ses');
        const session: PhotoSession = {
          id: sessionId,
          journeyId: prev.journey.id,
          capturedAt: new Date().toISOString(),
          isBaseline: prev.sessions.length === 0,
          photos: photos.map((p) => ({ ...p, id: makeId('pho'), sessionId })),
          note: note?.trim() || undefined,
          // Spread in rather than set, so a set with no scan block stores
          // no `scan` key at all — an absent field, not an undefined one.
          ...(scan ? { scan } : {}),
        };
        created = session;

        return {
          ...prev,
          // Newest first: every list in the app reads in this order.
          sessions: [session, ...prev.sessions],
        };
      });

      return created;
    },
    [],
  );

  const extendSession = useCallback(
    (sessionId: string, photos: Omit<Photo, 'id' | 'sessionId'>[]) => {
      let extended: PhotoSession | null = null;

      setData((prev) => {
        const session = prev.sessions.find((s) => s.id === sessionId);
        if (!session) return prev;

        const next = addMissingAngles(
          session,
          photos.map((p) => ({ ...p, id: makeId('pho'), sessionId })),
        );
        extended = next;
        if (next === session) return prev;

        return {
          ...prev,
          sessions: prev.sessions.map((s) => (s === session ? next : s)),
        };
      });

      return extended;
    },
    [],
  );

  const patchPhoto = useCallback(
    (
      sessionId: string,
      photoId: string,
      patch: Partial<Omit<Photo, 'id' | 'sessionId'>>,
    ) => {
      setData((prev) => {
        const sessions = patchPhotoIn(prev.sessions, sessionId, photoId, patch);
        return sessions === prev.sessions ? prev : { ...prev, sessions };
      });
    },
    [],
  );

  const updateSessionNote = useCallback((sessionId: string, note: string) => {
    setData((prev) => ({
      ...prev,
      sessions: prev.sessions.map((s) =>
        s.id === sessionId ? { ...s, note: note.trim() || undefined } : s,
      ),
    }));
  }, []);

  const renameSession = useCallback((sessionId: string, title: string) => {
    const trimmed = title.trim();
    setData((prev) => ({
      ...prev,
      sessions: prev.sessions.map((session) =>
        session.id === sessionId
          ? { ...session, title: trimmed || undefined }
          : session,
      ),
    }));
  }, []);

  const deleteSession = useCallback((sessionId: string) => {
    setData((prev) => {
      const removed = prev.sessions.find((s) => s.id === sessionId);
      // The journey card points at one of these files. Deleting the
      // session deletes the file, so a card still holding its URI would
      // render an empty circle until the user noticed and fixed it.
      const losesAvatar =
        prev.profile?.avatarUri !== undefined &&
        Boolean(removed?.photos.some((p) => p.uri === prev.profile?.avatarUri));

      return {
        ...prev,
        profile:
          losesAvatar && prev.profile
            ? { ...prev.profile, avatarUri: undefined }
            : prev.profile,
        sessions: prev.sessions.filter((s) => s.id !== sessionId),
        journal: prev.journal.filter((j) => j.sessionId !== sessionId),
      };
    });
  }, []);

  const addRoutineItem = useCallback(
    (input: Omit<RoutineItem, 'id' | 'journeyId' | 'createdAt'>) => {
      setData((prev) => {
        if (!prev.journey) return prev;
        return {
          ...prev,
          routineItems: [
            ...prev.routineItems,
            {
              ...input,
              id: makeId('rti'),
              journeyId: prev.journey.id,
              createdAt: new Date().toISOString(),
            },
          ],
        };
      });
    },
    [],
  );

  const archiveRoutineItem = useCallback((itemId: string) => {
    setData((prev) => ({
      ...prev,
      routineItems: prev.routineItems.map((item) =>
        item.id === itemId
          ? { ...item, archivedAt: new Date().toISOString() }
          : item,
      ),
    }));
  }, []);

  /**
   * Records one more dose of an item for today.
   *
   * A single-dose item behaves exactly as the old toggle did: on, then
   * off. Something taken twice a day fills once per tap and, once both
   * are in, the next tap clears the day — so a mis-tap is undone the same
   * way it was made, without a separate gesture to learn.
   */
  const advanceRoutineToday = useCallback((itemId: string) => {
    const date = toDateKey();

    setData((prev) => {
      const item = prev.routineItems.find((i) => i.id === itemId);
      const total = item ? doseCount(item) : 1;

      const existing = prev.routineLogs.find(
        (log) => log.routineItemId === itemId && log.date === date,
      );

      const taken = dosesTaken(existing, total);
      const next = taken >= total ? 0 : taken + 1;
      const now = new Date().toISOString();

      if (existing) {
        return {
          ...prev,
          routineLogs: prev.routineLogs.map((log) =>
            log === existing
              ? { ...log, doses: next, completed: next >= total, loggedAt: now }
              : log,
          ),
        };
      }

      const log: RoutineLog = {
        id: makeId('log'),
        routineItemId: itemId,
        date,
        doses: next,
        completed: next >= total,
        loggedAt: now,
      };
      return { ...prev, routineLogs: [...prev.routineLogs, log] };
    });
  }, []);

  /**
   * Edit an item in place.
   *
   * Changing the doses a day rewrites today's log so the row cannot show
   * three of two: the count is clamped, and the day stops counting as
   * complete if the bar just moved above what has been taken.
   */
  const updateRoutineItem = useCallback(
    (
      itemId: string,
      patch: Partial<Omit<RoutineItem, 'id' | 'journeyId' | 'createdAt'>>,
    ) => {
      const date = toDateKey();

      setData((prev) => {
        const items = prev.routineItems.map((item) =>
          item.id === itemId ? { ...item, ...patch } : item,
        );
        const updated = items.find((i) => i.id === itemId);
        if (!updated) return prev;

        const total = doseCount(updated);
        const routineLogs = prev.routineLogs.map((log) => {
          if (log.routineItemId !== itemId || log.date !== date) return log;
          const taken = dosesTaken(log, total);
          return { ...log, doses: taken, completed: taken >= total };
        });

        return { ...prev, routineItems: items, routineLogs };
      });
    },
    [],
  );

  const saveProduct = useCallback((product: Product) => {
    setData((prev) => ({ ...prev, products: upsertProduct(prev.products, product) }));
  }, []);

  const detachProduct = useCallback((itemId: string) => {
    setData((prev) => ({
      ...prev,
      routineItems: prev.routineItems.map((item) =>
        item.id === itemId ? withoutProduct(item) : item,
      ),
    }));
  }, []);

  const addJournalEntry = useCallback((body: string, sessionId?: string) => {
    const trimmed = body.trim();
    if (!trimmed) return;

    setData((prev) => {
      if (!prev.journey) return prev;
      const entry: JournalEntry = {
        id: makeId('jnl'),
        journeyId: prev.journey.id,
        sessionId,
        body: trimmed,
        createdAt: new Date().toISOString(),
      };
      return { ...prev, journal: [entry, ...prev.journal] };
    });
  }, []);

  const deleteJournalEntry = useCallback((entryId: string) => {
    setData((prev) => ({
      ...prev,
      journal: prev.journal.filter((j) => j.id !== entryId),
    }));
  }, []);

  const resetAll = useCallback(async () => {
    setData(EMPTY_DATA);
    await AsyncStorage.removeItem(STORAGE_KEY).catch(() => undefined);
  }, []);

  const value = useMemo<AppStore>(
    () => ({
      data,
      isLoaded,
      createJourney,
      updateJourney,
      updateProfile,
      addSession,
      extendSession,
      patchPhoto,
      updateSessionNote,
      renameSession,
      deleteSession,
      addRoutineItem,
      archiveRoutineItem,
      advanceRoutineToday,
      updateRoutineItem,
      saveProduct,
      detachProduct,
      addJournalEntry,
      deleteJournalEntry,
      resetAll,
    }),
    [
      data,
      isLoaded,
      createJourney,
      updateJourney,
      updateProfile,
      addSession,
      extendSession,
      patchPhoto,
      updateSessionNote,
      renameSession,
      deleteSession,
      addRoutineItem,
      archiveRoutineItem,
      advanceRoutineToday,
      updateRoutineItem,
      saveProduct,
      detachProduct,
      addJournalEntry,
      deleteJournalEntry,
      resetAll,
    ],
  );

  return (
    <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>
  );
}

export function useAppStore(): AppStore {
  const ctx = useContext(AppStoreContext);
  if (!ctx) throw new Error('useAppStore must be used inside <AppStoreProvider>.');
  return ctx;
}
