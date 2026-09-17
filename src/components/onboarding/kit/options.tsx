/**
 * The four shapes an answer can take.
 *
 *   OptionPill   a white pill with the label and nothing else — for lists
 *                of short answers (age bands, how often)
 *   OptionRow    a pill with an outline icon, a title and a grey line
 *                beneath it — for answers that need a sentence of help;
 *                with `check` it grows a circle check on the right and
 *                becomes the full-width multiple-choice row the reference
 *                uses for concerns
 *   OptionCard   a two-column card with an icon or a sub-line and a circle
 *                check top-right — for multiple choice
 *   CardGrid     the two-column wrap the cards sit in
 *
 * All of them are white ceramic on the cream ground: no outline at rest,
 * a soft wide shadow, and a press that shrinks them by two percent. A
 * pill or a row shows it is chosen with a subtle accent border; a card
 * shows it with the check filling in. Nothing else changes, because one
 * fact wants one signal.
 *
 * An icon may be a node or a function of the colour it should be drawn
 * in. The function form is the safe one: the row knows what its disc is
 * filled with and hands back the colour that reads on it, so a dark disc
 * never ends up with a dark icon on it. A bare node is drawn as given.
 *
 * Every label arrives through props. The shapes here are mute.
 */

import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

import { useInk } from './ink';

/** How far a chosen surface shrinks under the finger. */
const PRESS = 0.98;
/** A pill's height. Taller than a hit target needs: it is an answer, not a chip. */
const PILL_HEIGHT = 70;
/** The selected outline. */
const SELECTED_BORDER = 1.5;
/** The circle check on a card. */
const CHECK = 22;
/** The coloured disc behind a row's icon. */
const DISC = 46;

/* --------------------------------- pill ---------------------------------- */

export function OptionPill({
  label,
  selected = false,
  onPress,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
}) {
  const { colors, spacing, radius, shadow } = useTheme();

  return (
    <PressableScale
      onPress={onPress}
      scaleTo={PRESS}
      accessibilityRole="radio"
      accessibilityState={{ selected, checked: selected }}
      accessibilityLabel={label}
      style={[
        {
          minHeight: PILL_HEIGHT,
          justifyContent: 'center',
          paddingHorizontal: spacing.xxl,
          paddingVertical: spacing.lg,
          borderRadius: radius.pill,
          backgroundColor: colors.surface,
          borderWidth: SELECTED_BORDER,
          borderColor: selected ? colors.accent : 'transparent',
        },
        shadow.soft,
      ]}>
      <Text variant="headline">{label}</Text>
    </PressableScale>
  );
}

/* ---------------------------------- row ---------------------------------- */

export type OptionRowTint = 'none' | 'accent' | 'warm' | 'cool' | 'dark';

/** An icon, or a way to draw one in the colour the surface wants. */
export type OptionIcon = ReactNode | ((color: string) => ReactNode);

function drawIcon(icon: OptionIcon | undefined, color: string): ReactNode {
  return typeof icon === 'function' ? icon(color) : icon;
}

/**
 * The disc behind a row's icon, when the row asks for one, and the
 * colour an icon should be drawn in to read on it.
 *
 * The tints are built from tokens that already exist rather than new
 * pastel colours: the accent's own soft field, the warning amber laid
 * down thin, the neutral fill, and ink. On a `dark` disc the icon is the
 * ground's colour; everywhere else it is ink, or the accent once chosen.
 */
function useDisc(tint: OptionRowTint, selected: boolean) {
  const { colors } = useTheme();
  const { ink, onInk } = useInk();

  const iconColor = tint === 'dark' ? onInk : selected ? colors.accent : colors.text;

  const plate =
    tint === 'none'
      ? null
      : tint === 'accent'
        ? { backgroundColor: colors.accentSoft, opacity: 1 }
        : tint === 'warm'
          ? { backgroundColor: colors.warning, opacity: 0.16 }
          : tint === 'cool'
            ? { backgroundColor: colors.fillSelected, opacity: 1 }
            : { backgroundColor: ink, opacity: 1 };

  return { iconColor, plate };
}

function Disc({
  plate,
  children,
}: {
  plate: { backgroundColor: string; opacity: number } | null;
  children: ReactNode;
}) {
  if (!plate) {
    return <View style={{ width: DISC, alignItems: 'center', justifyContent: 'center' }}>{children}</View>;
  }

  return (
    <View
      style={{
        width: DISC,
        height: DISC,
        borderRadius: DISC / 2,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          borderRadius: DISC / 2,
          ...plate,
        }}
      />
      {children}
    </View>
  );
}

export function OptionRow({
  icon,
  title,
  description,
  selected = false,
  onPress,
  tint = 'none',
  check = false,
}: {
  icon: OptionIcon;
  title: string;
  description?: string;
  selected?: boolean;
  onPress: () => void;
  tint?: OptionRowTint;
  /**
   * Shows a circle check on the right and makes the row a checkbox: the
   * full-width multiple-choice row. The selected border stays off, since
   * the check is the signal.
   */
  check?: boolean;
}) {
  const { colors, spacing, radius, shadow } = useTheme();
  const { iconColor, plate } = useDisc(tint, selected);

  return (
    <PressableScale
      onPress={onPress}
      scaleTo={PRESS}
      accessibilityRole={check ? 'checkbox' : 'radio'}
      accessibilityState={check ? { checked: selected } : { selected, checked: selected }}
      accessibilityLabel={title}
      accessibilityHint={description}
      style={[
        {
          minHeight: PILL_HEIGHT,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.lg,
          paddingLeft: spacing.xl,
          paddingRight: spacing.xxl,
          paddingVertical: spacing.lg,
          borderRadius: radius.xl,
          backgroundColor: colors.surface,
          borderWidth: SELECTED_BORDER,
          borderColor: selected && !check ? colors.accent : 'transparent',
        },
        shadow.soft,
      ]}>
      <Disc plate={plate}>{drawIcon(icon, iconColor)}</Disc>
      <View style={{ flex: 1, gap: spacing.xxs }}>
        <Text variant="headline">{title}</Text>
        {description ? (
          <Text variant="callout" color="textSecondary">
            {description}
          </Text>
        ) : null}
      </View>
      {check ? <CircleCheck selected={selected} /> : null}
    </PressableScale>
  );
}

/* --------------------------------- card ---------------------------------- */

/** The circle check in a card's corner: an empty ring, or the accent with a tick. */
function CircleCheck({ selected }: { selected: boolean }) {
  const { colors } = useTheme();

  return (
    <View
      pointerEvents="none"
      style={{
        width: CHECK,
        height: CHECK,
        borderRadius: CHECK / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: selected ? colors.accent : 'transparent',
        borderWidth: selected ? 0 : SELECTED_BORDER,
        borderColor: colors.fillSelected,
      }}>
      {selected ? <Icon name="check" size={13} color={colors.textOnAccent} /> : null}
    </View>
  );
}

export function OptionCard({
  icon,
  label,
  sub,
  selected,
  onPress,
}: {
  icon?: OptionIcon;
  label: string;
  /** Examples beneath the label, in grey. */
  sub?: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors, spacing, radius, shadow } = useTheme();
  const drawn = drawIcon(icon, selected ? colors.accent : colors.text);

  return (
    <PressableScale
      onPress={onPress}
      scaleTo={PRESS}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
      accessibilityHint={sub}
      style={[
        {
          width: '48%',
          minHeight: drawn ? 108 : 72,
          padding: spacing.xl,
          borderRadius: radius.lg,
          backgroundColor: colors.surface,
          gap: spacing.sm,
        },
        shadow.soft,
      ]}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
        {drawn ? (
          <View style={{ flex: 1, minHeight: 30, justifyContent: 'center' }}>{drawn}</View>
        ) : (
          <Text variant="headline" style={{ flex: 1 }}>
            {label}
          </Text>
        )}
        <CircleCheck selected={selected} />
      </View>
      {drawn ? (
        <Text variant="headline" style={{ marginTop: spacing.xs }}>
          {label}
        </Text>
      ) : null}
      {sub ? (
        <Text variant="callout" color="textSecondary">
          {sub}
        </Text>
      ) : null}
    </PressableScale>
  );
}

/* --------------------------------- grid ---------------------------------- */

/** Two columns of cards, with the reference's gutter between and beneath. */
export function CardGrid({ children }: { children: ReactNode }) {
  const { spacing } = useTheme();

  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        rowGap: spacing.md,
      }}>
      {children}
    </View>
  );
}
