/**
 * Custom glyphs for the dashboard metrics, drawn to match the reference.
 *
 * SF Symbols has no hair strand, and its bar chart is lighter than the
 * bold marks the design calls for. Both are drawn on a 24-unit grid so
 * they sit at the same optical size as the system camera symbol beside
 * them. Decorative: the tile's label names the metric.
 */

import Svg, { Ellipse, Path } from 'react-native-svg';

import { useTheme } from '@/theme';

/** A single hair and its follicle, over a faint gauge. */
export function StrandGlyph({ size = 22 }: { size?: number }) {
  const { colors } = useTheme();

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
      <Path
        d="M3.5 18 A 9.5 9.5 0 0 1 20.5 18"
        stroke={colors.textTertiary}
        strokeOpacity={0.7}
        strokeWidth={2}
        strokeLinecap="round"
        fill="none"
      />
      <Path
        d="M15.8 2.6 C 13.4 6.6, 11.9 11, 11.9 16.2"
        stroke={colors.text}
        strokeWidth={2.3}
        strokeLinecap="round"
        fill="none"
      />
      <Ellipse
        cx={11.8}
        cy={19}
        rx={2.5}
        ry={2.9}
        stroke={colors.text}
        strokeWidth={2.1}
        fill="none"
      />
    </Svg>
  );
}

/** Three ascending bars. */
export function BarsGlyph({ size = 21 }: { size?: number }) {
  const { colors } = useTheme();

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
      <Path
        d="M6 19.5 V 13.5 M12 19.5 V 9 M18 19.5 V 4.5"
        stroke={colors.text}
        strokeWidth={2.8}
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  );
}
