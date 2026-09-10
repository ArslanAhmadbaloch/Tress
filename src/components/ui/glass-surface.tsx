/**
 * GlassSurface — the app's translucent material.
 *
 * Three tiers, picked at runtime so every platform gets the best real
 * effect available rather than a faked one:
 *
 *   1. iOS 26+          native Liquid Glass via expo-glass-effect
 *   2. iOS < 26, Android  expo-blur, which is a genuine backdrop blur
 *   3. anything else    an opaque tinted surface
 *
 * Content stays the visual priority: this is for chrome (nav bars,
 * floating controls, sheets), not for wrapping whole screens.
 */

import { BlurView } from 'expo-blur';
import { isLiquidGlassAvailable } from 'expo-glass-effect';
import { GlassView } from 'expo-glass-effect';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { ReactNode } from 'react';

import { useTheme } from '@/theme';

/**
 * Resolved once at module load: it depends on the binary and OS version,
 * neither of which change while the app is running.
 */
const LIQUID_GLASS = isLiquidGlassAvailable();

export type GlassSurfaceProps = {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** `clear` is lighter and lets more colour through than `regular`. */
  variant?: 'regular' | 'clear';
  /** Corner radius; also clips the blur so the edges stay crisp. */
  borderRadius?: number;
  /** Draw the lit hairline edge. Off for full-bleed bars. */
  bordered?: boolean;
  /** Reacts to touch on iOS 26+. Only for genuinely tappable surfaces. */
  interactive?: boolean;
  /**
   * Force the material's light/dark treatment regardless of app theme.
   * Chrome floating over a camera feed or a photo is always on a dark
   * backdrop, so it must stay dark even in light mode — otherwise white
   * label text lands on a near-white surface.
   */
  over?: 'theme' | 'dark';
};

/** Dark-context material values, independent of the app theme. */
const DARK_OVER = {
  tint: 'rgba(22, 24, 28, 0.62)',
  border: 'rgba(255, 255, 255, 0.16)',
} as const;

export function GlassSurface({
  children,
  style,
  variant = 'regular',
  borderRadius,
  bordered = true,
  interactive = false,
  over = 'theme',
}: GlassSurfaceProps) {
  const { colors, radius, scheme } = useTheme();
  const cornerRadius = borderRadius ?? radius.card;

  const forcedDark = over === 'dark';
  const effectiveScheme = forcedDark ? 'dark' : scheme;
  const tint = forcedDark ? DARK_OVER.tint : colors.glassTint;
  const borderColor = forcedDark ? DARK_OVER.border : colors.glassBorder;

  const edge: ViewStyle = bordered
    ? { borderWidth: StyleSheet.hairlineWidth, borderColor }
    : {};

  if (LIQUID_GLASS) {
    return (
      <GlassView
        glassEffectStyle={variant}
        isInteractive={interactive}
        colorScheme={effectiveScheme}
        style={[{ borderRadius: cornerRadius, overflow: 'hidden' }, edge, style]}>
        {children}
      </GlassView>
    );
  }

  return (
    <BlurView
      // `intensity` is a 0-100 scale; clear reads lighter than regular.
      intensity={variant === 'clear' ? 34 : 58}
      tint={effectiveScheme === 'dark' ? 'dark' : 'light'}
      style={[{ borderRadius: cornerRadius, overflow: 'hidden' }, edge, style]}>
      {/*
        The tint is what carries contrast, and on Android it is the whole
        effect: SDK 57's Android blur needs an explicit `blurTarget` view,
        which floating chrome over a camera feed cannot supply. iOS blurs
        natively behind this, so the tint only deepens it there.
      */}
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: tint }]}
      />
      {children}
    </BlurView>
  );
}

/** True when the running device renders real Liquid Glass. */
export const hasLiquidGlass = LIQUID_GLASS;
