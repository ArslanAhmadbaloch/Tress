/**
 * Segmented control, in the same language as the floating tab bar: a
 * glass pill where the selected item sits in a pool of soft green light
 * rather than on a filled chip. The light glides between items on the
 * app's snappy spring; with Reduce Motion it moves without animating.
 *
 * Used for every exclusive choice in the app — the Journey sections, and
 * the settings that pick one of three or four values — so those choices
 * all look and behave like one control rather than several.
 */

import { useEffect, useId, useState, type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';

import { GlassSurface } from './glass-surface';
import { PressableScale } from './pressable-scale';
import { Text } from './text';
import { splitAlpha, useTheme } from '@/theme';

const SEG_PAD = 4;
const SEG_HEIGHT = 44;

export function SegmentedTabs<T extends string>({
  options,
  value,
  onChange,
  surface = 'glass',
  style,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
  /**
   * `glass` floats the control over a screen's background, where it is
   * chrome. `fill` is the opaque track for a control that lives *inside* a
   * content card: glass belongs to the functional layer above the content,
   * so a card must never have a pane of it sitting in the middle.
   */
  surface?: 'glass' | 'fill';
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, radius, shadow, motion } = useTheme();
  const reduceMotion = useReducedMotion();
  const uid = useId().replace(/[^A-Za-z0-9]/g, '');
  const [width, setWidth] = useState(0);

  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const segment = width > 0 ? (width - SEG_PAD * 2) / options.length : 0;

  const x = useSharedValue(0);
  useEffect(() => {
    if (!segment) return;
    const target = index * segment;
    x.set(reduceMotion ? target : withSpring(target, motion.spring.snappy));
  }, [index, segment, reduceMotion, x, motion]);

  const glowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));
  const glow = splitAlpha(colors.tabGlow);

  const track = (children: ReactNode) =>
    surface === 'glass' ? (
      <GlassSurface variant="regular" borderRadius={radius.pill} style={[shadow.soft, style]}>
        {children}
      </GlassSurface>
    ) : (
      <View
        style={[
          { backgroundColor: colors.fill, borderRadius: radius.pill, overflow: 'hidden' },
          style,
        ]}>
        {children}
      </View>
    );

  return track(
    <>
      <View
        accessibilityRole="tablist"
        onLayout={(e) => setWidth(Math.floor(e.nativeEvent.layout.width))}
        style={{ flexDirection: 'row', padding: SEG_PAD }}>
        {segment > 0 ? (
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: 'absolute',
                top: SEG_PAD,
                left: SEG_PAD,
                width: segment,
                height: SEG_HEIGHT,
              },
              glowStyle,
            ]}>
            <Svg width={segment} height={SEG_HEIGHT}>
              <Defs>
                <RadialGradient id={`seg${uid}`} cx="50%" cy="50%" r="50%">
                  <Stop offset="0" stopColor={glow.color} stopOpacity={glow.opacity} />
                  <Stop offset="0.62" stopColor={glow.color} stopOpacity={glow.opacity * 0.85} />
                  <Stop offset="1" stopColor={glow.color} stopOpacity={0} />
                </RadialGradient>
              </Defs>
              <Ellipse
                cx={segment / 2}
                cy={SEG_HEIGHT / 2}
                rx={segment / 2}
                ry={SEG_HEIGHT / 2}
                fill={`url(#seg${uid})`}
              />
            </Svg>
          </Animated.View>
        ) : null}

        {options.map((option) => {
          const selected = option.value === value;
          return (
            <PressableScale
              key={option.value}
              onPress={() => onChange(option.value)}
              haptic="light"
              scaleTo={0.94}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={option.label}
              style={{
                flex: 1,
                height: SEG_HEIGHT,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              {/* The tab bar's own label style. No shrink-to-fit: inside the
                  glass pill iOS sizes text on a first, near-zero-width pass
                  and never grows it back. */}
              <Text
                variant="caption"
                numberOfLines={1}
                style={{
                  color: selected ? colors.text : colors.textSecondary,
                  fontWeight: selected ? '600' : '500',
                }}>
                {option.label}
              </Text>
            </PressableScale>
          );
        })}
      </View>
    </>,
  );
}
