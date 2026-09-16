/**
 * What the device measured in the first photograph.
 *
 * This is the screen the funnel lands on, and the one the paywall comes
 * after. That order matters commercially and it matters ethically, and
 * for once those point the same way: somebody who has just watched a real
 * reading drawn over their own photograph is being asked to pay for
 * something they have seen work, not for a promise.
 *
 * ── What it can say, and what it cannot ───────────────────────────────
 * Every number here was taken on this device when the shutter fired:
 * brightness, contrast, sharpness and clipping from the pixels, and —
 * in the full build, where the segmenter is installed — how much of the
 * frame the hair mask claims. That is a report about the photograph,
 * drawn over the photograph.
 *
 * It is not a report about the hair in it, and the temptation to make it
 * one is strongest exactly here, on the highest-intent screen in the app.
 * A mask cannot see between strands and a phone cannot classify anything,
 * so a stage or a density score printed here would be invented, on the
 * screen a person is most likely to believe, immediately before being
 * charged. The copy is built in features/assessment/scan-reading.ts and
 * the tests sweep it for exactly those words.
 *
 * ── The shape ─────────────────────────────────────────────────────────
 * What went well, then what is holding the record back, then what to do
 * about it. In that order, because a reading that opens with shortfalls
 * is one somebody closes — and because the good half is not flattery
 * here: every line of it is a measurement that came out of the same
 * pixels as the bad half.
 *
 * The middle section is the one with the strongest pull towards a claim
 * about a head, and it is fenced in features/assessment/scan-reading.ts
 * rather than here: every note it can hold is about an angle that is
 * missing, a date that passed, a tick that was not made, or a number
 * taken off the photograph. None of its inputs is a person.
 *
 * ── The pacing ────────────────────────────────────────────────────────
 * The photograph first, on its own for a beat; then the overlay draws;
 * then the readings land one card at a time, rings filling as they
 * arrive. It takes a few seconds and it is meant to. A report that is
 * simply there is skimmed; one that is delivered is read.
 */

import { useRouter } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import {
  FindingRow,
  ReadingRing,
  ReadingTile,
  Reveal,
  ScanHero,
  revealDelay,
} from '@/components/report';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon, type IconName } from '@/components/ui/icon';
import { EmptyState, Screen, ScreenScroll } from '@/components/ui/layout';
import { Text } from '@/components/ui/text';
import {
  buildScanReading,
  gateReading,
  type ReportAction,
  type ReportNote,
} from '@/features/assessment/scan-reading';
import { usePremiumGate } from '@/features/subscription/gate';
import { usePremium } from '@/features/subscription/provider';
import { formatDateShort } from '@/lib/date';
import {
  currentReminderHour,
  markRemindersOffered,
  remindersAlreadyOffered,
  routineReminderIsEnabled,
  updateReminderIsEnabled,
} from '@/lib/device-preferences';
import { enableRemindersWithPrompt } from '@/lib/notifications';
import { useAppStore } from '@/store/app-store';
import { iconSize, useTheme } from '@/theme';
import { ANGLE_LABELS } from '@/types/domain';

/**
 * The entitled branch of the locked card's gate.
 *
 * There is nothing for it to do: the card it sits on is rendered only
 * while the reading is gated, and the entitlement that would run this is
 * the one that takes the card away.
 */
const nothingLeftToOpen = () => undefined;

/** A heading with its mark, above one of the three sections. */
function SectionHead({ icon, title, colour }: { icon: IconName; title: string; colour: string }) {
  const { spacing } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
      <Icon name={icon} size={iconSize.sm} color={colour} />
      <Text variant="title3" accessibilityRole="header" style={{ flex: 1 }}>
        {title}
      </Text>
    </View>
  );
}

/** What went well, or what is holding the record back: same row, different list. */
function NoteSection({
  icon,
  title,
  notes,
}: {
  icon: IconName;
  title: string;
  notes: ReportNote[];
}) {
  const { colors, spacing } = useTheme();

  return (
    <Card>
      <SectionHead icon={icon} title={title} colour={colors.textSecondary} />
      <View style={{ marginTop: spacing.xs }}>
        {notes.map((note, i) => (
          <FindingRow
            key={note.id}
            tone={note.tone}
            headline={note.headline}
            detail={note.detail}
            divider={i > 0}
          />
        ))}
      </View>
    </Card>
  );
}

/**
 * One thing to do, with the control that does it.
 *
 * An action with a screen behind it gets a real button to that screen.
 * An action that is only a way of standing next month — face the window,
 * brace the phone — gets no button, because a button that navigates
 * nowhere in particular is worse than a sentence.
 */
function ActionRow({
  action,
  divider,
  onGo,
}: {
  action: ReportAction;
  divider: boolean;
  onGo: (action: ReportAction) => void;
}) {
  const { colors, spacing } = useTheme();

  return (
    <View
      style={{
        gap: spacing.xs,
        paddingVertical: spacing.lg,
        borderTopWidth: divider ? 1 : 0,
        borderTopColor: colors.separator,
      }}>
      <Text variant="headline">{action.headline}</Text>
      <Text variant="footnote" color="textSecondary">
        {action.detail}
      </Text>
      {action.link ? (
        <Button
          label={action.link.label}
          variant="secondary"
          size="md"
          block={false}
          icon="arrowRight"
          onPress={() => onGo(action)}
          style={{ marginTop: spacing.sm, alignSelf: 'flex-start' }}
        />
      ) : null}
    </View>
  );
}

export default function ScanReportScreen() {
  const { data } = useAppStore();
  const { colors, radius, spacing } = useTheme();
  const router = useRouter();

  /*
    The one place the app asks for notifications.

    The reminder switches are on by default, but a default is not
    permission — the system still has to ask, and it only ever asks once
    per install. This screen is the moment the offer is self-explanatory:
    a first reading is on the screen, and the only thing that turns it
    into a comparison is coming back. Asking at launch instead would
    spend the single prompt on somebody who does not yet know what the
    app does, and "Don't Allow" cannot be undone from inside the app.

    It runs once, it never blocks the render, and a refusal is final and
    silent: the switches stay on, nothing is scheduled, and Settings is
    where the system prompt is explained.
  */
  useEffect(() => {
    if (remindersAlreadyOffered()) return;
    const interval = data.journey?.updateIntervalDays;
    if (!interval) return;

    let cancelled = false;
    void (async () => {
      await enableRemindersWithPrompt({
        routine: routineReminderIsEnabled(),
        update: updateReminderIsEnabled(),
        hour: currentReminderHour(),
        intervalDays: interval,
      });
      if (!cancelled) await markRemindersOffered();
    })();
    return () => {
      cancelled = true;
    };
  }, [data.journey?.updateIntervalDays]);

  // Sessions are stored newest-first, so the latest is the head.
  const latest = data.sessions[0];
  const reading = useMemo(() => (latest ? buildScanReading(latest, data) : null), [latest, data]);

  /*
    Depth is what Premium adds here, and only depth.

    The free reading and the paid one are the same sections in the same
    order, cut off after the first couple of lines each — including the
    shortfalls, because a free report showing only the good half would be
    a more flattering report and a dishonest one. Nothing behind the gate
    corrects or qualifies a figure shown in front of it — the caveats are
    exempt from the cut by name in scan-reading.ts rather than by where
    they land — and nothing behind it is a verdict about somebody's hair,
    because nothing anywhere in this reading is.
  */
  const { isPremium } = usePremium();
  const gate = usePremiumGate();
  const gated = useMemo(
    () => (reading ? gateReading(reading, isPremium) : null),
    [reading, isPremium],
  );

  if (!latest || !reading || !gated) {
    /*
      Reachable by deep link, or if a capture failed to write. A report
      with nothing behind it should say so and offer the way back, not
      render an empty frame with a Continue button under it.
    */
    return (
      <Screen>
        <ScreenScroll clearsTabBar={false}>
          <EmptyState
            icon="camera"
            title="No photograph to report on"
            body="This report is built from your first photograph. Once it is taken, this fills in with what the device measured as you shot it."
            actionLabel="Take My First Photo"
            onAction={() => router.replace('/capture-intro')}
          />
        </ScreenScroll>
      </Screen>
    );
  }

  /*
    The sequence, numbered so each card knows when to land. Blocks that
    are not shown do not take a slot, so a report without rings does not
    leave a silent gap where they would have been.

    The "what to do next" card is the exception: it always lands, because
    the capture instruction that closes it is true of every reading,
    including the one with nothing wrong in it. A person who did
    everything right is the last person who should lose the method.
  */
  let slot = 0;
  const next = () => slot++;

  const heroSlot = next();
  const ringsSlot = reading.rings.length > 0 || reading.coverageAbsent ? next() : -1;
  const tilesSlot = reading.tiles.length > 0 ? next() : -1;
  const wellSlot = gated.strengths.length > 0 ? next() : -1;
  const gapSlot = gated.shortfalls.length > 0 ? next() : -1;
  const doSlot = next();
  const lockedSlot = gated.locked ? next() : -1;
  const closeSlot = next();

  const eyebrow = `${ANGLE_LABELS[reading.photo.angle]} · ${formatDateShort(reading.photo.capturedAt)}`;
  const balance = reading.tiles.find((t) => t.id === 'balance');
  const qualityTiles = reading.tiles.filter((t) => t.id !== 'balance');

  return (
    <Screen>
      <ScreenScroll clearsTabBar={false} contentContainerStyle={{ paddingTop: spacing.md }}>
        <Animated.View entering={FadeInDown.duration(500).springify().damping(20)}>
          <Text variant="subhead" center color="textSecondary">
            Your first reading
          </Text>
          <Text
            variant="title2"
            center
            accessibilityRole="header"
            style={{ marginTop: spacing.xs, paddingHorizontal: spacing.md }}>
            Here is what your phone measured.
          </Text>
          <Text
            variant="callout"
            center
            color="textSecondary"
            style={{ marginTop: spacing.sm, paddingHorizontal: spacing.lg }}>
            Taken from this photograph, on this device. Nothing was uploaded.
          </Text>
        </Animated.View>

        <Reveal index={heroSlot} style={{ marginTop: spacing.xxl }}>
          <ScanHero reading={reading} eyebrow={eyebrow} />
        </Reveal>

        {/* The two area readings, or the honest reason there are none. */}
        {reading.rings.length > 0 ? (
          <Reveal index={ringsSlot} style={{ marginTop: spacing.lg }}>
            <Card>
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-evenly',
                  alignItems: 'flex-start',
                  paddingVertical: spacing.sm,
                }}>
                {reading.rings.map((ring) => (
                  <ReadingRing
                    key={ring.id}
                    value={ring.value}
                    label={ring.label}
                    delay={revealDelay(ringsSlot) + 200}
                  />
                ))}
              </View>
              {/*
                The working under the rings. A ring on its own is a
                shape; the sentence beneath it is what the shape was
                measured from and — as importantly — what it is not.
                Both are written in scan-reading.ts, and the honesty
                tests sweep exactly these sentences.
              */}
              <View
                style={{
                  marginTop: spacing.lg,
                  paddingTop: spacing.lg,
                  gap: spacing.md,
                  borderTopWidth: 1,
                  borderTopColor: colors.separator,
                }}>
                {reading.rings.map((ring) => (
                  <View key={ring.id} style={{ gap: spacing.xs }}>
                    <Text variant="subhead">{ring.headline}</Text>
                    <Text variant="footnote" color="textSecondary">
                      {ring.detail}
                    </Text>
                  </View>
                ))}
              </View>
            </Card>
          </Reveal>
        ) : reading.coverageAbsent ? (
          <Reveal index={ringsSlot} style={{ marginTop: spacing.lg }}>
            <Card tone="subtle">
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Icon name="info" size={iconSize.sm} color={colors.textSecondary} />
                <Text variant="headline" style={{ flex: 1 }}>
                  {reading.coverageAbsent.headline}
                </Text>
              </View>
              <Text variant="footnote" color="textSecondary" style={{ marginTop: spacing.sm }}>
                {reading.coverageAbsent.detail}
              </Text>
            </Card>
          </Reveal>
        ) : null}

        {/* The photograph's own quality, one word each. */}
        {qualityTiles.length > 0 ? (
          <Reveal index={tilesSlot} style={{ marginTop: spacing.lg }}>
            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              {qualityTiles.map((tile) => (
                <ReadingTile key={tile.id} reading={tile} />
              ))}
            </View>
            {balance ? (
              <View style={{ marginTop: spacing.md }}>
                <ReadingTile reading={balance} style={{ flex: undefined }} />
              </View>
            ) : null}
          </Reveal>
        ) : null}

        {/* 1. Everything the device can honestly say went well. */}
        {wellSlot >= 0 ? (
          <Reveal index={wellSlot} style={{ marginTop: spacing.lg }}>
            <NoteSection icon="check" title="What’s going well" notes={gated.strengths} />
          </Reveal>
        ) : null}

        {/*
          2. The shortfalls — every one of them about the photograph, the
          record or the routine. Never about the person's hair: there is
          no honest reading of a head in a phone photograph, and this is
          the screen where inventing one would be most believed.
        */}
        {gapSlot >= 0 ? (
          <Reveal index={gapSlot} style={{ marginTop: spacing.lg }}>
            <NoteSection
              icon="info"
              title="What’s holding the record back"
              notes={gated.shortfalls}
            />
          </Reveal>
        ) : null}

        {/*
          3. One action per shortfall, each one a thing they control —
          and, under them, the instruction that holds whether or not
          anything went wrong. The card is always here: with no
          shortfalls it is that one line, which is the whole method and
          the honest answer to "what do I do now" for a set that came out
          right.
        */}
        <Reveal index={doSlot} style={{ marginTop: spacing.lg }}>
          <View
            style={{
              paddingHorizontal: spacing.xl,
              paddingVertical: spacing.md,
              borderRadius: radius.card,
              backgroundColor: colors.accentSoft,
            }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.sm,
                paddingTop: spacing.md,
              }}>
              <Icon name="leaf" size={iconSize.sm} color={colors.accent} />
              <Text variant="title3" accessibilityRole="header">
                What to do next
              </Text>
            </View>
            {gated.actions.map((action, i) => (
              <ActionRow
                key={action.id}
                action={action}
                divider={i > 0}
                onGo={(a) => {
                  if (a.link) router.push(a.link.route);
                }}
              />
            ))}

            {/*
              The one instruction that is true whatever the readings
              said, closing the card. It is not tied to a shortfall, so
              it is a note rather than an action — and it is never
              gated and never conditional, because it is the whole
              method in one line.
            */}
            <View
              style={{
                marginTop: gated.actions.length > 0 ? 0 : spacing.md,
                paddingTop: spacing.lg,
                paddingBottom: spacing.xl,
                borderTopWidth: gated.actions.length > 0 ? 1 : 0,
                borderTopColor: colors.separator,
              }}>
              <Text variant="footnote" color="textSecondary">
                {reading.nextTime[0]}
              </Text>
            </View>
          </View>
        </Reveal>

        {/*
          What is not being shown, counted honestly.

          It names how many further lines exist and what kind they are,
          and it says plainly that none of them is a judgement about hair
          — because the one thing a locked panel must never do is imply
          that the verdict is the part behind the paywall.
        */}
        {lockedSlot >= 0 && gated.locked ? (
          <Reveal index={lockedSlot} style={{ marginTop: spacing.lg }}>
            {/*
              The gate decides, as it does everywhere else in the app.
              Its entitled branch is unreachable from here — this card
              exists only while the reading is locked, and the same
              entitlement that would run it would have removed the card
              — so pressing it opens the paywall, and somebody who buys
              and comes back finds the rest of the reading already in
              place, because the screen re-renders entitled.
            */}
            <Card
              tone="subtle"
              onPress={() => gate('history', nothingLeftToOpen)}
              accessibilityLabel={`${gated.locked.headline} ${gated.locked.detail} Premium required.`}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Icon name="lock" size={iconSize.sm} color={colors.textSecondary} />
                <Text variant="headline" style={{ flex: 1 }}>
                  {gated.locked.headline}
                </Text>
                <Icon name="chevronRight" size={iconSize.sm} color={colors.textTertiary} />
              </View>
              <Text variant="footnote" color="textSecondary" style={{ marginTop: spacing.sm }}>
                {gated.locked.detail}
              </Text>
            </Card>
          </Reveal>
        ) : null}

        {/*
          Said plainly, on the screen where it matters most. Somebody
          arriving here expects a verdict about their hair, and the honest
          answer is that no photograph taken today can give them one —
          only the second can, and that is the whole proposition.
        */}
        <Animated.View
          entering={FadeIn.delay(revealDelay(closeSlot)).duration(560)}
          style={{ marginTop: spacing.xxl, paddingHorizontal: spacing.md, gap: spacing.xl }}>
          <Text variant="footnote" color="textSecondary" center>
            {reading.scope}
          </Text>
          <Button label="Continue" onPress={() => router.replace('/paywall')} />
        </Animated.View>
      </ScreenScroll>
    </Screen>
  );
}
