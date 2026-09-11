/**
 * Navigation glyphs, drawn to match the reference bar.
 *
 * The system symbols are close but not the same family: SF's bar chart is
 * boxed where the design uses three thin strokes, and its house has no
 * door. Drawing all of them on one grid at one weight keeps the row even.
 * The selected house fills in, which is the one state change the design
 * gives an icon; colour and the glow behind it carry the rest.
 */

import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { useTheme } from '@/theme';

export type TabGlyphProps = { size?: number; color: string; active?: boolean };

const STROKE = 1.9;

const line = (color: string) => ({
  stroke: color,
  strokeWidth: STROKE,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
});

export function HomeGlyph({ size = 24, color, active }: TabGlyphProps) {
  const { colors } = useTheme();
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
      <Path
        d="M4 10.6 L12 3.9 L20 10.6 V19.1 a1.9 1.9 0 0 1 -1.9 1.9 H5.9 a1.9 1.9 0 0 1 -1.9 -1.9 Z"
        {...line(color)}
        fill={active ? color : 'none'}
      />
      {active ? (
        <Rect x={10.2} y={14.4} width={3.6} height={2.4} rx={0.6} fill={colors.surface} />
      ) : (
        <Path d="M10.2 21 V15.6 H13.8 V21" {...line(color)} fill="none" />
      )}
    </Svg>
  );
}

export function JourneyGlyph({ size = 24, color }: TabGlyphProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
      <Path d="M6.5 20 V14.5 M12 20 V9.5 M17.5 20 V3.8" {...line(color)} fill="none" />
    </Svg>
  );
}

export function LearnGlyph({ size = 24, color }: TabGlyphProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
      <Path
        d="M12 6.6 C10 5.1 7 4.7 3.4 5.1 V18.9 C7 18.5 10 18.9 12 20.4 C14 18.9 17 18.5 20.6 18.9 V5.1 C17 4.7 14 5.1 12 6.6 Z M12 6.6 V20.4"
        {...line(color)}
        fill="none"
      />
    </Svg>
  );
}

export function ProfileGlyph({ size = 24, color }: TabGlyphProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
      <Circle cx={12} cy={8} r={3.9} {...line(color)} fill="none" />
      <Path d="M4.8 20.6 a7.2 6.4 0 0 1 14.4 0 Z" {...line(color)} fill="none" />
    </Svg>
  );
}

/** The centre action's plus: long, thin arms, as in the reference. */
export function PlusGlyph({ size = 26, color }: TabGlyphProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
      <Path d="M12 3.5 V20.5 M3.5 12 H20.5" {...line(color)} strokeWidth={2.1} fill="none" />
    </Svg>
  );
}

/** A light bulb with a two-ring base, for the Learn card. */
export function BulbGlyph({ size = 26, color }: TabGlyphProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
      <Path
        d="M12 2.9 a6.4 6.4 0 0 0 -4 11.4 c0.75 0.6 1.15 1.3 1.15 2.2 V17.3 h5.7 v-0.8 c0 -0.9 0.4 -1.6 1.15 -2.2 A6.4 6.4 0 0 0 12 2.9 Z"
        {...line(color)}
        fill="none"
      />
      <Path d="M9.2 20 H14.8 M10.4 22.1 H13.6" {...line(color)} fill="none" />
    </Svg>
  );
}
