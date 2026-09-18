/**
 * The instruction sheet — three things to do before the scan runs.
 *
 * A pale sheet rising over the darkened ground before the camera opens.
 * It says three things and stops, and the three are what a person has to
 * do rather than what the machine does: take the glasses off and find
 * light, press Start, then follow the arrows. The scan itself is one
 * continuous movement of the head and the screen talks them through it
 * step by step while it runs, so the sheet's job is only to get somebody
 * to the Start button knowing they will be told what to do.
 *
 * The words are the scan copy's — this file never writes its own, and it
 * shows exactly the steps the copy declares, so a re-worded or re-counted
 * list needs no change here. Each row carries a portrait thumbnail of the
 * scanner in that state, drawn from the scanner's own parts until frames
 * captured on a device replace them (see `instruction-thumbs.tsx`), with
 * its number on a dark disc at the tile's corner, so the eye reads the
 * three as one sequence rather than as a list of requirements.
 *
 * Two slots wait for real device material: `thumbnails` for stills, and
 * `footage` for the short silent loops the owner will film. The stills
 * are live — hand one over and it replaces that row's drawing. The
 * footage is a shape, not a feature: it reaches the tile and stops
 * there, because this build has no video player in it (see the note in
 * `instruction-thumbs.tsx` for the few lines that turn it on). A step
 * left out of either keeps its drawing, so the three can be swapped in
 * one at a time as they are captured.
 *
 * It rises on the sheet spring the rest of the app uses — settled rather
 * than bounced — and leaves the same way. Under Reduce Motion it appears.
 */

import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  SlideInDown,
  SlideOutDown,
  useReducedMotion,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Text } from '@/components/ui/text';
import { HAIR_SCAN_COPY } from '@/features/hair-scan/copy';
import { MIN_TOUCH_TARGET, darkColors, iconSize, motion, radius, spacing, useTheme } from '@/theme';

import {
  INSTRUCTION_THUMB_HEIGHT,
  INSTRUCTION_THUMB_WIDTH,
  InstructionThumb,
  type InstructionStep,
  type InstructionThumbProps,
} from './instruction-thumbs';

/**
 * Real thumbnails of the scanner, one per step, captured on a device.
 * Any step left out keeps its drawn tile, so the three can be swapped in
 * one at a time as they are captured.
 */
export type InstructionThumbnails = Partial<
  Record<InstructionStep, NonNullable<InstructionThumbProps['image']>>
>;

/**
 * Short silent loops of the scanner, one per step, filmed on a device.
 * Carried through to the tiles now so the footage has somewhere to
 * arrive; the tile's own note says what still has to be added before one
 * plays, and until then a step with footage and no still keeps its
 * drawing.
 */
export type InstructionFootage = Partial<
  Record<InstructionStep, NonNullable<InstructionThumbProps['video']>>
>;

export type InstructionSheetProps = {
  /** Mounted while true; the sheet slides out when it turns false. */
  visible: boolean;
  onContinue: () => void;
  onClose: () => void;
  /** See `InstructionThumbnails`. Omit to draw every tile. */
  thumbnails?: InstructionThumbnails;
  /** See `InstructionFootage`. Omit until the loops are filmed. */
  footage?: InstructionFootage;
  style?: StyleProp<ViewStyle>;
};

/** The numbered disc at each tile's corner. */
const NUMBER_DISC = 28;

/**
 * Whether a row has a tile drawn for it.
 *
 * The tiles are drawings of three particular states of the scanner, so
 * there are three of them. The rows come from the copy, and if the copy
 * ever declares a fourth the row still renders — with its number, its
 * title and its line, and no picture — rather than the sheet breaking or
 * quietly dropping it.
 */
function thumbFor(index: number): InstructionStep | null {
  return index === 0 || index === 1 || index === 2 ? index : null;
}

export function InstructionSheet({
  visible,
  onContinue,
  onClose,
  thumbnails,
  footage,
  style,
}: InstructionSheetProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const copy = HAIR_SCAN_COPY.instructions;

  if (!visible) return null;

  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeIn.duration(motion.duration.base)}
      exiting={reduceMotion ? undefined : FadeOut.duration(motion.duration.base)}
      style={[
        {
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          backgroundColor: darkColors.scrim,
          justifyContent: 'flex-end',
        },
        style,
      ]}>
      <Animated.View
        entering={
          reduceMotion ? undefined : SlideInDown.springify().damping(24).stiffness(180).mass(1)
        }
        exiting={reduceMotion ? undefined : SlideOutDown.duration(motion.duration.slow)}
        accessibilityViewIsModal
        style={{
          backgroundColor: colors.surface,
          borderTopLeftRadius: radius.xl,
          borderTopRightRadius: radius.xl,
          paddingHorizontal: spacing.xxl,
          paddingTop: spacing.xl,
          paddingBottom: insets.bottom + spacing.xl,
          gap: spacing.xxl,
        }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <Text variant="title2" style={{ flex: 1 }}>
            {copy.title}
          </Text>
          <PressableScale
            onPress={onClose}
            scaleTo={0.9}
            accessibilityRole="button"
            accessibilityLabel={HAIR_SCAN_COPY.ready.close}
            style={{
              width: MIN_TOUCH_TARGET,
              height: MIN_TOUCH_TARGET,
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: -spacing.md,
            }}>
            <Icon name="close" size={iconSize.md} color={colors.text} />
          </PressableScale>
        </View>

        <View style={{ gap: spacing.xl }}>
          {copy.steps.map(({ title, body }, index) => {
            const step = thumbFor(index);
            return (
              <View
                key={title}
                accessible
                accessibilityLabel={`${index + 1}. ${title}. ${body}`}
                style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
                {/*
                  The tile's box is reserved whether or not there is a
                  tile to put in it. The numbered disc is positioned
                  against this box, so a row the drawings do not cover —
                  a fourth step, were the copy ever to declare one —
                  keeps its number in the same place and its text in the
                  same column, instead of collapsing the box to nothing
                  and hanging the number off the edge of the sheet.
                */}
                <View
                  style={{
                    marginLeft: spacing.sm,
                    width: INSTRUCTION_THUMB_WIDTH,
                    height: INSTRUCTION_THUMB_HEIGHT,
                  }}>
                  {step === null ? null : (
                    <InstructionThumb
                      step={step}
                      image={thumbnails?.[step]}
                      video={footage?.[step]}
                    />
                  )}
                  <View
                    style={{
                      position: 'absolute',
                      top: -spacing.sm,
                      left: -spacing.sm,
                      width: NUMBER_DISC,
                      height: NUMBER_DISC,
                      borderRadius: radius.pill,
                      backgroundColor: colors.text,
                      borderWidth: 2,
                      borderColor: colors.surface,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                    <Text variant="subhead" style={{ color: colors.surface }}>
                      {index + 1}
                    </Text>
                  </View>
                </View>
                <View style={{ flex: 1, gap: spacing.xxs }}>
                  <Text variant="headline">{title}</Text>
                  <Text variant="callout" color="textSecondary">
                    {body}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>

        <View style={{ gap: spacing.md }}>
          <Button label={copy.cta} variant="secondary" onPress={onContinue} />
          <Text variant="footnote" color="textTertiary" center>
            {copy.privacy}
          </Text>
        </View>
      </Animated.View>
    </Animated.View>
  );
}
