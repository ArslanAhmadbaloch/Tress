/**
 * The cue line — one sentence near the bottom of the video.
 *
 * The engine decides what a person should do next, and the scan is now
 * two beats rather than one circle: turn the head left and right, then
 * lower it and turn again. This shows that one sentence on a dark plate,
 * and it shows it at reading size — the person is holding the phone at
 * arm's length with their head turned away from it, and a 17pt caption
 * at that angle is a grey smudge. It is set at `title3`, the largest
 * type that still holds two lines inside the plate.
 *
 * Two kinds of change, two arrivals. A new cue inside the same beat
 * cross-fades, because it is the same voice adjusting itself. A change
 * of beat — the moment "turn left and right" becomes "lower your head" —
 * rises: the new line comes up from below into place, so someone
 * mid-turn, watching the screen out of the corner of an eye, sees that
 * the instruction has changed rather than having to re-read it to find
 * out.
 *
 * The arrival carries the news, and every departure is the same quiet
 * fade. That is deliberate rather than a shortcut: a leaving view's exit
 * animation is whichever one it was last rendered with, and at the
 * moment a beat changes the leaving line was last rendered as part of
 * the *old* beat — so an exit chosen for "this line is being replaced by
 * news" would always run one change late, on the next ordinary cue
 * inside the new beat. One exit, chosen once, cannot be out of step.
 *
 * Which beat a line belongs to is read from the line itself when the
 * screen does not say. The plate is handed a finished sentence, and the
 * scan copy's own crown lines — lower your head, turn again, and the
 * stalled-on-the-chin line — are the second beat wherever they appear.
 * A `stage` prop overrides that when the screen passes one; a line that
 * belongs to neither beat (hold still, back in frame) leaves the beat
 * where it was, so an aside never counts as news.
 *
 * No line here ever asks anyone to move closer or further away. Build 17
 * did, and "move slightly back" turned out to be an arm-stretch held
 * until the phone was satisfied. The scanner reads the head where the
 * head is; distance is not the person's problem to solve.
 *
 * Nothing here decides anything and nothing here counts anything; it is
 * a caption on an instrument.
 */

import { useState } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  LinearTransition,
  useReducedMotion,
} from 'react-native-reanimated';

import { Text } from '@/components/ui/text';
import { HAIR_SCAN_COPY } from '@/features/hair-scan/copy';
import { darkColors, motion, radius, spacing } from '@/theme';

/**
 * Which beat of the scan the line belongs to. Structurally the engine's
 * `ScanStage`: the plate does not import the engine, it only needs to
 * know when the beat has changed.
 */
export type GuidanceStage = 'sweep' | 'crown';

/**
 * The lines the scan copy uses for each beat.
 *
 * Read from the copy rather than written here, so a re-worded cue cannot
 * silently stop being recognised: if a sentence moves, this moves with
 * it. `scanning.chin` is on the list because the screen substitutes it
 * for the engine's cue when the turn has stalled with the chin band
 * still missing — it is still the second beat talking.
 */
const CROWN_LINES: readonly string[] = [
  HAIR_SCAN_COPY.cue.lowerHead,
  HAIR_SCAN_COPY.cue.turnAgain,
  HAIR_SCAN_COPY.scanning.chin,
  /*
    "Nearly done" belongs to the second beat too. Somebody whose head is
    already lowered when the stage turns over gets this cue on the
    boundary tick instead of "Lower your head", and without it here the
    beat never changed for them and the line cross-faded where it should
    have risen — the one person the transition was written for.
  */
  HAIR_SCAN_COPY.cue.almost,
];

const SWEEP_LINES: readonly string[] = [
  HAIR_SCAN_COPY.cue.turnLeftRight,
  HAIR_SCAN_COPY.scanning.hint,
];

/**
 * Which beat a finished sentence belongs to, or `null` for a line that
 * belongs to neither — an aside the plate shows without changing beat.
 */
export function beatOfLine(line: string | null): GuidanceStage | null {
  if (!line) return null;
  if (CROWN_LINES.includes(line)) return 'crown';
  if (SWEEP_LINES.includes(line)) return 'sweep';
  return null;
}

export type GuidanceProps = {
  /**
   * The cue to show, already turned into a sentence by the screen.
   * `null` hides the plate before the scan — a screen with nothing to
   * ask should not show an empty plate asking it — and during the scan
   * lets the plate fall back to the scanning line.
   */
  cue: string | null;
  /** True while the machine runs: with no cue, the plate holds the scanning line. */
  scanning: boolean;
  /**
   * The beat the scan is on, when the screen knows it. A change of beat
   * is what makes the line rise rather than cross-fade. Omitted, the
   * beat is read from the line itself, so the two-beat transition does
   * not depend on the screen passing anything new.
   */
  stage?: GuidanceStage;
  style?: StyleProp<ViewStyle>;
};

export function Guidance({ cue, scanning, stage, style }: GuidanceProps) {
  const reduceMotion = useReducedMotion();
  const line = cue ?? (scanning ? HAIR_SCAN_COPY.scanning.hint : null);

  /*
   * The beat the plate is on, and which transition the next mount uses.
   *
   * Held in state rather than derived on the fly because setting state
   * during render throws the render away: the flag has to survive into
   * the committed pass, or the entering animation chosen alongside the
   * new key would never be the one that runs. An unclassified line keeps
   * the beat it found, and the first line of all arrives without news —
   * there was nothing before it to be news against.
   */
  const [shown, setShown] = useState<{
    stage: GuidanceStage | null;
    line: string | null;
    move: boolean;
  }>({ stage: null, line: null, move: false });

  const beat = stage ?? beatOfLine(line) ?? shown.stage;
  if (shown.stage !== beat || shown.line !== line) {
    setShown({ stage: beat, line, move: shown.stage !== null && shown.stage !== beat });
  }

  const entering = shown.move
    ? FadeInDown.duration(motion.duration.slow)
    : FadeIn.duration(motion.duration.base);
  const exiting = FadeOut.duration(motion.duration.fast);

  return (
    <View
      pointerEvents="none"
      style={[{ alignItems: 'center', minHeight: 76, justifyContent: 'center' }, style]}>
      {line ? (
        <Animated.View
          key={`${beat ?? 'still'}:${line}`}
          entering={reduceMotion ? undefined : entering}
          exiting={reduceMotion ? undefined : exiting}
          layout={reduceMotion ? undefined : LinearTransition.springify().damping(24).stiffness(220)}
          accessibilityRole="text"
          accessibilityLiveRegion="polite"
          style={{
            backgroundColor: darkColors.photoScrim,
            borderRadius: radius.lg,
            paddingVertical: spacing.lg,
            paddingHorizontal: spacing.xl,
            maxWidth: 340,
          }}>
          <Text variant="title3" center style={{ color: darkColors.textOnPhoto }}>
            {line}
          </Text>
        </Animated.View>
      ) : null}
    </View>
  );
}
