/**
 * Routine item glyphs, traced from the reference stack.
 *
 * Drawn rather than taken from SF Symbols: the system set has no dropper
 * bottle, and its pill and cup are filled shapes where the design uses
 * even, rounded outlines. All five share one 24-unit grid and one stroke
 * weight, so a mixed list reads as a single family.
 */

import Svg, { Path, Rect } from 'react-native-svg';

import { useTheme } from '@/theme';
import type { RoutineIcon } from '@/types/domain';

const STROKE = 2;

export function RoutineGlyph({ icon, size = 22 }: { icon: RoutineIcon; size?: number }) {
  const { colors } = useTheme();
  const line = {
    stroke: colors.text,
    strokeWidth: STROKE,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
      {icon === 'dropper' ? (
        <>
          {/* Teat, collar, then the bottle with its small square label. */}
          <Path d="M10.6 6.9 V4.4 a1.4 1.4 0 0 1 2.8 0 V6.9" {...line} />
          <Rect x={9.4} y={6.9} width={5.2} height={2.5} rx={0.6} {...line} />
          <Rect x={7.6} y={9.4} width={8.8} height={11.6} rx={1.8} {...line} />
          <Rect x={10.8} y={13.5} width={2.4} height={2.4} rx={0.4} fill={colors.text} />
        </>
      ) : icon === 'pill' ? (
        <>
          <Rect
            x={3.2}
            y={8.4}
            width={17.6}
            height={7.2}
            rx={3.6}
            transform="rotate(-45 12 12)"
            {...line}
          />
          <Path d="M9.45 9.45 L14.55 14.55" {...line} />
        </>
      ) : icon === 'capsule' ? (
        <>
          <Rect x={8} y={3.4} width={8} height={17.2} rx={4} {...line} />
          <Path d="M8 11.6 Q12 10.2 16 11.6" {...line} />
        </>
      ) : icon === 'cup' ? (
        <>
          <Path
            d="M5.6 4.4 H18.4 L16.9 19.6 a1.3 1.3 0 0 1 -1.3 1.2 H8.4 a1.3 1.3 0 0 1 -1.3 -1.2 Z"
            {...line}
          />
          <Path d="M6.7 9.2 C8.5 8.2 9.8 10.2 12 9.2 S15.5 8.2 17.3 9.2" {...line} />
        </>
      ) : (
        <Path
          d="M12 3.6 C12 3.6 6.2 10.1 6.2 14.6 a5.8 5.8 0 0 0 11.6 0 C17.8 10.1 12 3.6 12 3.6 Z"
          {...line}
        />
      )}
    </Svg>
  );
}

/** The bold tick on a completed row, heavier than the system checkmark. */
export function CheckGlyph({ size = 18 }: { size?: number }) {
  const { colors } = useTheme();
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
      <Path
        d="M5.5 12.6 L10 17 L18.5 7.5"
        stroke={colors.text}
        strokeWidth={2.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}
