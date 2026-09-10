/**
 * Hair Journey — design tokens.
 *
 * One source of truth for colour, type, spacing, radius, depth and motion.
 * Screens and components must never hard-code a raw colour or pixel value;
 * pull from here so light and dark stay in lockstep.
 */

import { Platform } from 'react-native';

/* ------------------------------------------------------------------ *
 * Palette
 *
 * The identity is calm and private rather than clinical. A muted jade
 * carries "growth" without the medical-blue cliché; warm neutrals keep
 * long photo timelines from feeling like a hospital chart.
 * ------------------------------------------------------------------ */

const palette = {
  jade50: '#EAF5F1',
  jade100: '#CDE7DE',
  jade400: '#4FBFA4',
  jade500: '#2F8E78',
  jade600: '#256F5E',

  sand100: '#F4EFE7',
  sand300: '#DFD3C3',

  amber400: '#E0A458',

  rose400: '#D96C6C',

  ink900: '#0B0C0E',
  ink800: '#121417',
  ink700: '#191C20',
  ink600: '#22262B',
  ink500: '#2E3339',
  ink400: '#454B53',

  slate500: '#6B7076',
  slate400: '#8A9099',
  slate300: '#A8AEB6',

  paper: '#F7F6F3',
  white: '#FFFFFF',
} as const;

export type ColorTokens = {
  /** App background, furthest back. */
  background: string;
  /** Slightly raised background for grouped sections. */
  backgroundSubtle: string;
  /** Card and sheet surfaces. */
  surface: string;
  /** A surface sitting on top of another surface. */
  surfaceElevated: string;
  /** Fill for inert controls, chips, progress tracks. */
  fill: string;
  /** Fill for a selected control. */
  fillSelected: string;

  text: string;
  textSecondary: string;
  textTertiary: string;
  /** Text that sits on top of `accent`. */
  textOnAccent: string;

  accent: string;
  accentSoft: string;
  accentBorder: string;

  success: string;
  warning: string;
  danger: string;

  separator: string;
  /** Hairline border for glass and cards. */
  border: string;

  /** Tint applied to glass surfaces where real blur is unavailable. */
  glassTint: string;
  /** Border that gives a glass surface its lit edge. */
  glassBorder: string;

  /** Scrim behind modals and sheets. */
  scrim: string;
};

export const lightColors: ColorTokens = {
  background: palette.paper,
  backgroundSubtle: '#EFEDE8',
  surface: palette.white,
  surfaceElevated: palette.white,
  fill: '#EAE8E3',
  fillSelected: '#DFDCD5',

  text: '#16181C',
  textSecondary: palette.slate500,
  textTertiary: palette.slate400,
  textOnAccent: palette.white,

  accent: palette.jade500,
  accentSoft: palette.jade50,
  accentBorder: palette.jade100,

  success: palette.jade500,
  warning: palette.amber400,
  danger: palette.rose400,

  separator: 'rgba(22, 24, 28, 0.08)',
  border: 'rgba(22, 24, 28, 0.10)',

  glassTint: 'rgba(255, 255, 255, 0.72)',
  glassBorder: 'rgba(255, 255, 255, 0.60)',

  scrim: 'rgba(11, 12, 14, 0.32)',
};

export const darkColors: ColorTokens = {
  background: palette.ink900,
  backgroundSubtle: palette.ink800,
  surface: palette.ink700,
  surfaceElevated: palette.ink600,
  fill: palette.ink600,
  fillSelected: palette.ink500,

  text: '#F2F3F5',
  textSecondary: palette.slate300,
  textTertiary: palette.slate400,
  textOnAccent: '#04201A',

  accent: palette.jade400,
  accentSoft: 'rgba(79, 191, 164, 0.14)',
  accentBorder: 'rgba(79, 191, 164, 0.28)',

  success: palette.jade400,
  warning: palette.amber400,
  danger: '#E88585',

  separator: 'rgba(255, 255, 255, 0.10)',
  border: 'rgba(255, 255, 255, 0.12)',

  glassTint: 'rgba(28, 31, 36, 0.66)',
  glassBorder: 'rgba(255, 255, 255, 0.14)',

  scrim: 'rgba(0, 0, 0, 0.52)',
};

/* ------------------------------------------------------------------ *
 * Spacing — a 4pt rhythm. Named by size, not by use, so the scale
 * survives redesigns.
 * ------------------------------------------------------------------ */

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 44,
  giant: 64,
} as const;

/* ------------------------------------------------------------------ *
 * Radius — generous but controlled. `card` is the workhorse.
 * ------------------------------------------------------------------ */

export const radius = {
  xs: 6,
  sm: 10,
  md: 14,
  card: 20,
  lg: 26,
  xl: 34,
  pill: 999,
} as const;

/* ------------------------------------------------------------------ *
 * Typography — native system faces, iOS rounded for numerals so the
 * dashboard reads like Apple Health rather than a spreadsheet.
 * ------------------------------------------------------------------ */

export const fontFamily = Platform.select({
  ios: {
    sans: 'system-ui',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    rounded: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    mono: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  },
})!;

type TypeStyle = {
  fontSize: number;
  lineHeight: number;
  fontWeight:
    | '100'
    | '200'
    | '300'
    | '400'
    | '500'
    | '600'
    | '700'
    | '800'
    | '900';
  letterSpacing?: number;
  fontFamily?: string;
};

export const typography = {
  /** Screen-owning display number, e.g. "8 months". */
  display: {
    fontSize: 44,
    lineHeight: 48,
    fontWeight: '700',
    letterSpacing: -1.1,
    fontFamily: fontFamily.rounded,
  },
  /** Large screen title. */
  title1: {
    fontSize: 32,
    lineHeight: 38,
    fontWeight: '700',
    letterSpacing: -0.6,
  },
  title2: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  title3: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '600',
    letterSpacing: -0.3,
  },
  headline: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  body: {
    fontSize: 16,
    lineHeight: 23,
    fontWeight: '400',
  },
  callout: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '400',
  },
  subhead: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '500',
  },
  footnote: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '400',
  },
  caption: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
  },
  /** Section headers — small, wide, quiet. */
  overline: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    letterSpacing: 0.7,
  },
  /** Emphasised statistic inside a card. */
  stat: {
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '700',
    letterSpacing: -0.6,
    fontFamily: fontFamily.rounded,
  },
} satisfies Record<string, TypeStyle>;

export type TypographyVariant = keyof typeof typography;

/* ------------------------------------------------------------------ *
 * Depth — shadows stay soft. Dark mode leans on surface contrast
 * instead, because large blurred shadows read as grey haze on black.
 * ------------------------------------------------------------------ */

export const shadow = {
  none: {},
  soft: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOpacity: 0.06,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
    },
    android: { elevation: 2 },
    default: {},
  })!,
  lifted: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOpacity: 0.1,
      shadowRadius: 26,
      shadowOffset: { width: 0, height: 12 },
    },
    android: { elevation: 6 },
    default: {},
  })!,
} as const;

/* ------------------------------------------------------------------ *
 * Motion — springs are the default because the brief asks for physical,
 * intentional interaction. Durations are only for opacity/colour.
 * ------------------------------------------------------------------ */

export const motion = {
  spring: {
    /** Everyday press feedback and small position changes. */
    snappy: { damping: 26, stiffness: 340, mass: 0.9 },
    /** Sheets and larger surfaces settling into place. */
    gentle: { damping: 24, stiffness: 180, mass: 1 },
    /** Playful, used sparingly — capture confirmation. */
    bouncy: { damping: 15, stiffness: 220, mass: 0.9 },
  },
  duration: {
    fast: 140,
    base: 240,
    slow: 380,
  },
  /** Scale applied to a pressed control. */
  pressScale: 0.97,
} as const;

/** Hit target floor from the Apple HIG / Material guidance. */
export const MIN_TOUCH_TARGET = 44;
