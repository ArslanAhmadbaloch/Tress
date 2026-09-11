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

import { useId, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  LinearGradient,
  Path,
  RadialGradient,
  Stop,
} from 'react-native-svg';

import { splitAlpha, useTheme } from '@/theme';

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
  children,
  style,
}: {
  /** Diameter of the glass body, excluding the ring. */
  size?: number;
  /** 0-1, drives the arc. */
  progress?: number;
  ring?: boolean;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, shadow } = useTheme();
  // Gradient ids must be unique per instance; useId's colons are not
  // valid inside url(#…) on every renderer.
  const uid = useId().replace(/[^A-Za-z0-9]/g, '');
  const id = (name: string) => `${name}${uid}`;

  const pad = ring ? ARC_GAP + ARC_THICKNESS : 0;
  const box = size + pad * 2;
  const c = box / 2;
  const r = size / 2;
  const ra = r + ARC_GAP + ARC_THICKNESS / 2;
  const p = Math.max(0, Math.min(1, progress));

  // The arc as an explicit path from 12 o'clock, rather than a rotated
  // dashed circle, so its gradient is laid out in plain screen space.
  const theta = p * Math.PI * 2;
  const arcPath = `M ${c} ${c - ra} A ${ra} ${ra} 0 ${p > 0.5 ? 1 : 0} 1 ${
    c + ra * Math.sin(theta)
  } ${c - ra * Math.cos(theta)}`;

  return (
    <View
      style={[
        { width: box, height: box },
        // Without a ring there is no room in the drawing for a contact
        // shadow, so the view casts one instead.
        !ring && [{ borderRadius: box / 2 }, shadow.soft],
        style,
      ]}>
      <Svg width={box} height={box} style={StyleSheet.absoluteFill} accessible={false}>
        <Defs>
          <RadialGradient id={id('shadow')} cx="50%" cy="50%" r="50%">
            <Stop offset="0.55" {...stop(colors.orbShadow, 1)} />
            <Stop offset="1" {...stop(colors.orbShadow, 0)} />
          </RadialGradient>
          <RadialGradient id={id('body')} cx="40%" cy="28%" fx="40%" fy="28%" r="80%">
            <Stop offset="0" {...stop(colors.orbCore)} />
            <Stop offset="0.55" {...stop(colors.orbMid)} />
            <Stop offset="1" {...stop(colors.orbEdge)} />
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
            <Stop offset="1" {...stop(colors.orbRimBottom)} />
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
            {p >= 0.999 ? (
              <Circle
                cx={c}
                cy={c}
                r={ra}
                stroke={`url(#${id('arc')})`}
                strokeWidth={ARC_THICKNESS}
                fill="none"
              />
            ) : p > 0 ? (
              <Path
                d={arcPath}
                stroke={`url(#${id('arc')})`}
                strokeWidth={ARC_THICKNESS}
                strokeLinecap="round"
                fill="none"
              />
            ) : null}
          </>
        ) : null}

        {/* The glass body. */}
        <Circle cx={c} cy={c} r={r} fill={`url(#${id('body')})`} />
        {/* Light focused at the lower edge. */}
        <Ellipse
          cx={c}
          cy={c + r * 0.58}
          rx={r * 0.6}
          ry={r * 0.26}
          fill={`url(#${id('caustic')})`}
        />
        {/* Specular glint. */}
        <Ellipse
          cx={c - r * 0.1}
          cy={c - r * 0.5}
          rx={r * 0.62}
          ry={r * 0.32}
          fill={`url(#${id('glint')})`}
        />
        {/* Lit rim: bright where the light hits, tinted where it leaves. */}
        <Circle
          cx={c}
          cy={c}
          r={r - 0.5}
          stroke={`url(#${id('rim')})`}
          strokeWidth={1}
          fill="none"
        />
      </Svg>

      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
        {children}
      </View>
    </View>
  );
}
