import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { HeaderActions, MetricExplainer } from '@/components/dashboard';
import {
  BarChartCard,
  CheckInGrid,
  KeyMetricsCard,
  MilestonesCard,
  NoteRow,
  NotesCard,
  Panel,
  PhotoStrip,
  ScoreCard,
  SegmentedTabs,
  type Milestone,
  type MetricRow,
} from '@/components/journey-cards';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { EmptyState, Screen, ScreenScroll, ScreenTitle, Separator } from '@/components/ui/layout';
import { BarsGlyph, StrandGlyph } from '@/components/ui/metric-glyphs';
import { PressableScale } from '@/components/ui/pressable-scale';
import { RoutineGlyph } from '@/components/ui/routine-glyphs';
import { Text } from '@/components/ui/text';
import { addDays, daysBetween, formatDate, formatDateShort, formatMilestone } from '@/lib/date';
import { useAppStore } from '@/store/app-store';
import {
  adherencePercent,
  baselineSession,
  consistencyScore,
  dailyCompletion,
  monthlyAdherenceHistory,
  monthlySessionCounts,
  sessionsChronological,
  weeklyAdherenceSeries,
  weeklyJournalCounts,
} from '@/store/selectors';
import { useTheme } from '@/theme';
import { ANGLE_LABELS, type AppData, type PhotoSession } from '@/types/domain';

type Tab = 'overview' | 'photos' | 'measurements' | 'journal';

const TABS: { value: Tab; label: string }[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'photos', label: 'Photos' },
  { value: 'measurements', label: 'Measurements' },
  { value: 'journal', label: 'Journal' },
];

const RANGES = [3, 6, 12] as const;
type Range = (typeof RANGES)[number];

/** Dated milestones the app can actually vouch for: time and photos. */
function milestonesFor(data: AppData): Milestone[] {
  if (!data.journey) return [];
  const start = data.journey.startedAt;
  const elapsed = daysBetween(start);
  const baseline = baselineSession(data);

  return [
    { label: 'Journey started', date: formatDate(start), done: true },
    baseline
      ? { label: 'Baseline photos', date: formatDate(baseline.capturedAt), done: true }
      : { label: 'Capture your baseline', date: 'Next step', done: false },
    { label: '1 month tracked', date: formatDate(addDays(start, 30)), done: elapsed >= 30 },
    { label: '3 months tracked', date: formatDate(addDays(start, 91)), done: elapsed >= 91 },
    { label: '6 month review', date: formatDate(addDays(start, 182)), done: elapsed >= 182 },
  ];
}

export default function JourneyScreen() {
  const { colors, spacing } = useTheme();
  const router = useRouter();
  const { data } = useAppStore();

  const [tab, setTab] = useState<Tab>('overview');
  const [months, setMonths] = useState<Range>(6);
  const [explain, setExplain] = useState(false);

  const history = useMemo(() => monthlyAdherenceHistory(data, months), [data, months]);
  const weekly = useMemo(() => weeklyAdherenceSeries(data, 8), [data]);
  const checkIns = useMemo(() => dailyCompletion(data, 28), [data]);
  const sessionsByMonth = useMemo(() => monthlySessionCounts(data, 6), [data]);
  const journalByWeek = useMemo(() => weeklyJournalCounts(data, 8), [data]);

  const journey = data.journey;
  if (!journey) return null;

  const name = data.profile?.displayName?.trim();
  const score = consistencyScore(data);
  const adherence = adherencePercent(data, 30);
  const chronological = sessionsChronological(data);

  const strip = chronological.map((session) => {
    const photo =
      session.photos.find((p) => p.angle === 'top') ?? session.photos[0];
    return {
      id: session.id,
      thumbnailUri: photo?.thumbnailUri ?? photo?.uri,
      date: formatDateShort(session.capturedAt),
      label: formatMilestone(journey.startedAt, session.capturedAt),
    };
  });

  const metrics: MetricRow[] = [
    {
      glyph: <BarsGlyph size={15} />,
      label: 'Consistency',
      value: `${score.value}`,
      trend:
        typeof score.delta === 'number' && score.delta !== 0
          ? score.delta > 0
            ? 'up'
            : 'down'
          : undefined,
    },
    {
      glyph: <RoutineGlyph icon="drop" size={15} />,
      label: 'Routine',
      value: adherence === null ? '—' : `${adherence}%`,
    },
    {
      glyph: <Icon name="camera" size={14} color={colors.text} />,
      label: 'Sessions',
      value: `${data.sessions.length}`,
    },
    {
      glyph: <StrandGlyph size={16} />,
      label: 'Days tracked',
      value: `${daysBetween(journey.startedAt) + 1}`,
    },
  ];

  const latestNote = data.journal[0];
  const scoreCard = (
    <ScoreCard
      value={score.value}
      delta={score.delta}
      points={history}
      months={months}
      onCycleRange={() => setMonths(RANGES[(RANGES.indexOf(months) + 1) % RANGES.length])}
      onExplain={() => setExplain(true)}
      style={{ marginTop: spacing.md }}
    />
  );

  return (
    <Screen>
      <ScreenScroll>
        <ScreenTitle
          eyebrow="Your journey"
          title="Track Your"
          titleMuted="Progress"
          subtitle={'Small steps. Real results.\nA healthier, fuller you tomorrow.'}
          script="Progress Takes Time"
          trailing={
            <HeaderActions
              initial={(name ?? 'Y').charAt(0).toUpperCase()}
              avatarUri={data.profile?.avatarUri}
              onSettings={() => router.push('/settings')}
              onProfile={() => router.push('/profile')}
            />
          }
        />

        <SegmentedTabs options={TABS} value={tab} onChange={setTab} />

        {tab === 'overview' ? (
          <>
            {scoreCard}
            <PhotoStrip
              items={strip}
              onOpen={(id) => router.push(`/session/${id}`)}
              onCapture={() => router.push('/capture-intro')}
              onSeeAll={() => setTab('photos')}
              style={{ marginTop: spacing.md }}
            />
            <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.md }}>
              <KeyMetricsCard
                rows={metrics}
                onDetails={() => router.push('/calendar')}
                style={{ flex: 1 }}
              />
              <MilestonesCard items={milestonesFor(data)} style={{ flex: 1 }} />
            </View>
            <NotesCard
              latest={
                latestNote
                  ? { body: latestNote.body, date: formatDate(latestNote.createdAt) }
                  : undefined
              }
              onOpen={() => router.push('/journal')}
              onSeeAll={() => setTab('journal')}
              style={{ marginTop: spacing.md }}
            />
          </>
        ) : null}

        {tab === 'photos' ? (
          chronological.length === 0 ? (
            <EmptyState
              icon="journey"
              title="Your journey starts here"
              body="Once you capture your baseline, every update lands on this timeline so you can see what changed."
              actionLabel="Create First Update"
              onAction={() => router.push('/capture-intro')}
            />
          ) : (
            <SessionTimeline
              sessions={[...chronological].reverse()}
              startedAt={journey.startedAt}
              canCompare={data.sessions.length >= 2}
            />
          )
        ) : null}

        {tab === 'measurements' ? (
          <>
            {/* Consistency lives on Overview; here, the series behind it. */}
            <BarChartCard
              title="Weekly routine"
              caption="Share of your stack completed each week"
              points={weekly}
              max={100}
              format={(v) => `${v}%`}
              preview={weekly.every((p) => p.value === null)}
              style={{ marginTop: spacing.md }}
            />
            <CheckInGrid days={checkIns} style={{ marginTop: spacing.md }} />
            <BarChartCard
              title="Photo sessions"
              caption="Sessions captured each month"
              points={sessionsByMonth}
              max={2}
              format={(v) => `${v}`}
              preview={data.sessions.length === 0}
              style={{ marginTop: spacing.md }}
            />
            <BarChartCard
              title="Hair Journal"
              caption="Entries written each week"
              points={journalByWeek}
              max={3}
              format={(v) => `${v}`}
              preview={data.journal.length === 0}
              style={{ marginTop: spacing.md }}
            />
          </>
        ) : null}

        {tab === 'journal' ? (
          data.journal.length === 0 ? (
            <EmptyState
              icon="note"
              title="No journal entries yet"
              body="Write what changed, how you felt, anything worth remembering. Your journal stays on this device."
              actionLabel="Write an Entry"
              onAction={() => router.push('/journal')}
            />
          ) : (
            <>
              <Panel style={{ marginTop: spacing.md, gap: spacing.md }}>
                {data.journal.map((entry, i) => (
                  <View key={entry.id} style={{ gap: spacing.md }}>
                    {i > 0 ? <Separator /> : null}
                    <NoteRow body={entry.body} date={formatDate(entry.createdAt)} />
                  </View>
                ))}
              </Panel>
              <Button
                label="Open Journal"
                icon="note"
                variant="secondary"
                style={{ marginTop: spacing.md }}
                onPress={() => router.push('/journal')}
              />
            </>
          )
        ) : null}
      </ScreenScroll>

      {explain ? (
        <MetricExplainer
          title="Consistency"
          body="How consistently you are documenting — not an assessment of your hair. Nothing in this app measures hair; it stores your photographs so you can compare them yourself."
          points={[
            'Routine adherence over the last 30 days, weighted 60%',
            'Photo sessions taken against those expected for your interval, weighted 40%',
            'The chart shows your routine adherence for each calendar month',
            'Until there are two months of history, the faded line is a preview shape, not your data',
          ]}
          onClose={() => setExplain(false)}
        />
      ) : null}
    </Screen>
  );
}

/* ------------------------------------------------------------------ */

/** The full photo timeline, newest first, for the Photos tab. */
function SessionTimeline({
  sessions,
  startedAt,
  canCompare,
}: {
  sessions: PhotoSession[];
  startedAt: string;
  canCompare: boolean;
}) {
  const { colors, spacing, radius } = useTheme();
  const router = useRouter();

  return (
    <View style={{ marginTop: spacing.lg }}>
      {canCompare ? (
        <Button
          label="Compare Photos"
          icon="compare"
          variant="secondary"
          style={{ marginBottom: spacing.lg }}
          onPress={() => router.push('/compare')}
        />
      ) : null}

      {sessions.map((session, index) => {
        const isLast = index === sessions.length - 1;
        return (
          <View key={session.id} style={{ flexDirection: 'row' }}>
            <View style={{ width: 28, alignItems: 'center' }}>
              <View
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 6,
                  marginTop: 6,
                  backgroundColor: session.isBaseline ? colors.accent : colors.textTertiary,
                  borderWidth: session.isBaseline ? 0 : 2,
                  borderColor: colors.background,
                }}
              />
              {!isLast ? (
                <View
                  style={{ flex: 1, width: 2, marginTop: 4, backgroundColor: colors.separator }}
                />
              ) : null}
            </View>

            <View style={{ flex: 1, paddingBottom: spacing.xl }}>
              <PressableScale
                onPress={() => router.push(`/session/${session.id}`)}
                scaleTo={0.985}
                accessibilityRole="button"
                accessibilityLabel={`${formatMilestone(startedAt, session.capturedAt)}, ${formatDate(session.capturedAt)}`}
                style={{
                  backgroundColor: colors.surface,
                  borderRadius: radius.card,
                  borderWidth: 1,
                  borderColor: colors.border,
                  overflow: 'hidden',
                }}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: spacing.lg,
                    paddingBottom: spacing.md,
                  }}>
                  <View style={{ flex: 1 }}>
                    <Text variant="title3">{formatMilestone(startedAt, session.capturedAt)}</Text>
                    <Text variant="footnote" color="textSecondary" style={{ marginTop: 2 }}>
                      {formatDate(session.capturedAt)}
                    </Text>
                  </View>
                  <Icon name="chevronRight" size={16} color={colors.textTertiary} />
                </View>

                <View style={{ flexDirection: 'row', gap: 2 }}>
                  {session.photos.map((photo) => (
                    <View key={photo.id} style={{ flex: 1, aspectRatio: 0.8 }}>
                      <Image
                        source={{ uri: photo.thumbnailUri ?? photo.uri }}
                        style={{ width: '100%', height: '100%' }}
                        contentFit="cover"
                        transition={160}
                        // Thumbnails only — full-res loads on the detail screen.
                        recyclingKey={photo.id}
                        accessibilityLabel={ANGLE_LABELS[photo.angle]}
                      />
                    </View>
                  ))}
                </View>

                {session.note ? (
                  <View style={{ padding: spacing.lg }}>
                    <Text variant="footnote" color="textSecondary" numberOfLines={2}>
                      {session.note}
                    </Text>
                  </View>
                ) : null}
              </PressableScale>
            </View>
          </View>
        );
      })}

      <Button
        label="Add Update"
        icon="camera"
        variant="secondary"
        style={{ marginTop: spacing.sm }}
        onPress={() => router.push('/capture-intro')}
      />
    </View>
  );
}
