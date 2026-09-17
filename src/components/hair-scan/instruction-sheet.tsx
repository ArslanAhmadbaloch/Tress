/**
 * The instruction sheet — three steps, one scan.
 *
 * A pale sheet rising over the darkened ground before the camera opens.
 * It says three things and stops: find light, hold the head straight and
 * press Start, then turn slowly until the ring closes. The rows are
 * numbered so the eye reads them as one sequence rather than as a list
 * of requirements, and the third row's glyph is a small copy of the scan
 * ring itself, half lit, so the person has already seen the dial they
 * are about to fill.
 *
 * It rises on the sheet spring the rest of the app uses — settled rather
 * than bounced — and leaves the same way. Under Reduce Motion it appears.
 */

import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Ellipse, Line } from 'react-native-svg';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Text } from '@/components/ui/text';
import { HAIR_SCAN_COPY } from '@/features/hair-scan/copy';
import { MIN_TOUCH_TARGET, darkColors, iconSize, motion, radius, spacing, useTheme } from '@/theme';

export type InstructionSheetProps = {
  /** Mounted while true; the sheet slides out when it turns false. */
  visible: boolean;
  onContinue: () => void;
  onClose: () => void;
  style?: StyleProp<ViewStyle>;
};

/** The glyph tile beside each step. */
const TILE_W = 64;
const TILE_H = 80;

export function InstructionSheet({ visible, onContinue, onClose, style }: InstructionSheetProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const copy = HAIR_SCAN_COPY.instructions;

  if (!visible) return null;

  return (
    <Animated.View
      entering={FadeIn.duration(motion.duration.base)}
      exiting={FadeOut.duration(motion.duration.base)}
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
        entering={SlideInDown.springify().damping(24).stiffness(180).mass(1)}
        exiting={SlideOutDown.duration(motion.duration.slow)}
        accessibilityViewIsModal
        style={{
          backgroundColor: colors.surface,
          borderTopLeftRadius: radius.xl,
          borderTopRightRadius: radius.xl,
          paddingHorizontal: spacing.xxl,
          paddingTop: spacing.xxl,
          paddingBottom: insets.bottom + spacing.xl,
          gap: spacing.xxl,
        }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
          <View style={{ flex: 1, gap: spacing.xs }}>
            <Text variant="title2">{copy.title}</Text>
            <Text variant="callout" color="textSecondary">
              {copy.body}
            </Text>
          </View>
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
              marginTop: -spacing.sm,
            }}>
            <Icon name="close" size={iconSize.md} color={colors.text} />
          </PressableScale>
        </View>

        <View style={{ gap: spacing.xl }}>
          {copy.steps.map((step, index) => (
            <View
              key={step.title}
              accessible
              accessibilityLabel={`${index + 1}. ${step.title}. ${step.body}`}
              style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
              <View>
                <StepTile index={index} />
                <View
                  style={{
                    position: 'absolute',
                    top: -spacing.sm,
                    left: -spacing.sm,
                    width: 28,
                    height: 28,
                    borderRadius: radius.pill,
                    backgroundColor: colors.text,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                  <Text variant="caption" style={{ color: colors.surface }}>
                    {index + 1}
                  </Text>
                </View>
              </View>
              <View style={{ flex: 1, gap: spacing.xxs }}>
                <Text variant="headline">{step.title}</Text>
                <Text variant="callout" color="textSecondary">
                  {step.body}
                </Text>
              </View>
            </View>
          ))}
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

/**
 * The three glyphs, drawn rather than photographed.
 *
 * Light; a head held straight inside the frame; and the ring, a third of
 * the way lit. All on the scanner's own dark ground so the tiles preview
 * the mode the person is about to enter.
 */
function StepTile({ index }: { index: number }) {
  const { colors } = useTheme();
  const cx = TILE_W / 2;
  const cy = TILE_H / 2;

  return (
    <View
      style={{
        width: TILE_W,
        height: TILE_H,
        borderRadius: radius.md,
        backgroundColor: darkColors.background,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}>
      {index === 0 ? (
        <Icon name="sun" size={iconSize.xl} color={darkColors.warning} />
      ) : (
        <Svg width={TILE_W} height={TILE_H}>
          {index === 2 ? (
            <MiniRing cx={cx} cy={cy} rx={22} ry={30} lit={colors.success} />
          ) : (
            <Ellipse
              cx={cx}
              cy={cy}
              rx={22}
              ry={30}
              stroke={darkColors.textOnPhoto}
              strokeOpacity={0.55}
              strokeWidth={1.5}
              fill="none"
            />
          )}
          {/* The head: a face-sized oval, centred, upright. */}
          <Ellipse
            cx={cx}
            cy={cy - 2}
            rx={11}
            ry={14}
            fill={darkColors.textOnPhoto}
            fillOpacity={index === 2 ? 0.5 : 0.85}
          />
          <Circle cx={cx} cy={cy + 24} r={16} fill={darkColors.textOnPhoto} fillOpacity={0.25} />
        </Svg>
      )}
    </View>
  );
}

/** The scan ring in miniature: 36 ticks on an oval, the first third green. */
function MiniRing({
  cx,
  cy,
  rx,
  ry,
  lit,
}: {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  lit: string;
}) {
  const ticks = 36;
  return (
    <>
      {Array.from({ length: ticks }, (_, k) => {
        const theta = ((k + 0.5) / ticks) * Math.PI * 2 - Math.PI / 2;
        const cos = Math.cos(theta);
        const sin = Math.sin(theta);
        const nx = ry * cos;
        const ny = rx * sin;
        const norm = Math.hypot(nx, ny) || 1;
        const ux = (nx / norm) * 2.5;
        const uy = (ny / norm) * 2.5;
        const px = cx + rx * cos;
        const py = cy + ry * sin;
        const green = k < ticks / 3;
        return (
          <Line
            key={k}
            x1={px - ux}
            y1={py - uy}
            x2={px + ux}
            y2={py + uy}
            stroke={green ? lit : darkColors.textOnPhoto}
            strokeOpacity={green ? 1 : 0.5}
            strokeWidth={1.5}
            strokeLinecap="round"
          />
        );
      })}
    </>
  );
}
