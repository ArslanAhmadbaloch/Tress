/**
 * Icon — one name, the right native glyph on each platform.
 *
 * iOS gets real SF Symbols (correct optical weight, animates, respects
 * Dynamic Type). Android and web fall back to Material Community icons,
 * chosen per name so shapes stay recognisable rather than approximate.
 */

import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Platform, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

/** Every icon the app uses, named by meaning rather than by glyph. */
export type IconName =
  | 'home'
  | 'journey'
  | 'capture'
  | 'community'
  | 'profile'
  | 'camera'
  | 'compare'
  | 'check'
  | 'checkCircle'
  | 'circle'
  | 'chevronRight'
  | 'chevronLeft'
  | 'close'
  | 'plus'
  | 'calendar'
  | 'clock'
  | 'note'
  | 'bell'
  | 'lock'
  | 'heart'
  | 'heartFilled'
  | 'comment'
  | 'share'
  | 'bookmark'
  | 'settings'
  | 'sparkle'
  | 'chart'
  | 'photo'
  | 'retake'
  | 'flame'
  | 'info'
  | 'warning'
  | 'trash'
  | 'sun'
  | 'moon'
  | 'phone'
  | 'learn'
  | 'search'
  | 'shield'
  | 'pencil'
  | 'trophy'
  | 'arrowRight'
  | 'chevronDown'
  | 'target'
  | 'globe'
  | 'mail'
  | 'star'
  | 'help'
  | 'drop'
  | 'leaf'
  | 'pill'
  | 'dumbbell'
  | 'idea'
  | 'arrowUpRight'
  | 'arrowDownRight'
  | 'follicle'
  | 'bottle'
  | 'capsule'
  | 'glass'
  | 'barcode'
  | 'torch';

type IconSpec = {
  /** SF Symbol name, iOS. */
  sf: SymbolViewProps['name'];
  /** Material Community name, Android + web. */
  md: keyof typeof MaterialCommunityIcons.glyphMap;
};

const ICONS: Record<IconName, IconSpec> = {
  home: { sf: 'house', md: 'home-outline' },
  journey: { sf: 'chart.bar', md: 'chart-timeline-variant' },
  capture: { sf: 'camera.fill', md: 'camera' },
  community: { sf: 'person.2.fill', md: 'account-group' },
  profile: { sf: 'person', md: 'account-outline' },

  camera: { sf: 'camera', md: 'camera-outline' },
  compare: { sf: 'rectangle.split.2x1', md: 'compare' },
  check: { sf: 'checkmark', md: 'check' },
  checkCircle: { sf: 'checkmark.circle.fill', md: 'check-circle' },
  circle: { sf: 'circle', md: 'checkbox-blank-circle-outline' },
  chevronRight: { sf: 'chevron.right', md: 'chevron-right' },
  chevronLeft: { sf: 'chevron.left', md: 'chevron-left' },
  close: { sf: 'xmark', md: 'close' },
  plus: { sf: 'plus', md: 'plus' },
  calendar: { sf: 'calendar', md: 'calendar-blank' },
  clock: { sf: 'clock', md: 'clock-outline' },
  note: { sf: 'text.alignleft', md: 'text' },
  bell: { sf: 'bell.fill', md: 'bell' },
  lock: { sf: 'lock.fill', md: 'lock' },
  heart: { sf: 'heart', md: 'heart-outline' },
  heartFilled: { sf: 'heart.fill', md: 'heart' },
  comment: { sf: 'bubble.left', md: 'comment-outline' },
  share: { sf: 'square.and.arrow.up', md: 'share-variant' },
  bookmark: { sf: 'bookmark', md: 'bookmark-outline' },
  settings: { sf: 'gearshape.fill', md: 'cog' },
  sparkle: { sf: 'sparkles', md: 'star-four-points-outline' },
  chart: { sf: 'chart.bar.fill', md: 'chart-bar' },
  photo: { sf: 'photo.on.rectangle', md: 'image-multiple-outline' },
  retake: { sf: 'arrow.counterclockwise', md: 'refresh' },
  flame: { sf: 'flame.fill', md: 'fire' },
  info: { sf: 'info.circle', md: 'information-outline' },
  warning: { sf: 'exclamationmark.triangle', md: 'alert-outline' },
  trash: { sf: 'trash', md: 'trash-can-outline' },
  sun: { sf: 'sun.max.fill', md: 'white-balance-sunny' },
  moon: { sf: 'moon.fill', md: 'moon-waning-crescent' },
  phone: { sf: 'iphone', md: 'cellphone' },
  learn: { sf: 'book', md: 'book-open-outline' },
  search: { sf: 'magnifyingglass', md: 'magnify' },
  shield: { sf: 'lock.shield', md: 'shield-check-outline' },
  pencil: { sf: 'square.and.pencil', md: 'pencil-outline' },
  trophy: { sf: 'trophy', md: 'trophy-outline' },
  arrowRight: { sf: 'arrow.right', md: 'arrow-right' },
  chevronDown: { sf: 'chevron.down', md: 'chevron-down' },
  target: { sf: 'target', md: 'target' },
  globe: { sf: 'globe', md: 'web' },
  mail: { sf: 'envelope', md: 'email-outline' },
  star: { sf: 'star', md: 'star-outline' },
  help: { sf: 'questionmark.circle', md: 'help-circle-outline' },
  drop: { sf: 'drop', md: 'water-outline' },
  leaf: { sf: 'leaf', md: 'leaf' },
  pill: { sf: 'pills', md: 'pill' },
  dumbbell: { sf: 'figure.strengthtraining.traditional', md: 'dumbbell' },
  idea: { sf: 'lightbulb', md: 'lightbulb-outline' },
  arrowUpRight: { sf: 'arrow.up.right', md: 'trending-up' },
  arrowDownRight: { sf: 'arrow.down.right', md: 'trending-down' },
  // Routine item glyphs: the reference distinguishes topical, tablet,
  // capsule and drink so a five-item list is scannable without reading.
  // Not a hair dryer. The only row using this is "Hair transplant", and
  // a dryer beside it reads as styling rather than a procedure.
  follicle: { sf: 'drop.triangle', md: 'seed-outline' },
  bottle: { sf: 'eyedropper', md: 'bottle-tonic-outline' },
  capsule: { sf: 'pill', md: 'pill' },
  glass: { sf: 'cup.and.saucer', md: 'cup-outline' },
  // Product scanner: the viewfinder on the entry button, the torch on
  // the scanning screen.
  barcode: { sf: 'barcode.viewfinder', md: 'barcode-scan' },
  torch: { sf: 'flashlight.on.fill', md: 'flashlight' },
};

export type IconProps = {
  name: IconName;
  size?: number;
  color: string;
  /** SymbolView takes a view style, the Material font takes a text style. */
  style?: StyleProp<ViewStyle & TextStyle>;
};

export function Icon({ name, size = 20, color, style }: IconProps) {
  const spec = ICONS[name];

  if (Platform.OS === 'ios') {
    return (
      <SymbolView
        name={spec.sf}
        size={size}
        tintColor={color}
        // Match the surrounding text weight rather than the SF default.
        weight="semibold"
        resizeMode="scaleAspectFit"
        style={[{ width: size, height: size }, style]}
      />
    );
  }

  return (
    <MaterialCommunityIcons
      name={spec.md}
      size={size}
      color={color}
      style={style as StyleProp<TextStyle>}
    />
  );
}

/** The SF Symbol name for a tab, used by NativeTabs on iOS. */
export function sfSymbolFor(name: IconName): SymbolViewProps['name'] {
  return ICONS[name].sf;
}

/** The Material name for a tab, used by NativeTabs on Android. */
export function materialFor(name: IconName): string {
  return ICONS[name].md;
}
