/**
 * The pieces the settings screen is built from.
 *
 * Settings used to be a stack of loose cards and pill rows that looked
 * like nothing else in the app. These give it the same vocabulary as the
 * rest of it: grouped surfaces, a glass orb carrying each row's glyph,
 * and one segmented control for every choice between three or four
 * values, so Appearance, Reminders and Capture all behave alike.
 */

import type { ReactNode } from 'react';
import { Switch, View } from 'react-native';

import { GlassOrb } from './ui/glass-orb';
import { Icon, type IconName } from './ui/icon';
import { Separator } from './ui/layout';
import { PressableScale } from './ui/pressable-scale';
import { Text } from './ui/text';
import { useTheme } from '@/theme';

const ORB = 30;
const GLYPH = 15;

/** Where a row's text begins, so separators start under it. */
const TEXT_INSET = 16 + ORB + 12;

/** A grouped surface holding rows. */
export function SettingsGroup({ children }: { children: ReactNode }) {
  const { colors, radius, shadow } = useTheme();

  // Two views, as in Card: on iOS a view that clips its rows also clips
  // its own shadow, so the outer one floats and the inner one clips.
  return (
    <View style={[{ backgroundColor: colors.surface, borderRadius: radius.section }, shadow.soft]}>
      <View style={{ borderRadius: radius.section, overflow: 'hidden' }}>{children}</View>
    </View>
  );
}

/** Divider between rows, starting under the glyph. */
export function RowDivider() {
  return <Separator inset={TEXT_INSET} />;
}

/** A quiet line of explanation under a group. */
export function SettingsNote({
  icon,
  children,
}: {
  icon?: IconName;
  children: ReactNode;
}) {
  const { colors, spacing } = useTheme();

  return (
    <View
      style={{
        flexDirection: 'row',
        gap: spacing.sm,
        marginTop: spacing.md,
        paddingHorizontal: spacing.xs,
      }}>
      {icon ? <Icon name={icon} size={12} color={colors.textTertiary} /> : null}
      <Text variant="footnote" color="textSecondary" style={{ flex: 1 }}>
        {children}
      </Text>
    </View>
  );
}

function Glyph({ icon, muted }: { icon: IconName; muted?: boolean }) {
  const { colors } = useTheme();

  return (
    <GlassOrb size={ORB} ring={false} tone={muted ? 'neutral' : 'green'}>
      <Icon
        name={icon}
        size={GLYPH}
        color={muted ? colors.textSecondary : colors.accent}
      />
    </GlassOrb>
  );
}

/** A row whose whole width is the control: a switch on the right. */
export function ToggleRow({
  icon,
  label,
  detail,
  value,
  disabled,
  onChange,
}: {
  icon: IconName;
  label: string;
  detail?: string;
  value: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  const { colors, spacing } = useTheme();

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        opacity: disabled ? 0.55 : 1,
      }}>
      <Glyph icon={icon} muted={disabled} />

      <View style={{ flex: 1 }}>
        <Text variant="body">{label}</Text>
        {detail ? (
          <Text variant="footnote" color="textSecondary" style={{ marginTop: 1 }}>
            {detail}
          </Text>
        ) : null}
      </View>

      <Switch
        value={value}
        disabled={disabled}
        onValueChange={onChange}
        trackColor={{ true: colors.accent, false: colors.fill }}
        accessibilityLabel={label}
        accessibilityHint={detail}
        accessibilityState={{ disabled: Boolean(disabled), checked: value }}
      />
    </View>
  );
}

/**
 * A labelled row whose control sits beneath it, full width.
 *
 * Segmented controls need the whole row to stay legible, so they cannot
 * share a line with a label the way a switch can.
 */
export function SettingsField({
  icon,
  label,
  detail,
  children,
}: {
  icon: IconName;
  label: string;
  detail?: string;
  children: ReactNode;
}) {
  const { spacing } = useTheme();

  return (
    <View style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <Glyph icon={icon} />
        <View style={{ flex: 1 }}>
          <Text variant="body">{label}</Text>
          {detail ? (
            <Text variant="footnote" color="textSecondary" style={{ marginTop: 1 }}>
              {detail}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={{ marginTop: spacing.md }}>{children}</View>
    </View>
  );
}

/** One of a set of mutually exclusive choices, ticked when selected. */
export function ChoiceRow({
  icon,
  label,
  description,
  selected,
  onPress,
}: {
  icon: IconName;
  label: string;
  description?: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors, spacing } = useTheme();

  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.995}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
      accessibilityHint={description}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
      }}>
      <Glyph icon={icon} muted={!selected} />

      <View style={{ flex: 1 }}>
        <Text variant="body" color={selected ? 'accent' : 'text'}>
          {label}
        </Text>
        {description ? (
          <Text variant="footnote" color="textSecondary" style={{ marginTop: 1 }}>
            {description}
          </Text>
        ) : null}
      </View>

      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 11,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: selected ? colors.accent : 'transparent',
          borderWidth: selected ? 0 : 1.5,
          borderColor: colors.border,
        }}>
        {selected ? <Icon name="check" size={12} color={colors.textOnAccent} /> : null}
      </View>
    </PressableScale>
  );
}

/** A plain row of information, optionally tappable. */
export function InfoRow({
  icon,
  label,
  value,
  detail,
  onPress,
}: {
  icon: IconName;
  label: string;
  value?: string;
  detail?: string;
  onPress?: () => void;
}) {
  const { colors, spacing } = useTheme();

  const body = (
    <>
      <Glyph icon={icon} muted />
      <View style={{ flex: 1 }}>
        <Text variant="body">{label}</Text>
        {detail ? (
          <Text variant="footnote" color="textSecondary" style={{ marginTop: 1 }}>
            {detail}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text variant="callout" color="textTertiary">
          {value}
        </Text>
      ) : null}
      {onPress ? <Icon name="chevronRight" size={15} color={colors.textTertiary} /> : null}
    </>
  );

  const style = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  };

  if (!onPress) {
    return (
      <View accessible accessibilityLabel={`${label}${value ? `, ${value}` : ''}`} style={style}>
        {body}
      </View>
    );
  }

  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.995}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={style}>
      {body}
    </PressableScale>
  );
}
