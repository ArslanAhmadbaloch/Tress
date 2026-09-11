/**
 * A palm frond's shadow, drawn for the guide covers.
 *
 * Drawn rather than photographed so it can sit on the right third of a
 * tiny cover and leave the title on clean paper — a photograph at this
 * size puts texture behind the text, which is what made the first version
 * muddy. Two passes, one offset and fainter, stand in for the soft edge a
 * real shadow has; SVG blur is not reliable across renderers.
 */

import Svg, { Ellipse, G, Path } from 'react-native-svg';

import { useTheme } from '@/theme';

/** The frond's spine, a gentle curve from top right to bottom left. */
const SPINE: [number, number][] = [
  [34, -2],
  [27, 22],
  [20, 46],
  [13, 84],
];

function pointAt(t: number) {
  const u = 1 - t;
  const [p0, p1, p2, p3] = SPINE;
  const x = u ** 3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t ** 3 * p3[0];
  const y = u ** 3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t ** 3 * p3[1];
  const dx = 3 * u * u * (p1[0] - p0[0]) + 6 * u * t * (p2[0] - p1[0]) + 3 * t * t * (p3[0] - p2[0]);
  const dy = 3 * u * u * (p1[1] - p0[1]) + 6 * u * t * (p2[1] - p1[1]) + 3 * t * t * (p3[1] - p2[1]);
  return { x, y, angle: (Math.atan2(dy, dx) * 180) / Math.PI };
}

/** Leaflets in pairs, longest mid-frond, swept toward the tip. */
const LEAFLETS = Array.from({ length: 13 }, (_, i) => {
  const t = 0.05 + i * 0.07;
  const { x, y, angle } = pointAt(t);
  const length = 4 + 8 * Math.sin(Math.PI * Math.min(1, t * 1.05));
  return [-1, 1].map((side) => {
    const a = angle + side * 48;
    const rad = (a * Math.PI) / 180;
    return {
      cx: x + Math.cos(rad) * length,
      cy: y + Math.sin(rad) * length,
      rx: length,
      ry: 1.7,
      rotate: a,
    };
  });
}).flat();

const SPINE_PATH = `M ${SPINE[0].join(' ')} C ${SPINE[1].join(' ')}, ${SPINE[2].join(' ')}, ${SPINE[3].join(' ')}`;

export function LeafShadow({ width, height }: { width: number; height: number }) {
  const { colors } = useTheme();

  return (
    <Svg
      width={width}
      height={height}
      viewBox="0 0 40 80"
      preserveAspectRatio="xMidYMid slice"
      accessible={false}>
      {[
        { dx: 1.4, dy: 2, opacity: 0.12 },
        { dx: 0, dy: 0, opacity: 0.3 },
      ].map((pass) => (
        <G
          key={pass.opacity}
          transform={`translate(${pass.dx} ${pass.dy})`}
          opacity={pass.opacity}>
          <Path d={SPINE_PATH} stroke={colors.leafShadow} strokeWidth={1.1} fill="none" />
          {LEAFLETS.map((leaf, i) => (
            <Ellipse
              key={i}
              cx={leaf.cx}
              cy={leaf.cy}
              rx={leaf.rx}
              ry={leaf.ry}
              transform={`rotate(${leaf.rotate} ${leaf.cx} ${leaf.cy})`}
              fill={colors.leafShadow}
            />
          ))}
        </G>
      ))}
    </Svg>
  );
}
