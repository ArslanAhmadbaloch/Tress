/**
 * The corrective line — the only thing the scan says that is not a step.
 *
 * The instruction now lives at the top of the screen, in the step
 * header: look straight, turn right, turn left, look down. That leaves
 * this plate one job, and it is the smaller and more important one —
 * saying the handful of things that are true regardless of which step
 * somebody is on. Come back to the camera. Hold still. Slower. Find a
 * brighter spot. Five corrections in all, and they are the engine's to
 * decide; the screen turns the engine's cue into a sentence from the
 * scan copy and hands it over finished.
 *
 * With nothing to correct, the plate is not there. It used to carry the
 * running instruction as well, which meant it was always on screen and
 * therefore easy to stop seeing. A plate that appears only when
 * something needs saying gets read.
 *
 * It is set at `title3` because the reader is at arm's length with their
 * head turned away from the phone, and a 17pt caption at that angle is a
 * grey smudge. One arrival, one departure, both quiet: a correction is
 * an aside, not news, and the arrow above is what carries the urgency.
 *
 * No line here ever asks anyone to move closer or further away. Build 17
 * did, and "move slightly back" turned out to be an arm-stretch held
 * until the phone was satisfied. The scanner reads the head where the
 * head is; distance is not the person's problem to solve.
 *
 * Nothing here decides anything and nothing here counts anything; it is
 * a caption on an instrument, and it writes no words of its own.
 */

import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
  useReducedMotion,
} from 'react-native-reanimated';

import { Text } from '@/components/ui/text';
import type { ScanCue } from '@/features/hair-scan/types';
import { darkColors, motion, radius, spacing } from '@/theme';

/**
 * The corrections the scan can ask for — the engine's own list, under the
 * name the chrome uses for it.
 *
 * It is an alias rather than a copy on purpose: a plate whose idea of the
 * corrections could drift from the engine's would be a plate that quietly
 * stopped showing one of them. The plate itself is handed a finished
 * sentence and never reads this; it is here for a caller that wants to
 * name what it is showing. There is deliberately nothing about distance,
 * and none of them is a failure — every one is something the person can
 * do in half a second.
 */
export type CorrectiveCue = ScanCue;

export type GuidanceProps = {
  /**
   * The correction to show, already turned into a sentence by the
   * screen. `null` — the ordinary case — shows nothing at all.
   */
  cue: string | null;
  style?: StyleProp<ViewStyle>;
};

export function Guidance({ cue, style }: GuidanceProps) {
  const reduceMotion = useReducedMotion();

  return (
    <View
      pointerEvents="none"
      style={[{ alignItems: 'center', minHeight: 76, justifyContent: 'center' }, style]}>
      {cue ? (
        <Animated.View
          key={cue}
          entering={reduceMotion ? undefined : FadeIn.duration(motion.duration.base)}
          exiting={reduceMotion ? undefined : FadeOut.duration(motion.duration.fast)}
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
            {cue}
          </Text>
        </Animated.View>
      ) : null}
    </View>
  );
}
