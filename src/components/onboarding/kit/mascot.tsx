/**
 * Tress, the orb — with hair, and a face that reacts.
 *
 * A cream sphere resting in a soft sage light, hair parted down the
 * middle and swept back over the temples to a small ear a side, two
 * fringe pieces falling from the parting over the brow and curving
 * outward above the eyes, and a line face. It is the funnel's voice
 * and the report's: the same shape sits big on the introduction
 * pages, small beside every question's speech bubble,
 * beside the "Tress says" paragraph and on the commit slider's knob, so
 * the whole conversation is visibly one character.
 *
 * Drawn in SVG rather than shipped as a picture so the palette stays
 * the app's own in both appearances, so the hair can move and so the
 * face can change. The hair is always there; an expression swaps only
 * the eyes and the mouth.
 *
 *   smile    both eyes arched, a wide smile — the default
 *   wink     one eye arched, one closed, the smile — "noted"
 *   calm     both eyes as gentle low arcs, a softer smile — listening
 *   blow     the lips pursed and blowing; the hair streams
 *   clench   round eyes and a small grid of teeth — a wince
 *   glance   round eyes that flick to the bubble, then back
 *   think    eyes up and to the left, a flat mouth, one lock lifting
 *   writing  an alias of think, kept so old scripts still compile
 *
 * ── Motion ────────────────────────────────────────────────────────────
 * The orb breathes (a scale of one to one-point-oh-three and back, on
 * a slow cycle). Its signature idle is a pout and a blow: the mouth
 * purses over 350 ms, then for 700 ms the hair lifts in the breath and
 * springs back, then it rests for a jittered two-and-a-half to four
 * seconds. An occasional blink is secondary. Expressions cross-fade
 * over 180 ms; glance moves the pupils; think lifts a lock. The hair
 * is one path string built on the UI thread by a pure worklet
 * (mascot-hair.ts) from one `sway` value, once per frame, and drawn
 * twice — ink and sheen. The ears come last and never move: a filled
 * shape over the swept ends, so the hair finishes behind them. Under
 * Reduce Motion the hair is still, expressions swap without motion,
 * and the orb simply sits.
 *
 * Two SVG surfaces: the glow behind, and the orb — body, mouth, eyes
 * and hair — in one. The blink is a cross-fade to closed lids inside
 * that one surface, so the eyes need no layer of their own.
 *
 * Nothing here is a claim. The orb never speaks in this file — every
 * word it says arrives from the screen that renders it.
 */

import { useEffect, useState } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedProps,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, Ellipse, G, Line, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

import { splitAlpha, useTheme } from '@/theme';

import {
  BLOW_MS,
  EARS,
  EAR_STROKE,
  HAIR_CENTRE,
  HAIR_SHEEN,
  HAIR_SPHERE_R,
  HAIR_STROKE,
  HAIR_VB,
  REST_MIN_MS,
  REST_RANGE_MS,
  blowCycle,
  hairPaths,
  type Ease,
  type Keyframe,
} from './mascot-hair';

/**
 * The seven faces, plus `writing`, which older scripts still name and
 * which draws as `think`.
 */
export type MascotExpression = 'smile' | 'blow' | 'clench' | 'glance' | 'calm' | 'wink' | 'think' | 'writing';

/** Where the eyes rest: on the person, or up at the question bubble. */
export type MascotGaze = 'user' | 'question';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedG = Animated.createAnimatedComponent(G);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

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
/** An expression cross-fades over this. */
const FADE_MS = 180;
/** A glance: wait, flick to the other target, hold, flick back, rest. */
const GLANCE_WAIT_MS = 600;
const GLANCE_MOVE_MS = 240;
const GLANCE_HOLD_MS = 1100;
const GLANCE_REST_MS = 3400;
/** A lock lifts into the thinking pose over this. */
const LIFT_MS = 380;

/** The easings a keyframe can name, as Reanimated draws them. */
const EASE: Record<Ease, (t: number) => number> = {
  linear: Easing.linear,
  outQuad: Easing.out(Easing.quad),
  inOutQuad: Easing.inOut(Easing.quad),
  // The spring back: an overshoot past rest, then settle.
  springBack: Easing.out(Easing.back(2.2)),
};

/** A run of keyframes as one Reanimated sequence. */
function play(frames: readonly Keyframe[]) {
  const [first, ...rest] = frames.map((f) => withTiming(f.to, { duration: f.ms, easing: EASE[f.ease] }));
  return withSequence(first, ...rest);
}

/* ------------------------------- geometry ------------------------------ */

/** The face is drawn on the hair's square; the sphere nearly fills it. */
const VB = HAIR_VB;
const CENTRE = HAIR_CENTRE;
const SPHERE_R = HAIR_SPHERE_R;
const STROKE = 5.5;

/** Round eyes: where each pupil sits when looking at the person. */
const PUPIL_Y = 42;
const PUPIL_DX = 15;
const PUPIL_R = 3.4;
/** Where the pupils go for the bubble (up and to the right) and for thinking (up-left). */
const LOOK_QUESTION = { x: 3.4, y: -2.6 };
const LOOK_THINK = { x: -3.4, y: -3.2 };

/* -------------------------------- faces --------------------------------- */

type Face = {
  /** Arched line eyes, or round pupils that can move. */
  eyes: 'arc' | 'dot';
  left?: string;
  right?: string;
  /** The resting mouth. None for `blow`, whose mouth is the pout. */
  mouth: string | null;
  /** A small grid of teeth behind the mouth. */
  teeth?: boolean;
};

const SMILE = 'M33 56 Q50 74 67 56';

const FACE: Record<Exclude<MascotExpression, 'writing'>, Face> = {
  smile: {
    eyes: 'arc',
    left: 'M27 44 Q35 33 43 44',
    right: 'M57 44 Q65 33 73 44',
    mouth: SMILE,
  },
  wink: {
    eyes: 'arc',
    left: 'M27 44 Q35 33 43 44',
    right: 'M58 44 Q65 48 72 44',
    mouth: SMILE,
  },
  calm: {
    eyes: 'arc',
    left: 'M28 45 Q35 39 42 45',
    right: 'M58 45 Q65 39 72 45',
    mouth: 'M36 58 Q50 68 64 58',
  },
  blow: {
    eyes: 'arc',
    left: 'M28 44 Q35 39 42 44',
    right: 'M58 44 Q65 39 72 44',
    mouth: null,
  },
  clench: {
    eyes: 'dot',
    mouth: 'M36 54 H64',
    teeth: true,
  },
  glance: {
    eyes: 'dot',
    mouth: 'M38 58 Q50 67 62 58',
  },
  think: {
    eyes: 'dot',
    mouth: 'M42 61 Q50 59.5 58 61',
  },
};

/** The lids, closed, for a blink: a flat line where each eye was. */
const LIDS = {
  arc: { left: 'M29 44 H41', right: 'M59 44 H71' },
  dot: { left: 'M31 43 H39', right: 'M61 43 H69' },
};

function drawn(expression: MascotExpression): Exclude<MascotExpression, 'writing'> {
  return expression === 'writing' ? 'think' : expression;
}

/* ------------------------------- component ------------------------------ */

export function Mascot({
  size = 120,
  expression = 'smile',
  gaze = 'user',
  glow = true,
  idle = true,
  style,
  accessible = true,
  accessibilityLabel = 'Tress',
}: {
  size?: number;
  expression?: MascotExpression;
  /** Where the round eyes rest. A glance flicks to the other target and back. */
  gaze?: MascotGaze;
  /** The soft sage light behind the sphere. Off inside tight layouts. */
  glow?: boolean;
  /** The pout-and-blow cycle and the occasional blink. Off where the orb should hold still. */
  idle?: boolean;
  style?: StyleProp<ViewStyle>;
  /**
   * Whether the screen reader sees the orb as an image called by its
   * label. Off where the row it sits in already names the speaker, so
   * nothing is announced twice.
   */
  accessible?: boolean;
  accessibilityLabel?: string;
}) {
  const { colors, scheme } = useTheme();
  const reduceMotion = useReducedMotion();

  const shape = drawn(expression);

  /*
   * The face that is showing and, for the length of one cross-fade,
   * the one it replaced. Derived during render, so no effect sets
   * state to catch up; the fade itself is a shared value the effect
   * below drives, and the same effect lets go of the old face once
   * the fade is over, so an orb never carries a second face for long.
   */
  const [shown, setShown] = useState<{ current: typeof shape; previous: typeof shape | null }>({
    current: shape,
    previous: null,
  });
  if (shown.current !== shape) {
    setShown({ current: shape, previous: reduceMotion ? null : shown.current });
  }

  const breath = useSharedValue(1);
  const lids = useSharedValue(1);
  const pout = useSharedValue(0);
  const sway = useSharedValue(0);
  const fade = useSharedValue(1);
  const look = useSharedValue(0);
  const lift = useSharedValue(0);

  const blowing = shape === 'blow';
  const thinking = shape === 'think';
  const glancing = shape === 'glance';
  const eyesOpen = shape !== 'calm' && !blowing;

  /* Breathing. */
  useEffect(() => {
    if (reduceMotion) {
      breath.set(1);
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
    return () => cancelAnimation(breath);
  }, [reduceMotion, breath]);

  /* The occasional blink, secondary to the blow. */
  useEffect(() => {
    if (reduceMotion || !idle || !eyesOpen) {
      lids.set(1);
      return;
    }
    // Drawn once per mount, so two orbs on screen never blink in step.
    const gap = BLINK_GAP_MIN_MS + Math.random() * BLINK_GAP_RANGE_MS;
    lids.set(
      withRepeat(
        withSequence(
          withDelay(gap, withTiming(0, { duration: BLINK_DOWN_MS })),
          withTiming(1, { duration: BLINK_UP_MS }),
        ),
        -1,
        false,
      ),
    );
    return () => cancelAnimation(lids);
  }, [reduceMotion, idle, eyesOpen, lids]);

  /*
   * The pout and the blow. `pout` crosses the resting mouth over to the
   * pursed one; `sway` bends the hair. Both come from one cycle
   * (mascot-hair.ts) so they never drift apart: rest, pout, blow,
   * relax. The `blow` expression pins the pout and keeps the hair
   * streaming instead.
   */
  useEffect(() => {
    if (reduceMotion) {
      pout.set(blowing ? 1 : 0);
      sway.set(0);
      return;
    }
    if (blowing) {
      pout.set(withTiming(1, { duration: FADE_MS }));
      sway.set(
        withRepeat(
          withSequence(
            withTiming(1, { duration: 420, easing: Easing.inOut(Easing.sin) }),
            withTiming(0.45, { duration: 520, easing: Easing.inOut(Easing.sin) }),
          ),
          -1,
          false,
        ),
      );
      return () => {
        cancelAnimation(pout);
        cancelAnimation(sway);
      };
    }
    if (!idle) {
      pout.set(withTiming(0, { duration: FADE_MS }));
      sway.set(withTiming(0, { duration: BLOW_MS / 2 }));
      return;
    }
    // Drawn once per mount, so two orbs on screen never blow in step.
    const cycle = blowCycle(REST_MIN_MS + Math.random() * REST_RANGE_MS);
    pout.set(withSequence(withTiming(0, { duration: FADE_MS }), withRepeat(play(cycle.pout), -1, false)));
    sway.set(withSequence(withTiming(0, { duration: FADE_MS }), withRepeat(play(cycle.sway), -1, false)));
    return () => {
      cancelAnimation(pout);
      cancelAnimation(sway);
    };
  }, [reduceMotion, idle, blowing, pout, sway]);

  /*
   * The cross-fade from the face that was showing to the one asked
   * for, and then the old face let go. Under Reduce Motion no previous
   * face is ever kept, so this only sets the fade to done.
   */
  useEffect(() => {
    if (shown.previous === null) {
      fade.set(1);
      return;
    }
    fade.set(0);
    fade.set(withTiming(1, { duration: FADE_MS }));
    const release = setTimeout(() => {
      setShown((s) => (s.previous === null ? s : { current: s.current, previous: null }));
    }, FADE_MS + 40);
    return () => clearTimeout(release);
  }, [shown, fade]);

  /* The glance, and the lock that lifts in thought. */
  useEffect(() => {
    if (reduceMotion) {
      lift.set(thinking ? 1 : 0);
      look.set(0);
      return;
    }
    lift.set(withTiming(thinking ? 1 : 0, { duration: LIFT_MS, easing: Easing.out(Easing.quad) }));
    if (!glancing) {
      look.set(withTiming(0, { duration: GLANCE_MOVE_MS }));
      return;
    }
    look.set(
      withRepeat(
        withSequence(
          withDelay(GLANCE_WAIT_MS, withTiming(1, { duration: GLANCE_MOVE_MS, easing: Easing.out(Easing.quad) })),
          withDelay(GLANCE_HOLD_MS, withTiming(0, { duration: GLANCE_MOVE_MS, easing: Easing.out(Easing.quad) })),
          withDelay(GLANCE_REST_MS, withTiming(0, { duration: 1 })),
        ),
        -1,
        false,
      ),
    );
    return () => cancelAnimation(look);
  }, [reduceMotion, thinking, glancing, look, lift]);

  const breathing = useAnimatedStyle(() => ({
    transform: [{ scale: breath.get() }],
  }));

  /* The two face layers, the lids, and the pout that sits over either mouth. */
  const currentFace = useAnimatedProps(() => ({ opacity: fade.get() }));
  const previousFace = useAnimatedProps(() => ({ opacity: 1 - fade.get() }));
  const currentMouth = useAnimatedProps(() => ({ opacity: fade.get() * (1 - pout.get()) }));
  const previousMouth = useAnimatedProps(() => ({ opacity: (1 - fade.get()) * (1 - pout.get()) }));
  const pursed = useAnimatedProps(() => ({ opacity: pout.get() }));
  const eyesLit = useAnimatedProps(() => ({ opacity: lids.get() }));
  const lidsDown = useAnimatedProps(() => ({ opacity: 1 - lids.get() }));

  /* Where the round eyes rest, and where a glance flicks to. */
  const restAt = thinking ? LOOK_THINK : gaze === 'question' ? LOOK_QUESTION : { x: 0, y: 0 };
  const flickAt = thinking ? LOOK_THINK : gaze === 'question' ? { x: 0, y: 0 } : LOOK_QUESTION;
  const leftPupil = useAnimatedProps(() => {
    const t = look.get();
    return {
      cx: CENTRE - PUPIL_DX + restAt.x + (flickAt.x - restAt.x) * t,
      cy: PUPIL_Y + restAt.y + (flickAt.y - restAt.y) * t,
    };
  });
  const rightPupil = useAnimatedProps(() => {
    const t = look.get();
    return {
      cx: CENTRE + PUPIL_DX + restAt.x + (flickAt.x - restAt.x) * t,
      cy: PUPIL_Y + restAt.y + (flickAt.y - restAt.y) * t,
    };
  });

  /*
   * The hair: one path string per frame, built once on the UI thread,
   * read by the ink and by the sheen. Reanimated will not share one
   * animated-props object across two components, so the string is a
   * derived value and each path reads it.
   */
  const hairD = useDerivedValue(() => hairPaths(sway.get(), lift.get()));
  const hair = useAnimatedProps(() => ({ d: hairD.get() }));
  const hairSheen = useAnimatedProps(() => ({ d: hairD.get() }));
  const stillHair = reduceMotion ? hairPaths(0, thinking ? 1 : 0) : null;

  const line = {
    stroke: colors.text,
    strokeWidth: STROKE,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };
  /*
   * The hair's ink: the deep leaf tone in the light theme, and the sage
   * accent in the dark one, where the leaf shadow is black on black and
   * the text tone would be the face's own white. The sheen down the
   * middle of each strand is one step lighter: the accent in the light
   * theme, the text tone at half strength in the dark.
   */
  const dark = scheme === 'dark';
  const strand = {
    stroke: dark ? colors.accent : colors.leafShadow,
    strokeWidth: HAIR_STROKE,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };
  /*
   * An ear is not hair: it is filled with the orb's own tone and
   * outlined in the hair's ink at a lighter weight, and it is drawn
   * after the hair, so the swept ends finish under it rather than
   * beside it — which is what "tucked behind the ear" means on a
   * drawing.
   */
  const ear = { ...strand, fill: colors.orbNeutralMid, strokeWidth: EAR_STROKE };
  const sheen = {
    stroke: dark ? colors.text : colors.accent,
    strokeOpacity: dark ? 0.5 : 1,
    strokeWidth: HAIR_SHEEN,
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

  const current = FACE[shown.current];
  const previous = shown.previous === null ? null : FACE[shown.previous];

  const mouthOf = (face: Face) => (
    <>
      {face.teeth ? (
        <G>
          <Rect
            x={36}
            y={54}
            width={28}
            height={9}
            rx={3.5}
            fill={glint.color}
            fillOpacity={glint.opacity}
            stroke={colors.text}
            strokeWidth={2.4}
          />
          {[43, 50, 57].map((x) => (
            <Line key={x} x1={x} y1={54} x2={x} y2={63} stroke={colors.text} strokeWidth={1.6} />
          ))}
          <Line x1={36} y1={58.5} x2={64} y2={58.5} stroke={colors.text} strokeWidth={1.6} />
        </G>
      ) : face.mouth ? (
        <Path d={face.mouth} {...line} />
      ) : null}
    </>
  );

  const eyesOf = (face: Face, moving: boolean) =>
    face.eyes === 'arc' ? (
      <>
        <Path d={face.left} {...line} />
        <Path d={face.right} {...line} />
      </>
    ) : moving ? (
      <>
        <AnimatedCircle r={PUPIL_R} fill={colors.text} animatedProps={leftPupil} />
        <AnimatedCircle r={PUPIL_R} fill={colors.text} animatedProps={rightPupil} />
      </>
    ) : (
      <>
        <Circle cx={CENTRE - PUPIL_DX + restAt.x} cy={PUPIL_Y + restAt.y} r={PUPIL_R} fill={colors.text} />
        <Circle cx={CENTRE + PUPIL_DX + restAt.x} cy={PUPIL_Y + restAt.y} r={PUPIL_R} fill={colors.text} />
      </>
    );

  const lidsOf = (face: Face) => (
    <>
      <Path d={LIDS[face.eyes].left} {...line} />
      <Path d={LIDS[face.eyes].right} {...line} />
    </>
  );

  const a11y = accessible
    ? { accessible: true, accessibilityRole: 'image' as const, accessibilityLabel }
    : { accessible: false, importantForAccessibility: 'no-hide-descendants' as const };

  return (
    <Animated.View {...a11y} style={[{ width: size, height: size }, breathing, style]}>
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

      {/* The orb: the sphere, the mouth, the eyes, and the hair over all of it. */}
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

        {previous ? <AnimatedG animatedProps={previousMouth}>{mouthOf(previous)}</AnimatedG> : null}
        <AnimatedG animatedProps={currentMouth}>{mouthOf(current)}</AnimatedG>

        {/* The pout: lips pursed to blow, with a little light on them. */}
        <AnimatedG animatedProps={pursed}>
          <Ellipse cx={CENTRE} cy={61} rx={4.6} ry={3.6} fill={colors.text} />
          <Ellipse cx={CENTRE - 1.2} cy={60} rx={1.5} ry={0.9} fill={glint.color} fillOpacity={glint.opacity} />
        </AnimatedG>

        {/* The eyes, and the closed lids a blink crosses to. */}
        <AnimatedG animatedProps={eyesLit}>
          {previous ? <AnimatedG animatedProps={previousFace}>{eyesOf(previous, false)}</AnimatedG> : null}
          <AnimatedG animatedProps={currentFace}>{eyesOf(current, true)}</AnimatedG>
        </AnimatedG>
        {eyesOpen ? <AnimatedG animatedProps={lidsDown}>{lidsOf(current)}</AnimatedG> : null}

        {/* The hair, over everything: the locks hang in front of the eyes. */}
        {stillHair !== null ? (
          <G>
            <Path d={stillHair} {...strand} />
            <Path d={stillHair} {...sheen} />
          </G>
        ) : (
          <G>
            <AnimatedPath animatedProps={hair} {...strand} />
            <AnimatedPath animatedProps={hairSheen} {...sheen} />
          </G>
        )}

        {/* The ears, over the swept ends, so the hair is tucked behind them. */}
        <Path d={EARS} {...ear} />
      </Svg>
    </Animated.View>
  );
}
