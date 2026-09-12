/**
 * GlassOrb — a bead of green-tinted glass that holds a metric's glyph.
 *
 * Drawn in SVG rather than with the system glass material, on purpose.
 * Real Liquid Glass belongs to the navigation and control layer; these
 * sit inside content cards, where a live material would be both against
 * Apple's guidance and nearly invisible against a white surface. What the
 * orb borrows from the material is its optics: light from the upper left,
 * a lit rim, a specular glint, and light gathering at the lower edge the
 * way a real glass bead focuses it.
 *
 * With `ring`, a progress arc wraps the orb, starting at 12 o'clock and
 * running clockwise. It is decorative; the tile states the number.
 */

import { useEffect, useId, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  LinearGradient,
  RadialGradient,
  Stop,
} from 'react-native-svg';

import { motion, splitAlpha, useTheme } from '@/theme';

/**
 * The arc is a dashed circle rather than a drawn path, so its length can be
 * animated on the UI thread: a ring that fills is a ring you believe, and a
 * ring that simply appears at 62% is a number wearing a costume.
 */
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** Stop props with the colour's own alpha folded into stopOpacity. */
function stop(color: string, opacity = 1) {
  const split = splitAlpha(color);
  return { stopColor: split.color, stopOpacity: split.opacity * opacity };
}

const ARC_THICKNESS = 3.5;
const ARC_GAP = 2;

export function GlassOrb({
  size = 42,
  progress = 0,
  ring = true,
  tone = 'green',
  emphasis = 'normal',
  children,
  style,
}: {
  /** Diameter of the glass body, excluding the ring. */
  size?: number;
  /** 0-1, drives the arc. */
  progress?: number;
  ring?: boolean;
  /** Green for metrics and tasks; neutral for plain navigation. */
  tone?: 'green' | 'neutral';
  /**
   * 'strong' pushes the optics for a primary control: a brighter glint, a
   * second inner rim of light, a stronger caustic and a deeper shadow.
   */
  emphasis?: 'normal' | 'strong';
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, shadow } = useTheme();
  const glass =
    tone === 'neutral'
      ? {
          core: colors.orbNeutralCore,
          mid: colors.orbNeutralMid,
          edge: colors.orbNeutralEdge,
          rimBottom: colors.orbNeutralRimBottom,
        }
      : {
          core: colors.orbCore,
          mid: colors.orbMid,
          edge: colors.orbEdge,
          rimBottom: colors.orbRimBottom,
        };
  // Gradient ids must be unique per instance; useId's colons are not
  // valid inside url(#…) on every renderer.
  const uid = useId().replace(/[^A-Za-z0-9]/g, '');
  const id = (name: string) => `${name}${uid}`;

  const strong = emphasis === 'strong';
  const pad = ring ? ARC_GAP + ARC_THICKNESS : 0;
  const box = size + pad * 2;
  const c = box / 2;
  const r = size / 2;
  const ra = r + ARC_GAP + ARC_THICKNESS / 2;
  const p = Math.max(0, Math.min(1, progress));

  const circumference = 2 * Math.PI * ra;
  const reduceMotion = useReducedMotion();
  const fill = useSharedValue(reduceMotion ? p : 0);

  useEffect(() => {
    fill.set(reduceMotion ? p : withSpring(p, motion.spring.gentle));
  }, [p, reduceMotion, fill]);

  const arcProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - fill.get()),
    // A zero-length arc with a round cap still draws a dot at 12 o'clock.
    opacity: fill.get() < 0.001 ? 0 : 1,
  }));

  return (
    <View
      style={[
        { width: box, height: box },
        // Without a ring there is no room in the drawing for a contact
        // shadow, so the view casts one instead.
        !ring && [{ borderRadius: box / 2 }, strong ? shadow.lifted : shadow.soft],
        style,
      ]}>
      <Svg width={box} height={box} style={StyleSheet.absoluteFill} accessible={false}>
        <Defs>
          <RadialGradient id={id('shadow')} cx="50%" cy="50%" r="50%">
            <Stop offset="0.55" {...stop(colors.orbShadow, 1)} />
            <Stop offset="1" {...stop(colors.orbShadow, 0)} />
          </RadialGradient>
          <RadialGradient id={id('body')} cx="40%" cy="28%" fx="40%" fy="28%" r="80%">
            <Stop offset="0" {...stop(glass.core)} />
            <Stop offset="0.55" {...stop(glass.mid)} />
            <Stop offset="1" {...stop(glass.edge)} />
          </RadialGradient>
          <RadialGradient id={id('caustic')} cx="50%" cy="50%" r="50%">
            <Stop offset="0" {...stop(colors.orbGlint, 0.8)} />
            <Stop offset="1" {...stop(colors.orbGlint, 0)} />
          </RadialGradient>
          <LinearGradient id={id('glint')} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" {...stop(colors.orbGlint, 1)} />
            <Stop offset="1" {...stop(colors.orbGlint, 0)} />
          </LinearGradient>
          <LinearGradient id={id('rim')} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" {...stop(colors.orbRimTop)} />
            <Stop offset="1" {...stop(glass.rimBottom)} />
          </LinearGradient>
          <LinearGradient id={id('innerRim')} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" {...stop(colors.orbGlint, 0.95)} />
            <Stop offset="0.5" {...stop(colors.orbGlint, 0)} />
          </LinearGradient>
          <LinearGradient
            id={id('arc')}
            gradientUnits="userSpaceOnUse"
            x1={c}
            y1={c - ra}
            x2={c + ra}
            y2={c + ra * 0.3}>
            <Stop offset="0" {...stop(colors.arcStart)} />
            <Stop offset="1" {...stop(colors.arcEnd)} />
          </LinearGradient>
        </Defs>

        {ring ? (
          <>
            {/* Contact shadow, offset down so the bead sits on the card. */}
            <Ellipse
              cx={c}
              cy={c + r * 0.42}
              rx={r * 0.92}
              ry={r * 0.72}
              fill={`url(#${id('shadow')})`}
            />
            {/* A barely-there track, so an empty ring still reads as a dial. */}
            <Circle
              cx={c}
              cy={c}
              r={ra}
              stroke={colors.arcStart}
              strokeOpacity={0.18}
              strokeWidth={ARC_THICKNESS}
              fill="none"
            />
            {/* Rotated so the dash starts at twelve o'clock. */}
            <AnimatedCircle
              cx={c}
              cy={c}
              r={ra}
              stroke={`url(#${id('arc')})`}
              strokeWidth={ARC_THICKNESS}
              strokeLinecap="round"
              strokeDasharray={circumference}
              fill="none"
              transform={`rotate(-90 ${c} ${c})`}
              animatedProps={arcProps}
            />
          </>
        ) : null}

        {/* The glass body. */}
        <Circle cx={c} cy={c} r={r} fill={`url(#${id('body')})`} />
        {/* Light focused at the lower edge. */}
        <Ellipse
          cx={c}
          cy={c + r * (strong ? 0.56 : 0.58)}
          rx={r * (strong ? 0.68 : 0.6)}
          ry={r * (strong ? 0.32 : 0.26)}
          fill={`url(#${id('caustic')})`}
        />
        {/* Specular glint. */}
        <Ellipse
          cx={c - r * 0.1}
          cy={c - r * (strong ? 0.48 : 0.5)}
          rx={r * (strong ? 0.7 : 0.62)}
          ry={r * (strong ? 0.36 : 0.32)}
          fill={`url(#${id('glint')})`}
        />
        {/* Lit rim: bright where the light hits, tinted where it leaves. */}
        <Circle
          cx={c}
          cy={c}
          r={r - 0.5}
          stroke={`url(#${id('rim')})`}
          strokeWidth={strong ? 1.4 : 1}
          fill="none"
        />
        {/* A second, inner rim of light: the doubled edge that makes thick
            glass read as thick. */}
        {strong ? (
          <Circle
            cx={c}
            cy={c}
            r={r - 2.4}
            stroke={`url(#${id('innerRim')})`}
            strokeWidth={1.2}
            fill="none"
          />
        ) : null}
      </Svg>

      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
        {children}
      </View>
    </View>
  );
}
