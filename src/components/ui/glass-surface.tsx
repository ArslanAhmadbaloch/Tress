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
};

export function GlassSurface({
  children,
  style,
  variant = 'regular',
  borderRadius,
  bordered = true,
  interactive = false,
}: GlassSurfaceProps) {
  const { colors, radius, scheme } = useTheme();
  const cornerRadius = borderRadius ?? radius.card;

  const edge: ViewStyle = bordered
    ? { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder }
    : {};

  if (LIQUID_GLASS) {
    return (
      <GlassView
        glassEffectStyle={variant}
        isInteractive={interactive}
        colorScheme={scheme}
        style={[{ borderRadius: cornerRadius, overflow: 'hidden' }, edge, style]}>
        {children}
      </GlassView>
    );
  }

  return (
    <BlurView
      // `intensity` is a 0-100 scale; clear reads lighter than regular.
      intensity={variant === 'clear' ? 34 : 58}
      tint={scheme === 'dark' ? 'dark' : 'light'}
      style={[{ borderRadius: cornerRadius, overflow: 'hidden' }, edge, style]}>
      {/*
        BlurView alone is too transparent for text contrast on busy photo
        backgrounds, so a token-driven tint sits on top of it.
      */}
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: colors.glassTint }]}
      />
      {children}
    </BlurView>
  );
}

/** True when the running device renders real Liquid Glass. */
export const hasLiquidGlass = LIQUID_GLASS;
