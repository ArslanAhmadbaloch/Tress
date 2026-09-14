/**
 * Tress — design tokens.
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
  /* Sage — the single accent. Muted and botanical, never a signal green:
     this app is opened by people who are anxious about what they will see. */
  sage50: '#F1F6EF',
  sage100: '#E3EDDF',
  sage200: '#CBDCC4',
  sage400: '#8FB183',
  sage500: '#6E8F63',
  sage600: '#55704C',
  sage700: '#41573A',

  /* Warm mineral ground — limestone and paper, never neutral grey. */
  ivory: '#F0EEE9',
  ivoryDeep: '#E7E4DE',
  white: '#FFFFFF',

  ink900: '#0D0E10',
  ink800: '#141619',
  ink700: '#1B1E22',
  ink600: '#24282D',
  ink550: '#282D33',
  ink500: '#2F343A',
  ink450: '#383E45',

  stone500: '#71736F',
  stone400: '#9A9C97',
  stone300: '#B7B9B3',

  amber400: '#C99A5B',
  clay400: '#C77B6B',
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
  /** Label plate over a photograph, in either theme. */
  photoScrim: string;
  /** Text sitting on `photoScrim`. Light in both themes. */
  textOnPhoto: string;

  /*
   * The green glass orb behind each dashboard metric. A sphere of tinted
   * glass: a radial body lit from the upper left, a lit rim, a specular
   * glint on top, and light gathering at the bottom edge where a real
   * glass bead would focus it. Colours only — the geometry is in GlassOrb.
   */
  orbCore: string;
  orbMid: string;
  orbEdge: string;
  orbRimTop: string;
  orbRimBottom: string;
  /** Specular highlight and the caustic at the lower edge. */
  orbGlint: string;
  /** Contact shadow beneath the orb. */
  orbShadow: string;
  /** The progress arc around the orb, from its start to its tip. */
  arcStart: string;
  arcEnd: string;
  /** Uncoloured glass, for orbs that are not about progress. */
  orbNeutralCore: string;
  orbNeutralMid: string;
  orbNeutralEdge: string;
  orbNeutralRimBottom: string;
  /** The soft green light behind the selected tab. */
  tabGlow: string;
  /** The drawn frond shadow on the Learn guide covers. */
  leafShadow: string;
  /** The edge of each guide cover, firm enough to tell the books apart. */
  coverEdge: string;

  /*
   * The membership card. Drawn glass rather than the live material: it is
   * content, not chrome, and it has to survive being exported to a PNG,
   * where a backdrop blur has nothing behind it to sample.
   */
  cardTop: string;
  cardBottom: string;
  cardEdge: string;
  /** The inset panels the card's figures sit in. */
  cardPanel: string;
  cardPanelEdge: string;
  /** The field an exported card is laid on, so the PNG is not transparent. */
  cardExportTop: string;
  cardExportBottom: string;
  /** The light that crosses the card's glass. */
  cardRay: string;
  /** The slow green light that breathes inside it. */
  cardGlow: string;
};

export const lightColors: ColorTokens = {
  background: palette.ivory,
  backgroundSubtle: palette.ivoryDeep,
  surface: palette.white,
  surfaceElevated: palette.white,
  fill: '#EAE7E1',
  fillSelected: '#DEDAD3',

  text: '#16171A',
  textSecondary: palette.stone500,
  textTertiary: palette.stone400,
  textOnAccent: palette.white,

  accent: palette.sage500,
  accentSoft: palette.sage50,
  accentBorder: palette.sage100,

  success: palette.sage500,
  warning: palette.amber400,
  danger: palette.clay400,

  separator: 'rgba(22, 23, 26, 0.07)',
  border: 'rgba(22, 23, 26, 0.06)',

  /* Cards read as white ceramic resting on the warm ground, so the glass
     tint stays close to pure white rather than picking up the ivory. */
  glassTint: 'rgba(255, 255, 255, 0.78)',
  glassBorder: 'rgba(255, 255, 255, 0.85)',

  scrim: 'rgba(13, 14, 16, 0.28)',
  photoScrim: 'rgba(13, 14, 16, 0.55)',
  textOnPhoto: '#FFFFFF',

  orbCore: '#F8FBF6',
  orbMid: '#E9F2E4',
  orbEdge: '#CFE2C5',
  orbRimTop: 'rgba(255, 255, 255, 0.95)',
  orbRimBottom: '#BCD4B1',
  orbGlint: 'rgba(255, 255, 255, 0.92)',
  orbShadow: 'rgba(85, 112, 76, 0.17)',
  arcStart: '#DCEBD4',
  arcEnd: '#8DBF7B',
  orbNeutralCore: '#FFFFFF',
  orbNeutralMid: '#F6F5F2',
  orbNeutralEdge: '#E3E1DC',
  orbNeutralRimBottom: '#D8D5CF',
  tabGlow: '#D6EDCB',
  leafShadow: '#4E6448',
  coverEdge: 'rgba(22, 23, 26, 0.16)',

  cardTop: 'rgba(255, 255, 255, 0.88)',
  cardBottom: 'rgba(255, 255, 255, 0.66)',
  cardEdge: 'rgba(255, 255, 255, 0.92)',
  cardPanel: 'rgba(255, 255, 255, 0.62)',
  cardPanelEdge: 'rgba(255, 255, 255, 0.78)',
  cardExportTop: '#F4F2ED',
  cardExportBottom: '#E7E3DB',
  /* Green rather than white: on near-white glass a white gleam is not a
     gleam, and the light in this product has always been the sage. */
  cardRay: '#CBE7B8',
  cardGlow: '#9FCB89',
};

export const darkColors: ColorTokens = {
  background: palette.ink900,
  backgroundSubtle: palette.ink800,
  /*
   * Surfaces sit deliberately higher than a conventional dark theme would
   * put them. The background plates photograph as lit walls, and after
   * their veils land around luminance 28, a card at the old ink700 (29)
   * would have been level with the ground it is meant to float on. These
   * values keep roughly twelve points of separation, which is what makes
   * the card read as a panel resting on a surface rather than a hole cut
   * into one.
   */
  surface: palette.ink550,
  surfaceElevated: palette.ink500,
  fill: palette.ink500,
  fillSelected: palette.ink450,

  text: '#F3F2EF',
  textSecondary: palette.stone300,
  textTertiary: palette.stone400,
  textOnAccent: '#0F1A0C',

  accent: palette.sage400,
  accentSoft: 'rgba(143, 177, 131, 0.14)',
  accentBorder: 'rgba(143, 177, 131, 0.26)',

  success: palette.sage400,
  warning: palette.amber400,
  danger: '#D8907F',

  separator: 'rgba(255, 255, 255, 0.09)',
  border: 'rgba(255, 255, 255, 0.10)',

  glassTint: 'rgba(27, 30, 34, 0.68)',
  glassBorder: 'rgba(255, 255, 255, 0.13)',

  scrim: 'rgba(0, 0, 0, 0.55)',
  photoScrim: 'rgba(13, 14, 16, 0.62)',
  textOnPhoto: '#FFFFFF',

  /* Dark glass is mostly transparent: the tint and the lit rim carry it,
     because a bright body would glow like a lamp on a dark card. */
  orbCore: 'rgba(176, 206, 164, 0.44)',
  orbMid: 'rgba(143, 177, 131, 0.27)',
  orbEdge: 'rgba(143, 177, 131, 0.16)',
  orbRimTop: 'rgba(255, 255, 255, 0.40)',
  orbRimBottom: 'rgba(143, 177, 131, 0.32)',
  orbGlint: 'rgba(255, 255, 255, 0.24)',
  orbShadow: 'rgba(0, 0, 0, 0.42)',
  arcStart: 'rgba(143, 177, 131, 0.38)',
  arcEnd: '#9CC98A',
  orbNeutralCore: 'rgba(255, 255, 255, 0.17)',
  orbNeutralMid: 'rgba(255, 255, 255, 0.09)',
  orbNeutralEdge: 'rgba(255, 255, 255, 0.05)',
  orbNeutralRimBottom: 'rgba(255, 255, 255, 0.14)',
  tabGlow: 'rgba(143, 177, 131, 0.34)',
  /* A shadow is darker than the paper it falls on, in both themes. */
  leafShadow: '#000000',
  coverEdge: 'rgba(255, 255, 255, 0.22)',

  cardTop: 'rgba(255, 255, 255, 0.12)',
  cardBottom: 'rgba(255, 255, 255, 0.05)',
  cardEdge: 'rgba(255, 255, 255, 0.18)',
  cardPanel: 'rgba(255, 255, 255, 0.07)',
  cardPanelEdge: 'rgba(255, 255, 255, 0.11)',
  cardExportTop: '#23272C',
  cardExportBottom: '#14171A',
  /* Dark glass catches less: a bright ray would read as a searchlight. */
  cardRay: 'rgba(178, 214, 160, 0.52)',
  cardGlow: 'rgba(143, 177, 131, 0.9)',
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
 * Radius
 *
 * Apple's guidance is that the hardware's curvature informs every nested
 * shape, so radii step up as containers get larger and nested shapes stay
 * concentric with their parent. `card` is the workhorse; `section` matches
 * the larger corner radius grouped lists took on in the refresh.
 * ------------------------------------------------------------------ */

export const radius = {
  xs: 6,
  sm: 10,
  md: 14,
  card: 20,
  section: 26,
  lg: 28,
  xl: 34,
  pill: 999,
} as const;

/**
 * The radius a child should use to sit concentrically inside a parent.
 *
 * Two rounded rectangles look wrong together unless the inner radius is
 * the outer radius minus the gap between them — otherwise the curves run
 * at different rates and the inset shape reads as a sticker. Apple calls
 * this concentricity; SwiftUI exposes it as ConcentricRectangle.
 */
export function concentricRadius(outerRadius: number, inset: number): number {
  return Math.max(4, outerRadius - inset);
}

/* ------------------------------------------------------------------ *
 * Layout metrics
 *
 * The refresh gave lists and forms more room to breathe: taller rows and
 * more padding, so content reads clearly through the glass layer.
 * ------------------------------------------------------------------ */

export const metrics = {
  /** Minimum height of a row in a grouped list. */
  rowHeight: 52,
  /** Inner padding of a grouped section. */
  sectionPadding: 18,
  /** How far floating chrome sits from the screen edge. */
  floatingInset: 16,
  /**
   * Height of the fade that obscures content scrolling beneath fixed
   * chrome. Apple calls this the scroll edge effect; without it, text
   * passing under a translucent bar becomes unreadable.
   */
  scrollEdgeHeight: 44,
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
    /* The membership card's voice. A warm old-style serif, which is what
       the design uses for the name and the phrase; the interface stays on
       the system face everywhere else. */
    serif: 'Palatino',
    serifItalic: 'Palatino',
    serifSemibold: 'Palatino',
  },
  default: {
    sans: 'normal',
    rounded: 'normal',
    mono: 'monospace',
    /*
      Android has no Palatino, and the generic `serif` alias resolves to
      Noto Serif — a different face with different proportions, on the
      membership card, which is the one artefact somebody keeps and looks
      at. So the serif is bundled here.

      Three named faces rather than one plus `fontWeight`/`fontStyle`:
      Android does not synthesise a bundled family's weights or its
      italic, and asking it to gives you the regular face back with no
      warning. Every serif style the app uses has its own entry.
    */
    serif: 'Lora_400Regular',
    serifItalic: 'Lora_400Regular_Italic',
    serifSemibold: 'Lora_600SemiBold',
  },
  web: {
    sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    rounded: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    mono: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    serif: 'Palatino, "Palatino Linotype", Georgia, serif',
    serifItalic: 'Palatino, "Palatino Linotype", Georgia, serif',
    serifSemibold: 'Palatino, "Palatino Linotype", Georgia, serif',
  },
})!;

/**
 * The serif's italic and semibold cuts, as whole style objects.
 *
 * The two platforms want opposite things and there is no single spelling
 * that works on both. iOS takes one family name and synthesises the cut
 * from `fontStyle` / `fontWeight`. Android resolves a bundled font by
 * exact file name, and setting either of those alongside one makes it
 * look for a variant of that file, fail to find it, and fall back to the
 * system sans — silently, and in italic that is very easy to miss.
 *
 * So each platform gets the spelling it understands, in one place.
 */
export const serifItalicStyle = Platform.select({
  ios: { fontFamily: 'Palatino', fontStyle: 'italic' as const },
  default: { fontFamily: fontFamily.serifItalic },
  web: { fontFamily: fontFamily.serifItalic, fontStyle: 'italic' as const },
})!;

export const serifSemiboldStyle = Platform.select({
  ios: { fontFamily: 'Palatino', fontWeight: '600' as const },
  default: { fontFamily: fontFamily.serifSemibold },
  web: { fontFamily: fontFamily.serifSemibold, fontWeight: '600' as const },
})!;

type TypeStyle = {
  fontSize: number;
  lineHeight: number;
  /**
   * Optional only because the serif variant leaves it off on Android,
   * where naming the semibold file and also asking for weight 600 makes
   * the platform fall back to the system sans.
   */
  fontWeight?:
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
    fontSize: 34,
    lineHeight: 39,
    fontWeight: '700',
    letterSpacing: -0.8,
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
  /**
   * Small quiet label above a value or group. Title case, with only a
   * hair of tracking — the all-caps, widely-tracked treatment reads as a
   * pre-refresh interface now that section headers are title case.
   */
  overline: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  /** Emphasised statistic inside a card. */
  stat: {
    fontSize: 34,
    lineHeight: 38,
    fontWeight: '700',
    letterSpacing: -0.8,
  },
  /** The number on a dashboard metric tile, sized for a third of the width. */
  metric: {
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '700',
    letterSpacing: -0.7,
  },
  /**
   * Smallest readable step. Chart axes and photo credits only — if a
   * sentence needs this size to fit, the sentence is too long.
   */
  micro: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '500',
    letterSpacing: 0.1,
  },
  /**
   * The funnel's asking voice.
   *
   * The old-style serif the membership card already speaks in, borrowed
   * for the questions because they are the one place in the app that is a
   * conversation rather than an interface. The sans is right for a
   * dashboard reading numbers back at you; it makes "what would better
   * hair mean to you" sound like a form field.
   *
   * Unlike `script` this is a reading face, so it carries the whole
   * question at a size that holds three lines without crowding.
   */
  question: {
    fontSize: 33,
    lineHeight: 41,
    letterSpacing: -0.3,
    ...serifSemiboldStyle,
  },
  /**
   * Decorative editorial script, for the one motivational phrase a screen
   * is allowed. Never for anything the user has to read to use the app —
   * it is an accent, and it is not especially legible at small sizes.
   */
  script: {
    fontSize: 19,
    lineHeight: 24,
    fontWeight: '400',
    fontFamily: 'Parisienne_400Regular',
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
    // Elevation is a distance, not a blur radius: matching iOS by eye
    // takes roughly half the shadowRadius. At elevation 2 these surfaces
    // sat flat on the page next to the same screen on iOS.
    android: { elevation: 4 },
    default: {},
  })!,
  lifted: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOpacity: 0.1,
      shadowRadius: 26,
      shadowOffset: { width: 0, height: 12 },
    },
    android: { elevation: 13 },
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

/* ------------------------------------------------------------------ *
 * Launch
 *
 * The splash is the brand lockup exactly as it was designed: one fixed
 * light composition in both appearances. The plate, the mark and their
 * shadows are a single photograph, and veiling it for dark mode would
 * only muddy the artwork — the exit cross-fade is what carries a
 * dark-mode user into the dark app.
 * ------------------------------------------------------------------ */

export const launch = {
  /** The plate's own paper, so the screen opens on its colour. */
  paper: '#F0E9E3',
  /** Warm light gathering behind the mark, and the sheen crossing it. */
  light: '#FFFDF7',
} as const;

/* ------------------------------------------------------------------ *
 * Icon sizing
 *
 * Five optical steps. An interface icon picks one of these; anything
 * larger is a deliberate hero and is sized where it is drawn. Before this
 * existed the app used twenty-four different icon sizes, which is the kind
 * of drift nobody can point at but everybody can feel.
 * ------------------------------------------------------------------ */

export const iconSize = {
  /** Inside a chip, a caption row, a small badge. */
  xs: 12,
  /** The workhorse: list rows, inline affordances. */
  sm: 15,
  /** Section actions, toolbar controls. */
  md: 18,
  /** A control that is the point of its row. */
  lg: 22,
  /** Standalone, with nothing competing. */
  xl: 28,
} as const;

/** Hit target floor from the Apple HIG / Material guidance. */
export const MIN_TOUCH_TARGET = 44;

/**
 * The same colour at zero alpha.
 *
 * Fading a surface to `transparent` is not the same thing: on some
 * renderers that interpolates through black and leaves a grey haze at the
 * midpoint. A gradient has to fade to its own colour with the alpha
 * removed, which is what this produces.
 */
export function withZeroAlpha(color: string): string {
  if (color.startsWith('#') && (color.length === 7 || color.length === 4)) {
    const full =
      color.length === 4
        ? `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`
        : color;
    const r = parseInt(full.slice(1, 3), 16);
    const g = parseInt(full.slice(3, 5), 16);
    const b = parseInt(full.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, 0)`;
  }
  // Already a functional colour; swap its alpha to zero.
  return color.replace(/rgba?\(([^)]+)\)/, (_m, inner) => {
    const parts = String(inner).split(',').slice(0, 3).map((v) => v.trim());
    return `rgba(${parts.join(', ')}, 0)`;
  });
}

/**
 * A colour split into its opaque part and its alpha.
 *
 * SVG gradient stops ignore the alpha inside rgba() on iOS: the stop takes
 * the colour at full strength and only honours `stopOpacity`. Anything
 * that feeds a translucent token into a gradient has to pass the alpha
 * separately, or glass that should be a tint renders as a solid bead.
 */
export function splitAlpha(color: string): { color: string; opacity: number } {
  const m = color.match(/rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/);
  if (!m) return { color, opacity: 1 };
  return { color: `rgb(${m[1]}, ${m[2]}, ${m[3]})`, opacity: Number(m[4]) };
}
