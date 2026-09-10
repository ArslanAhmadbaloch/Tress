/**
 * The Liquid Glass layer.
 *
 * Apple's model, which this follows: Liquid Glass is a *functional layer*
 * that sits above the content layer. Navigation and controls float in it;
 * content never does. Three rules follow from that, and they are enforced
 * here rather than left to each screen:
 *
 *   1. Glass is for chrome only. Cards, rows and photos stay opaque so the
 *      content stays the thing you look at.
 *   2. Glass is never stacked on glass. Related controls join a shared
 *      `GlassGroup` so their shapes merge into one element instead of
 *      layering two materials.
 *   3. Glass yields to accessibility. With Reduce Transparency on, every
 *      surface here becomes opaque — the layer still reads as chrome
 *      through its shape and elevation, not its translucency.
 *
 * Three tiers of implementation, so each platform gets the best real
 * effect rather than a faked one:
 *
 *   iOS 26+          native Liquid Glass (refraction, specular edge, motion)
 *   iOS < 26         expo-blur, a genuine backdrop blur
 *   Android / other  a tinted scrim, because SDK 57's Android blur needs an
 *                    explicit blurTarget that floating chrome cannot supply
 */

import { BlurView } from 'expo-blur';
import {
  GlassContainer,
  GlassView,
  isLiquidGlassAvailable,
} from 'expo-glass-effect';
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useDisplayPreferences } from '@/hooks/use-accessibility-display';
import { useTheme } from '@/theme';

/**
 * Resolved once at module load: it depends on the binary and OS version,
 * neither of which change while the app is running.
 */
const LIQUID_GLASS = isLiquidGlassAvailable();

/**
 * Values for chrome floating over a dark backdrop — a camera feed or a
 * photo. Independent of the app theme, because "dark" there is the
 * absence of a themed surface, not a theme choice.
 */
const OVER_DARK = {
  tint: 'rgba(22, 24, 28, 0.62)',
  border: 'rgba(255, 255, 255, 0.16)',
  opaque: 'rgba(28, 31, 36, 0.97)',
} as const;

export type GlassVariant = 'regular' | 'clear';

export type GlassSurfaceProps = {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  /**
   * `regular` is the default and carries the most contrast — use it for
   * anything containing text. `clear` is thinner and lets more of the
   * content through; reserve it for small controls over busy backdrops,
   * where the material should not compete with the content.
   */
  variant?: GlassVariant;
  borderRadius?: number;
  /** The lit hairline edge. Off for surfaces that bleed off-screen. */
  bordered?: boolean;
  /**
   * Reacts to touch on iOS 26+ with the same fluid response as system
   * controls. Only for surfaces that are themselves tappable.
   */
  interactive?: boolean;
  /** Force the dark treatment for chrome over photos or the camera. */
  over?: 'theme' | 'dark';
  /** Tints the material to suggest prominence. Use sparingly. */
  tint?: string;
};

export function GlassSurface({
  children,
  style,
  variant = 'regular',
  borderRadius,
  bordered = true,
  interactive = false,
  over = 'theme',
  tint,
}: GlassSurfaceProps) {
  const { colors, radius, scheme } = useTheme();
  const { reduceTransparency, increaseContrast } = useDisplayPreferences();

  const cornerRadius = borderRadius ?? radius.card;
  const forcedDark = over === 'dark';
  const effectiveScheme = forcedDark ? 'dark' : scheme;

  const borderColor = forcedDark ? OVER_DARK.border : colors.glassBorder;
  const edge: ViewStyle = bordered
    ? {
        borderWidth: increaseContrast ? 1 : StyleSheet.hairlineWidth,
        borderColor: increaseContrast ? colors.text : borderColor,
      }
    : {};

  const shape: ViewStyle = { borderRadius: cornerRadius, overflow: 'hidden' };

  // Reduce Transparency: drop the material, keep the layer. Shape, border
  // and elevation still say "this floats above the content".
  if (reduceTransparency) {
    return (
      <View
        style={[
          shape,
          edge,
          { backgroundColor: forcedDark ? OVER_DARK.opaque : colors.surface },
          style,
        ]}>
        {children}
      </View>
    );
  }

  if (LIQUID_GLASS) {
    return (
      <GlassView
        glassEffectStyle={variant}
        isInteractive={interactive}
        colorScheme={effectiveScheme}
        tintColor={tint}
        style={[shape, edge, style]}>
        {children}
      </GlassView>
    );
  }

  return (
    <BlurView
      // 0-100; clear reads noticeably thinner than regular.
      intensity={variant === 'clear' ? 34 : 58}
      tint={effectiveScheme === 'dark' ? 'dark' : 'light'}
      style={[shape, edge, style]}>
      {/*
        The tint carries the contrast, and on Android it is the whole
        effect: SDK 57's Android blur needs an explicit `blurTarget` view,
        which chrome floating over a camera feed cannot supply. On iOS it
        only deepens the real blur behind it.
      */}
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: forcedDark ? OVER_DARK.tint : colors.glassTint },
          tint ? { backgroundColor: tint } : null,
        ]}
      />
      {children}
    </BlurView>
  );
}

/**
 * Groups adjacent glass surfaces so they render as one element.
 *
 * Liquid Glass elements must not be layered on top of each other, and
 * multiple effects belong in a shared container for both rendering
 * performance and shape morphing. `spacing` controls how close two
 * surfaces get before their shapes merge.
 */
export function GlassGroup({
  children,
  spacing = 12,
  style,
}: {
  children: ReactNode;
  spacing?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { reduceTransparency } = useDisplayPreferences();

  // Without the real material there is nothing to merge, and the native
  // container would only add a layer.
  if (!LIQUID_GLASS || reduceTransparency) {
    return <View style={style}>{children}</View>;
  }

  return (
    <GlassContainer spacing={spacing} style={style}>
      {children}
    </GlassContainer>
  );
}

/** True when the running device renders real Liquid Glass. */
export const hasLiquidGlass = LIQUID_GLASS;
