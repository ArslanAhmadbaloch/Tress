/**
 * Tress, the orb.
 *
 * A cream sphere resting in a soft sage light, with two arched line eyes
 * and a smile. It is the funnel's voice: the same shape sits big on the
 * introduction pages and small beside every question's speech bubble,
 * so the whole conversation is visibly one character asking.
 *
 * Drawn in SVG rather than shipped as a picture so the palette stays
 * the app's own in both appearances and so the face can change: the
 * expressions swap the eye and mouth paths and nothing else.
 *
 *   smile    both eyes arched, a wide smile — the default
 *   wink     one eye arched, one closed, a small pencil held up — "noted"
 *   calm     both eyes as gentle low arcs, a softer smile — listening
 *   writing  no face; a pencil and a squiggle — "writing this down"
 *
 * ── Motion ────────────────────────────────────────────────────────────
 * The orb breathes (a scale of one to one-point-oh-three and back, on
 * a slow cycle) and, when its eyes are open, blinks once every few
 * seconds. Both stop under Reduce Motion, where it simply sits.
 *
 * Nothing here is a claim. The orb never speaks in this file — every
 * word it says arrives from the screen that renders it.
 */

import { useEffect } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, Ellipse, G, Line, Path, RadialGradient, Stop } from 'react-native-svg';

import { splitAlpha, useTheme } from '@/theme';

export type MascotExpression = 'smile' | 'wink' | 'calm' | 'writing';

/* ------------------------------- timing -------------------------------- */

/** One breath in, one out. */
const BREATH_MS = 1300;
const BREATH_SCALE = 1.03;
/** A blink: lids down fast, up a little slower. */
const BLINK_DOWN_MS = 70;
const BLINK_UP_MS = 110;
/** The pause between blinks is drawn once per mount from this range. */
const BLINK_GAP_MIN_MS = 4000;
const BLINK_GAP_RANGE_MS = 2000;

/* ------------------------------- geometry ------------------------------ */

/** The face is drawn on a 100-unit square; the sphere fills it. */
const VB = 100;
const CENTRE = VB / 2;
const SPHERE_R = 46;
const STROKE = 5.5;

/** The row the eyes sit on, so the blink can scale them about it. */
const EYE_LINE = 44;

const FACE = {
  smile: {
    left: 'M27 44 Q35 33 43 44',
    right: 'M57 44 Q65 33 73 44',
    mouth: 'M33 56 Q50 74 67 56',
  },
  wink: {
    left: 'M27 44 Q35 33 43 44',
    right: 'M58 44 Q65 48 72 44',
    mouth: 'M33 56 Q50 74 67 56',
  },
  calm: {
    left: 'M28 45 Q35 39 42 45',
    right: 'M58 45 Q65 39 72 45',
    mouth: 'M36 58 Q50 68 64 58',
  },
} as const;

/** The squiggle the writing expression draws: a line being written. */
const SQUIGGLE = 'M20 62 q5 -7 10 0 t10 0 t10 0';

/* ------------------------------- component ------------------------------ */

export function Mascot({
  size = 120,
  expression = 'smile',
  glow = true,
  style,
  accessibilityLabel = 'Tress, the orb',
}: {
  size?: number;
  expression?: MascotExpression;
  /** The soft sage light behind the sphere. Off inside tight layouts. */
  glow?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();

  const breath = useSharedValue(1);
  const lids = useSharedValue(1);

  const eyesOpen = expression === 'smile' || expression === 'wink';

  useEffect(() => {
    if (reduceMotion) {
      breath.set(1);
      lids.set(1);
      return;
    }
    breath.set(
      withRepeat(
        withSequence(
          withTiming(BREATH_SCALE, { duration: BREATH_MS, easing: Easing.inOut(Easing.sin) }),
          withTiming(1, { duration: BREATH_MS, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        false,
      ),
    );
    if (!eyesOpen) {
      lids.set(1);
      return;
    }
    // Drawn once per mount, so two orbs on screen never blink in step.
    const gap = BLINK_GAP_MIN_MS + Math.random() * BLINK_GAP_RANGE_MS;
    lids.set(
      withRepeat(
        withSequence(
          withDelay(gap, withTiming(0.08, { duration: BLINK_DOWN_MS })),
          withTiming(1, { duration: BLINK_UP_MS }),
        ),
        -1,
        false,
      ),
    );
  }, [reduceMotion, eyesOpen, breath, lids]);

  const breathing = useAnimatedStyle(() => ({
    transform: [{ scale: breath.get() }],
  }));

  const blinking = useAnimatedStyle(() => ({
    transform: [{ scaleY: lids.get() }],
  }));

  const line = {
    stroke: colors.text,
    strokeWidth: STROKE,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };

  const glowSize = size * 2.3;
  const glowOffset = (size - glowSize) / 2;
  const rimTop = splitAlpha(colors.orbRimTop);
  const glint = splitAlpha(colors.orbGlint);
  const shade = splitAlpha(colors.orbShadow);
  const glowNear = splitAlpha(colors.tabGlow);
  const glowFar = splitAlpha(colors.cardGlow);
  const edge = splitAlpha(colors.orbEdge);

  const face = expression === 'writing' ? null : FACE[expression];

  return (
    <Animated.View
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      style={[{ width: size, height: size }, breathing, style]}>
      {glow ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: glowOffset,
            top: glowOffset,
            width: glowSize,
            height: glowSize,
          }}>
          <Svg width={glowSize} height={glowSize} viewBox={`0 0 ${VB} ${VB}`}>
            <Defs>
              <RadialGradient id="tressGlow" cx="50%" cy="50%" r="50%">
                <Stop offset="0" stopColor={glowNear.color} stopOpacity={0.85 * glowNear.opacity} />
                <Stop offset="0.35" stopColor={glowNear.color} stopOpacity={0.45 * glowNear.opacity} />
                <Stop offset="0.62" stopColor={glowFar.color} stopOpacity={0.12 * glowFar.opacity} />
                <Stop offset="1" stopColor={glowFar.color} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Circle cx={CENTRE} cy={CENTRE} r={CENTRE} fill="url(#tressGlow)" />
          </Svg>
        </View>
      ) : null}

      <Svg width={size} height={size} viewBox={`0 0 ${VB} ${VB}`}>
        <Defs>
          {/* Lit from the upper left; the sage gathers at the far edge. */}
          <RadialGradient id="tressBody" cx="36%" cy="30%" r="74%">
            <Stop offset="0" stopColor={colors.orbNeutralCore} />
            <Stop offset="0.55" stopColor={colors.orbNeutralMid} />
            <Stop offset="0.88" stopColor={colors.orbNeutralEdge} />
            <Stop offset="1" stopColor={edge.color} stopOpacity={edge.opacity} />
          </RadialGradient>
          <RadialGradient id="tressShade" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={shade.color} stopOpacity={shade.opacity} />
            <Stop offset="1" stopColor={shade.color} stopOpacity={0} />
          </RadialGradient>
        </Defs>

        {/* Contact shadow, so the sphere rests rather than floats. */}
        <Ellipse cx={CENTRE} cy={VB - 6} rx={SPHERE_R * 0.7} ry={5} fill="url(#tressShade)" />

        <Circle cx={CENTRE} cy={CENTRE} r={SPHERE_R} fill="url(#tressBody)" />
        <Circle
          cx={CENTRE}
          cy={CENTRE}
          r={SPHERE_R - 0.75}
          stroke={rimTop.color}
          strokeOpacity={rimTop.opacity * 0.9}
          strokeWidth={1.5}
          fill="none"
        />
        {/* The specular glint, top left, where the light lands. */}
        <Ellipse
          cx={34}
          cy={26}
          rx={11}
          ry={6}
          fill={glint.color}
          fillOpacity={glint.opacity * 0.7}
          transform="rotate(-28 34 26)"
        />

        {face ? <Path d={face.mouth} {...line} /> : null}

        {expression === 'writing' ? (
          <G>
            <Path d={SQUIGGLE} {...line} strokeWidth={STROKE * 0.8} />
            <Pencil x1={60} y1={66} x2={80} y2={32} />
          </G>
        ) : null}

        {expression === 'wink' ? <Pencil x1={64} y1={78} x2={80} y2={54} small /> : null}
      </Svg>

      {face ? (
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            // Scale the lids about the eye line, not the sphere's centre.
            { transformOrigin: `50% ${(EYE_LINE / VB) * 100}%` },
            eyesOpen ? blinking : null,
          ]}>
          <Svg width={size} height={size} viewBox={`0 0 ${VB} ${VB}`}>
            <Path d={face.left} {...line} />
            <Path d={face.right} {...line} />
          </Svg>
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

/* -------------------------------- pencil -------------------------------- */

/**
 * A pencil, as a thick accent line inside an ink outline: the outline
 * shows at the tip as the graphite, and a short cap of the neutral fill
 * closes the far end. Drawn from the tip (x1, y1) up to the end (x2, y2).
 *
 * The cap is `fillSelected` rather than an orb token: it has to read on
 * the outline in both themes, and the orb's edge tint is five percent
 * white in the dark one.
 */
function Pencil({
  x1,
  y1,
  x2,
  y2,
  small = false,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  small?: boolean;
}) {
  const { colors } = useTheme();
  const width = small ? 6 : 8;
  // The tip is the first stretch of the line; the body starts after it.
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy);
  const tip = small ? 5 : 7;
  const bx = x1 + (dx / length) * tip;
  const by = y1 + (dy / length) * tip;
  return (
    <G>
      <Line x1={x1} y1={y1} x2={x2} y2={y2} stroke={colors.text} strokeWidth={width + 3} strokeLinecap="round" />
      <Line x1={bx} y1={by} x2={x2} y2={y2} stroke={colors.accent} strokeWidth={width} strokeLinecap="butt" />
      <Line
        x1={x2}
        y1={y2}
        x2={x2 - (dx / length) * 3}
        y2={y2 - (dy / length) * 3}
        stroke={colors.fillSelected}
        strokeWidth={width}
        strokeLinecap="butt"
      />
    </G>
  );
}
