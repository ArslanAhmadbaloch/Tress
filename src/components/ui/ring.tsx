/**
 * Progress ring and sparkline — the two data marks the dashboard uses.
 *
 * Both are deliberately unlabelled and small: they sit behind or beneath a
 * number that already states the value, so their job is to show shape and
 * direction at a glance, not to be read precisely. Neither carries its own
 * accessibility label for that reason — the tile announces the number.
 */

import Svg, { Circle, Path } from 'react-native-svg';
import { View } from 'react-native';
import type { ReactNode } from 'react';

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
 * A small trend line.
 *
 * Draws whatever history it is given, normalised to its own range so the
 * shape is visible even when the underlying values barely move. It shows
 * direction, not magnitude — the tile's number carries magnitude.
 */
export function Sparkline({
  values,
  width = 120,
  height = 30,
}: {
  values: number[];
  width?: number;
  height?: number;
}) {
  const { colors } = useTheme();

  if (values.length < 2) {
    return <View style={{ width, height }} />;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  // A flat series would divide by zero; draw it down the middle instead.
  const span = max - min || 1;

  const stepX = width / (values.length - 1);
  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / span) * height;
    return { x, y: max === min ? height / 2 : y };
  });

  // Cubic smoothing: a straight polyline reads as jagged noise at this size.
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const curr = points[i];
    const cx = (prev.x + curr.x) / 2;
    d += ` C ${cx} ${prev.y}, ${cx} ${curr.y}, ${curr.x} ${curr.y}`;
  }

  const area = `${d} L ${width} ${height} L 0 ${height} Z`;

  return (
    <Svg width={width} height={height} accessible={false}>
      <Path d={area} fill={colors.accentSoft} />
      <Path
        d={d}
        stroke={colors.accent}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}
