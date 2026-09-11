/**
 * Progress ring and sparkline — the two data marks the dashboard uses.
 *
 * Both are deliberately unlabelled and small: they sit behind or beneath a
 * number that already states the value, so their job is to show shape and
 * direction at a glance, not to be read precisely. Neither carries its own
 * accessibility label for that reason — the tile announces the number.
 */

import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  LinearGradient,
  Mask,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';
import { View } from 'react-native';
import { useId, type ReactNode } from 'react';

import { useTheme } from '@/theme';

/**
 * A ring that wraps an icon chip.
 *
 * `progress` is 0-1. The arc starts at 12 o'clock and runs clockwise,
 * which is the direction people read a dial.
 */
export function ProgressRing({
  progress,
  size = 46,
  thickness = 3,
  children,
}: {
  progress: number;
  size?: number;
  thickness?: number;
  children?: ReactNode;
}) {
  const { colors } = useTheme();

  const clamped = Math.max(0, Math.min(1, progress));
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors.fill}
          strokeWidth={thickness}
          fill="none"
        />
        {clamped > 0 ? (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={colors.accent}
            strokeWidth={thickness}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${circumference * clamped} ${circumference}`}
            // Rotate the start point to the top of the circle.
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        ) : null}
      </Svg>

      <View
        style={{
          width: size,
          height: size,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        {children}
      </View>
    </View>
  );
}

/**
 * Faintness of a trend line with no real history behind it. Low enough to
 * read as "not yet", high enough that the tile still has its shape.
 */
const PLACEHOLDER_OPACITY = 0.3;

/**
 * A stand-in series for a tile that does not have enough history yet.
 *
 * Seeded rather than random per render, so a tile's placeholder is the
 * same shape every time it appears instead of twitching on each refresh.
 * It is never shown as data: callers draw it at `strength` 0, faded, and
 * announce it to VoiceOver as a preview.
 */
export function placeholderSeries(seed: string, points = 12): number[] {
  // FNV-1a hash of the seed, then a small xorshift generator.
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  }
  const next = () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return (h >>> 0) / 4294967296;
  };

  const series: number[] = [];
  for (let i = 0; i < points; i += 1) {
    // A gentle rise with a little wander, like the reference.
    const trend = i / (points - 1);
    series.push(0.18 + trend * 0.62 + (next() - 0.5) * 0.12);
  }
  return series;
}

/**
 * A small trend line with a soft green glow beneath it.
 *
 * Draws whatever history it is given, normalised to its own range so the
 * shape is visible even when the underlying values barely move. It shows
 * direction, not magnitude — the tile's number carries magnitude.
 *
 * `strength` (0-1) sets how present it is. At 0 it is a faded sketch; at
 * 1 it is the full theme green. Callers raise it as real history builds,
 * so the line visibly brightens as the user's own record fills in.
 */
export function Sparkline({
  values,
  width = 120,
  height = 30,
  strength = 1,
}: {
  values: number[];
  width?: number;
  height?: number;
  strength?: number;
}) {
  const { colors } = useTheme();
  const uid = useId().replace(/[^A-Za-z0-9]/g, '');

  if (values.length < 2 || width <= 0) {
    return <View style={{ width, height }} />;
  }

  const s = Math.max(0, Math.min(1, strength));
  const lineOpacity = PLACEHOLDER_OPACITY + (1 - PLACEHOLDER_OPACITY) * s;
  const glowOpacity = 0.05 + 0.17 * s;

  const min = Math.min(...values);
  const max = Math.max(...values);
  // A flat series would divide by zero; draw it across the middle instead.
  const span = max - min || 1;

  // The line keeps to the upper part of the box, leaving room beneath it
  // for the glow; the inset stops round caps being clipped at the ends.
  const top = 3;
  const bottom = height * 0.78;
  const inset = 1.5;
  const stepX = (width - inset * 2) / (values.length - 1);

  const points = values.map((v, i) => ({
    x: inset + i * stepX,
    y: max === min ? (top + bottom) / 2 : bottom - ((v - min) / span) * (bottom - top),
  }));

  // Catmull-Rom smoothing. A plain polyline reads as jagged noise at this
  // size, and midpoint-tangent curves flatten at every point into a
  // staircase; this keeps the tangent flowing through each point.
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }

  const first = points[0];
  const last = points[points.length - 1];
  const area = `${d} L ${last.x} ${height} L ${first.x} ${height} Z`;

  return (
    <Svg width={width} height={height} accessible={false}>
      <Defs>
        <LinearGradient id={`area${uid}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={colors.accent} stopOpacity={glowOpacity} />
          <Stop offset="1" stopColor={colors.accent} stopOpacity={0} />
        </LinearGradient>
        {/* Fades the glow out at both ends so it never stops on a hard edge.
            A mask reads luminance only, so this white is a channel value,
            not a colour anyone sees — it is the same in both themes. */}
        <LinearGradient id={`taper${uid}`} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="white" stopOpacity={0} />
          <Stop offset="0.3" stopColor="white" stopOpacity={1} />
          <Stop offset="0.82" stopColor="white" stopOpacity={1} />
          <Stop offset="1" stopColor="white" stopOpacity={0} />
        </LinearGradient>
        <Mask id={`mask${uid}`} x="0" y="0" width={width} height={height} maskUnits="userSpaceOnUse">
          <Rect x="0" y="0" width={width} height={height} fill={`url(#taper${uid})`} />
        </Mask>
        <RadialGradient id={`glow${uid}`} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={colors.accent} stopOpacity={glowOpacity * 1.2} />
          <Stop offset="1" stopColor={colors.accent} stopOpacity={0} />
        </RadialGradient>
      </Defs>

      {/* A soft pool of light under the most recent end of the line. */}
      <G mask={`url(#mask${uid})`}>
        <Ellipse
          cx={last.x - width * 0.26}
          cy={last.y + height * 0.4}
          rx={width * 0.28}
          ry={height * 0.45}
          fill={`url(#glow${uid})`}
        />
        <Path d={area} fill={`url(#area${uid})`} />
      </G>
      <Path
        d={d}
        stroke={colors.accent}
        strokeOpacity={lineOpacity}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}
