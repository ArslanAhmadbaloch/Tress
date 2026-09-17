/**
 * One fact beneath the constellation: a short headline whose digits
 * roll, and the line that says what it is.
 *
 * The headline is a word or a short phrase — "1 cm", "2–7 years",
 * "50–100", "7 styles". Every run of digits in it is a slot column: a
 * window over a vertical strip of 0–9 that spins past and stops on the
 * digit it was given, the leftmost settling first and the rest following
 * so the number resolves from the left. The letters and dashes between
 * the digits are simply there. While a column is moving, two faint
 * copies of its strip sit just above and below it — the smear a fast
 * column leaves — and they fade as it stops; no filter, so it draws the
 * same on both platforms.
 *
 * The digits it lands on are the digits it was given. Nothing here
 * rounds, pads, or invents one; the spin is presentation over a figure
 * that was made elsewhere, and the line beneath is the same fact as one
 * sentence with one accent phrase.
 *
 * Under Reduce Motion the headline is simply there.
 */

import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { Text } from '@/components/ui/text';
import type { AccentLine } from '@/features/onboarding/plan-copy';
import type { PlanFact } from '@/features/onboarding/plan-model';
import { darkColors, fontFamily } from '@/theme';

/** The strip: 0–9 and a second 0, so the wrap from 9 back round is seamless. */
const STRIP = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0];

/** The first digit's spin, and how much longer each later digit runs. */
const SPIN_MS = 900;
const SPIN_STAGGER_MS = 320;
/** How long the smear takes to clear as a digit settles. */
const SETTLE_MS = 380;
/** Whole turns the first digit makes before landing; later digits make one more each. */
const BASE_TURNS = 2;
/** How far the smear copies sit from the strip, as a share of a digit's height. */
const SMEAR = 0.45;
const SMEAR_OPACITY = 0.3;

/** The headline's size: as large as the measure allows, within these. */
const MAX_FONT = 84;
const MIN_FONT = 40;
/** Rough widths of a glyph in the display face, as a share of the font size. */
const DIGIT_EM = 0.6;
const LETTER_EM = 0.56;
const SPACE_EM = 0.28;

function Digit({
  digit,
  index,
  fontSize,
  height,
  width,
  color,
  reduceMotion,
}: {
  digit: number;
  index: number;
  fontSize: number;
  height: number;
  width: number;
  color: string;
  reduceMotion: boolean;
}) {
  const pos = useSharedValue(reduceMotion ? digit : 0);
  const smear = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
      pos.set(digit);
      smear.set(0);
      return;
    }
    const target = (BASE_TURNS + index) * 10 + digit;
    const duration = SPIN_MS + index * SPIN_STAGGER_MS;
    pos.set(0);
    pos.set(withTiming(target, { duration, easing: Easing.out(Easing.cubic) }));
    smear.set(1);
    smear.set(withDelay(Math.max(0, duration - SETTLE_MS), withTiming(0, { duration: SETTLE_MS })));
  }, [digit, index, pos, smear, reduceMotion]);

  const strip = useAnimatedStyle(() => {
    const p = pos.get();
    const wrapped = ((p % 10) + 10) % 10;
    return { transform: [{ translateY: -wrapped * height }] };
  });
  const above = useAnimatedStyle(() => {
    const p = pos.get();
    const wrapped = ((p % 10) + 10) % 10;
    return {
      opacity: smear.get() * SMEAR_OPACITY,
      transform: [{ translateY: -wrapped * height - height * SMEAR }],
    };
  });
  const below = useAnimatedStyle(() => {
    const p = pos.get();
    const wrapped = ((p % 10) + 10) % 10;
    return {
      opacity: smear.get() * SMEAR_OPACITY,
      transform: [{ translateY: -wrapped * height + height * SMEAR }],
    };
  });

  const glyph = {
    fontSize,
    lineHeight: height,
    height,
    width,
    textAlign: 'center' as const,
    fontFamily: fontFamily.display,
    fontVariant: ['tabular-nums' as const],
    letterSpacing: -fontSize * 0.03,
    color,
  };

  const column = (style: typeof strip) => (
    <Animated.View style={[{ position: 'absolute', top: 0, left: 0 }, style]}>
      {STRIP.map((n, i) => (
        <Text key={i} variant="display" style={glyph}>
          {n}
        </Text>
      ))}
    </Animated.View>
  );

  return (
    <View style={{ width, height, overflow: 'hidden' }} accessible={false}>
      {reduceMotion ? null : column(above)}
      {reduceMotion ? null : column(below)}
      {column(strip)}
    </View>
  );
}

/* -------------------------------- headline ------------------------------- */

type Cell =
  | { kind: 'digit'; key: string; digit: number; index: number }
  | { kind: 'text'; key: string; text: string };

/**
 * The headline as cells: each digit its own column, numbered left to
 * right across the whole headline so the stagger runs through it, and
 * everything else as the text it is.
 */
export function headlineCells(headline: string): Cell[] {
  const cells: Cell[] = [];
  let index = 0;
  let s = 0;
  for (const match of headline.matchAll(/(\d+)|(\D+)/g)) {
    if (match[1] !== undefined) {
      for (let i = 0; i < match[1].length; i += 1) {
        cells.push({ kind: 'digit', key: `d-${s}-${i}`, digit: Number(match[1][i]), index });
        index += 1;
      }
    } else {
      cells.push({ kind: 'text', key: `t-${s}`, text: match[2] });
    }
    s += 1;
  }
  return cells;
}

/** The largest size at which the headline fits the measure, by a rough count of its glyphs. */
export function headlineFontSize(headline: string, maxWidth: number): number {
  let em = 0;
  for (const ch of headline) {
    if (/\d/.test(ch)) em += DIGIT_EM;
    else if (ch === ' ') em += SPACE_EM;
    else em += LETTER_EM;
  }
  const fit = Math.floor(maxWidth / Math.max(em, 1));
  return Math.max(MIN_FONT, Math.min(MAX_FONT, fit));
}

function Headline({
  text,
  color,
  reduceMotion,
  maxWidth,
}: {
  text: string;
  color: string;
  reduceMotion: boolean;
  maxWidth: number;
}) {
  const fontSize = headlineFontSize(text, maxWidth);
  const height = Math.round(fontSize * 1.14);
  const width = Math.round(fontSize * DIGIT_EM);
  const cells = headlineCells(text);

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={text}
      style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center' }}>
      {cells.map((cell) =>
        cell.kind === 'text' ? (
          <Text
            key={cell.key}
            variant="display"
            style={{
              fontSize,
              lineHeight: height,
              height,
              letterSpacing: -fontSize * 0.03,
              color,
            }}>
            {cell.text}
          </Text>
        ) : (
          <Digit
            key={cell.key}
            digit={cell.digit}
            index={cell.index}
            fontSize={fontSize}
            height={height}
            width={width}
            color={color}
            reduceMotion={reduceMotion}
          />
        ),
      )}
    </View>
  );
}

/* ---------------------------------- card --------------------------------- */

/** The line beneath, with its accent phrase in sage on the dark ground. */
function Accented({ line, maxWidth }: { line: AccentLine; maxWidth: number }) {
  return (
    <Text variant="title2" center style={{ maxWidth, color: darkColors.text }}>
      {line.before}
      {line.accent.length > 0 ? (
        <Text variant="title2" style={{ color: darkColors.accent }}>
          {line.accent}
        </Text>
      ) : null}
      {line.after}
    </Text>
  );
}

export function FactCard({
  fact,
  line,
  reduceMotion,
  maxWidth,
  gap,
}: {
  fact: PlanFact;
  line: AccentLine;
  reduceMotion: boolean;
  /** The measure the headline is sized to and the line wraps in. */
  maxWidth: number;
  gap: number;
}) {
  return (
    <View style={{ alignItems: 'center', gap }}>
      <Headline key={fact.id} text={fact.headline} color={darkColors.text} reduceMotion={reduceMotion} maxWidth={maxWidth} />
      <Animated.View key={`line-${fact.id}`} entering={FadeIn.duration(420).delay(200)}>
        <Accented line={line} maxWidth={maxWidth} />
      </Animated.View>
    </View>
  );
}
