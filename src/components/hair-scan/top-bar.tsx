/**
 * The scanner's top bar: help, the status readout, and the way out.
 *
 * Three pieces of glass floating over the video, in one group so the
 * material renders as one layer rather than three. The two round buttons
 * are `clear` glass — small controls over a busy backdrop should not
 * compete with it — and the pill's glass is `regular`, because it holds
 * text and needs the contrast. The capsule follows the pill's own layout
 * transition, so when the label changes the glass and the colour move as
 * one object.
 *
 * The question mark opens a short how-it-works sheet over the video. It
 * is a sheet rather than a route so the camera and the engine stay
 * mounted underneath; closing it returns to exactly the state it left.
 * The sheet lives in a system Modal so it covers the whole screen no
 * matter where the bar is mounted, and because a Modal tears its subtree
 * down the instant it is hidden, the sheet drives its own slide in and
 * out and hides the Modal only once the slide out has finished.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { GlassGroup, GlassSurface } from '@/components/ui/glass-surface';
import { Icon } from '@/components/ui/icon';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Text } from '@/components/ui/text';
import { HAIR_SCAN_COPY } from '@/features/hair-scan/copy';
import { MIN_TOUCH_TARGET, darkColors, iconSize, metrics, motion, radius, spacing } from '@/theme';

import { StatusPill, statusPillLayout, type StatusPillProps } from './status-pill';

export type TopBarProps = {
  /** The readout in the middle; `null` before the engine has anything to say. */
  status: Pick<StatusPillProps, 'tone' | 'label' | 'icon'> | null;
  onClose: () => void;
  /** Accessibility names for the two round buttons, from the scan copy. */
  helpLabel: string;
  closeLabel: string;
  style?: StyleProp<ViewStyle>;
};

const BUTTON = MIN_TOUCH_TARGET;

export function TopBar({ status, onClose, helpLabel, closeLabel, style }: TopBarProps) {
  const insets = useSafeAreaInsets();
  const [helpOpen, setHelpOpen] = useState(false);

  const openHelp = useCallback(() => setHelpOpen(true), []);
  const closeHelp = useCallback(() => setHelpOpen(false), []);

  return (
    <>
      <GlassGroup
        style={[
          {
            position: 'absolute',
            top: insets.top + spacing.sm,
            left: metrics.floatingInset,
            right: metrics.floatingInset,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          },
          style,
        ]}>
        <RoundGlassButton icon="help" label={helpLabel} onPress={openHelp} />

        <View style={{ flex: 1, alignItems: 'center', paddingHorizontal: spacing.sm }}>
          {status ? (
            <Animated.View
              entering={FadeIn.duration(motion.duration.base)}
              exiting={FadeOut.duration(motion.duration.fast)}
              layout={statusPillLayout()}>
              <GlassSurface over="dark" borderRadius={radius.pill} style={{ padding: spacing.xs }}>
                <StatusPill tone={status.tone} label={status.label} icon={status.icon} />
              </GlassSurface>
            </Animated.View>
          ) : null}
        </View>

        <RoundGlassButton icon="close" label={closeLabel} onPress={onClose} />
      </GlassGroup>

      {helpOpen ? <HelpSheet onDismissed={closeHelp} /> : null}
    </>
  );
}

/** A circular piece of clear glass with one glyph in it. */
function RoundGlassButton({
  icon,
  label,
  onPress,
}: {
  icon: 'help' | 'close';
  label: string;
  onPress: () => void;
}) {
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.92}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{ width: BUTTON, height: BUTTON }}>
      <GlassSurface
        over="dark"
        variant="clear"
        interactive
        borderRadius={radius.pill}
        style={{ width: BUTTON, height: BUTTON, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={iconSize.md} color={darkColors.textOnPhoto} />
      </GlassSurface>
    </PressableScale>
  );
}

/**
 * How it works, in a few lines, over the video.
 *
 * The lines are the instruction sheet's own three steps and its privacy
 * line, so this can never drift from what the person already read; it
 * repeats them rather than adding to them.
 *
 * Mounted to open. One shared value, 0 → 1, slides the sheet up and fades
 * the scrim in; a close runs it back to 0 and only then reports
 * `onDismissed`, at which point the caller unmounts it. A second close
 * during the slide out is ignored. Under Reduce Motion both ends are cuts.
 */
function HelpSheet({ onDismissed }: { onDismissed: () => void }) {
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const reduceMotion = useReducedMotion();

  const help = {
    title: HAIR_SCAN_COPY.ready.help,
    lines: [
      ...HAIR_SCAN_COPY.instructions.steps.map((step) => `${step.title}. ${step.body}`),
      HAIR_SCAN_COPY.instructions.privacy,
    ],
    closeLabel: HAIR_SCAN_COPY.error.close,
  };

  const progress = useSharedValue(0);
  const closing = useSharedValue(false);

  useEffect(() => {
    progress.set(reduceMotion ? 1 : withSpring(1, motion.spring.gentle));
  }, [progress, reduceMotion]);

  const close = useCallback(() => {
    if (closing.get()) return;
    closing.set(true);
    progress.set(
      withTiming(
        0,
        { duration: reduceMotion ? 0 : motion.duration.slow, easing: Easing.in(Easing.cubic) },
        () => {
          runOnJS(onDismissed)();
        },
      ),
    );
  }, [closing, onDismissed, progress, reduceMotion]);

  const scrim = useAnimatedStyle(() => ({ opacity: progress.get() }));
  const sheet = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.get()) * screenHeight }],
  }));

  return (
    <Modal visible transparent animationType="none" onRequestClose={close}>
      <Animated.View
        style={[
          { flex: 1, backgroundColor: darkColors.scrim, justifyContent: 'flex-end' },
          scrim,
        ]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={help.closeLabel}
          onPress={close}
          style={{ flex: 1 }}
        />
        <Animated.View
          accessibilityViewIsModal
          style={[
            {
              backgroundColor: darkColors.surface,
              borderTopLeftRadius: radius.xl,
              borderTopRightRadius: radius.xl,
              paddingHorizontal: spacing.xxl,
              paddingTop: spacing.xxl,
              paddingBottom: insets.bottom + spacing.xl,
              gap: spacing.lg,
            },
            sheet,
          ]}>
          <Text variant="title3" style={{ color: darkColors.text }}>
            {help.title}
          </Text>
          <View style={{ gap: spacing.md }}>
            {help.lines.map((line) => (
              <View key={line} style={{ flexDirection: 'row', gap: spacing.md }}>
                <View
                  style={{
                    width: spacing.sm,
                    height: spacing.sm,
                    borderRadius: radius.pill,
                    marginTop: spacing.sm,
                    backgroundColor: darkColors.accent,
                  }}
                />
                <Text variant="callout" style={{ flex: 1, color: darkColors.textSecondary }}>
                  {line}
                </Text>
              </View>
            ))}
          </View>
          <Button label={help.closeLabel} variant="secondary" onPress={close} />
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}
