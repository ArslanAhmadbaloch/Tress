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
  EMPTY_DATA,
  SCHEMA_VERSION,
  type AppData,
  type JournalEntry,
  type Journey,
  type Photo,
  type PhotoSession,
  type Profile,
  type RoutineItem,
  type RoutineLog,
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
  avatarUri?: string;
  journey: Omit<Journey, 'id' | 'profileId' | 'createdAt'>;
  /** Seeded from what they said they are already doing. */
  routineSeeds: Pick<RoutineItem, 'label' | 'icon' | 'timeOfDay'>[];
};

type AppStore = {
  data: AppData;
  /** False until the first read from disk resolves. */
  isLoaded: boolean;

  createJourney: (input: CreateJourneyInput) => void;
  updateJourney: (patch: Partial<Omit<Journey, 'id' | 'profileId'>>) => void;
  updateProfile: (patch: Partial<Omit<Profile, 'id' | 'createdAt'>>) => void;

  addSession: (photos: Omit<Photo, 'id' | 'sessionId'>[], note?: string) => PhotoSession | null;
  updateSessionNote: (sessionId: string, note: string) => void;
  deleteSession: (sessionId: string) => void;

  addRoutineItem: (input: Omit<RoutineItem, 'id' | 'journeyId' | 'createdAt'>) => void;
  archiveRoutineItem: (itemId: string) => void;
  toggleRoutineToday: (itemId: string) => void;

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
        const parsed = JSON.parse(raw) as AppData;
        // Future migrations branch here on parsed.schemaVersion.
        if (parsed.schemaVersion === SCHEMA_VERSION) {
          setData({ ...EMPTY_DATA, ...parsed });
        }
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
        cadence: 'daily' as const,
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
    (photos: Omit<Photo, 'id' | 'sessionId'>[], note?: string) => {
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

  const updateSessionNote = useCallback((sessionId: string, note: string) => {
    setData((prev) => ({
      ...prev,
      sessions: prev.sessions.map((s) =>
        s.id === sessionId ? { ...s, note: note.trim() || undefined } : s,
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

  const toggleRoutineToday = useCallback((itemId: string) => {
    const date = toDateKey();

    setData((prev) => {
      const existing = prev.routineLogs.find(
        (log) => log.routineItemId === itemId && log.date === date,
      );

      if (existing) {
        return {
          ...prev,
          routineLogs: prev.routineLogs.map((log) =>
            log === existing
              ? { ...log, completed: !log.completed, loggedAt: new Date().toISOString() }
              : log,
          ),
        };
      }

      const log: RoutineLog = {
        id: makeId('log'),
        routineItemId: itemId,
        date,
        completed: true,
        loggedAt: new Date().toISOString(),
      };
      return { ...prev, routineLogs: [...prev.routineLogs, log] };
    });
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
      updateSessionNote,
      deleteSession,
      addRoutineItem,
      archiveRoutineItem,
      toggleRoutineToday,
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
      updateSessionNote,
      deleteSession,
      addRoutineItem,
      archiveRoutineItem,
      toggleRoutineToday,
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
