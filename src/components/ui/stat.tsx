import { useEffect, useRef, useState } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { Icon, type IconName } from './icon';
import { Text } from './text';
import { iconSize, useTheme } from '@/theme';

const COUNT_UP_MS = 550;

/** Diameter of the filled well a tile's glyph sits in. */
const GLYPH_WELL = 36;

/**
 * A number that counts up when it changes.
 *
 * Plain <Text> driven from JS, deliberately. The obvious "fast" version
 * drives an uneditable TextInput's `text` from the UI thread, but that
 * path also carries `defaultValue`, which React re-applies on the next
 * re-render and silently reverts the displayed number — a stat tile can
 * end up disagreeing with the data it was given.
 *
 * That trade is only worth making for values that change every frame.
 * These change when a photo session is saved, so a handful of setState
 * calls over half a second costs nothing, and the number is always
 * guaranteed to land on exactly `value`.
 */
export function AnimatedNumber({
  value,
  suffix = '',
  variant = 'stat',
  color = 'text',
}: {
  value: number;
  suffix?: string;
  variant?: 'stat' | 'display' | 'title2' | 'metric';
  color?: 'text' | 'accent' | 'textOnAccent';
}) {
  const reduceMotion = useReducedMotion();
  const frame = useRef<number | null>(null);
  const from = useRef(value);

  // `null` means "not animating", and the real prop is displayed. Keeping
  // the truth in the prop rather than mirroring it into state is what
  // makes it impossible for the tile to drift from its data: the worst a
  // broken animation can do is skip, never show a stale number.
  const [tween, setTween] = useState<number | null>(null);
  const shown = tween ?? value;

  useEffect(() => {
    const origin = from.current;
    from.current = value;

    if (reduceMotion || origin === value) return;

    const start = Date.now();
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / COUNT_UP_MS);
      // Ease out, so the number decelerates into its final value.
      const eased = 1 - (1 - t) ** 3;

      if (t < 1) {
        setTween(Math.round(origin + (value - origin) * eased));
        frame.current = requestAnimationFrame(tick);
      } else {
        // Hand display back to the prop rather than setting a final number.
        setTween(null);
      }
    };

    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [value, reduceMotion]);

  return (
    <Text variant={variant} color={color} numberOfLines={1}>
      {shown}
      {suffix}
    </Text>
  );
}

/** Compact metric tile used on the dashboard. */
export function StatTile({
  icon,
  label,
  value,
  suffix,
  caption,
  tone = 'default',
  style,
}: {
  icon: IconName;
  label: string;
  value: number | string;
  suffix?: string;
  caption?: string;
  tone?: 'default' | 'accent';
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, radius, spacing, shadow } = useTheme();
  const isAccent = tone === 'accent';

  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${value}${suffix ?? ''}${caption ? `, ${caption}` : ''}`}
      style={[
        {
          flex: 1,
          padding: spacing.lg,
          borderRadius: radius.card,
          backgroundColor: isAccent ? colors.accentSoft : colors.surface,
          gap: spacing.md,
        },
        /*
          No border. The tile floats on the same soft shadow as every
          other card; the outline it used to carry was the one thing on
          the dashboard that still looked drawn rather than placed.
        */
        shadow.soft,
        style,
      ]}>
      {/*
        The glyph sits in a quiet round well rather than loose in the
        corner. A bare icon beside a large number reads as a bullet; a
        ringed one reads as the metric's mark. The well is filled, not
        stroked, because a stroked ring competes with the number.
      */}
      <View
        style={{
          width: GLYPH_WELL,
          height: GLYPH_WELL,
          borderRadius: radius.pill,
          backgroundColor: isAccent ? colors.surface : colors.fill,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <Icon
          name={icon}
          size={iconSize.sm}
          color={isAccent ? colors.accent : colors.textSecondary}
        />
      </View>

      <View>
        {typeof value === 'number' ? (
          <AnimatedNumber
            value={value}
            suffix={suffix}
            color={isAccent ? 'accent' : 'text'}
          />
        ) : (
          <Text
            variant="stat"
            color={isAccent ? 'accent' : 'text'}
            // Tiles are a third of the screen; a long string must shrink
            // rather than wrap mid-word.
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.6}>
            {value}
            {suffix}
          </Text>
        )}
        <Text variant="footnote" color="textSecondary" style={{ marginTop: spacing.xs }}>
          {label}
        </Text>
        {caption ? (
          <Text variant="caption" color="textTertiary" style={{ marginTop: 2 }}>
            {caption}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/** Horizontal progress track, used for adherence and capture progress. */
export function ProgressBar({
  progress,
  tone = 'accent',
  height = 8,
}: {
  /** 0 to 1. */
  progress: number;
  tone?: 'accent' | 'neutral';
  height?: number;
}) {
  const { colors, radius } = useTheme();
  const clamped = Math.max(0, Math.min(1, progress));

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
      style={{
        height,
        borderRadius: radius.pill,
        backgroundColor: colors.fill,
        overflow: 'hidden',
      }}>
      <View
        style={{
          width: `${clamped * 100}%`,
          height: '100%',
          borderRadius: radius.pill,
          backgroundColor: tone === 'accent' ? colors.accent : colors.textTertiary,
        }}
      />
    </View>
  );
}
