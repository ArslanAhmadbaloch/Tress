import { useRouter } from 'expo-router';
import { View, useWindowDimensions } from 'react-native';

import { CardFloat, MemberCard } from '@/components/member-card';
import { Card } from '@/components/ui/card';
import { Icon, type IconName } from '@/components/ui/icon';
import {
  Screen,
  ScreenScroll,
  SectionHeader,
  Separator,
} from '@/components/ui/layout';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Text } from '@/components/ui/text';
import { CARD_NOTE } from '@/features/content/belonging';
import { formatDate } from '@/lib/date';
import { useAppStore } from '@/store/app-store';
import { useAppLock } from '@/store/lock-provider';
import { consistencyScore } from '@/store/selectors';
import { useTheme } from '@/theme';
import { HAIR_GOAL_LABELS } from '@/types/domain';

/** Diameter of the filled well each row's icon sits in. */
const ROW_WELL = 36;

export default function ProfileScreen() {
  const { colors, spacing, shadow } = useTheme();
  const { width } = useWindowDimensions();
  const router = useRouter();
  const { data } = useAppStore();
  const lock = useAppLock();

  const journey = data.journey;
  if (!journey) return null;

  const name = data.profile?.displayName?.trim() || 'You';
  const consistency = consistencyScore(data).value;
  // Day one counts as a tracked day; a journey started today reads "1".
  // The card is drawn at its design size, never stretched to the screen.
  const cardWidth = Math.min(340, width - spacing.lg * 2);

  return (
    <Screen>
      <ScreenScroll>
        {/*
          No headline. The card carries the user's own name and goal, so a
          title above it was labelling something already labelled, and the
          subtitle listed the page's contents to someone looking straight
          at them. The gear stays: it is this tab's only control, and the
          card is what the screen opens with.

          The tab bar still names the screen, and the section headers below
          are real headings, so the rotor has somewhere to land.
        */}
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingTop: spacing.md }}>
          {/*
            The same white disc the Journey header uses for its settings
            button, so the one control on this screen is the control the
            person met on the last one. It was a grey fill, which on the
            cream ground read as disabled.
          */}
          <PressableScale
            hitSlop={3}
            onPress={() => router.push('/settings')}
            accessibilityRole="button"
            accessibilityLabel="Settings"
            style={[
              {
                width: 46,
                height: 46,
                borderRadius: 23,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.surface,
              },
              shadow.soft,
            ]}>
            <Icon name="settings" size={18} color={colors.text} />
          </PressableScale>
        </View>

        <PressableScale
          onPress={() => router.push('/card')}
          scaleTo={0.985}
          accessibilityRole="button"
          accessibilityLabel="Your journey card. Opens it full size, where you can save it."
          style={{ marginTop: spacing.md, alignItems: 'center' }}>
          <CardFloat>
            <MemberCard
              name={name}
              goalLabel={HAIR_GOAL_LABELS[journey.goal]}
              portraitUri={data.profile?.avatarUri}
              age={data.profile?.age}
              startedAt={journey.startedAt}
              consistency={consistency}
              width={cardWidth}
            />
          </CardFloat>
        </PressableScale>

        <Text
          variant="caption"
          color="textSecondary"
          center
          style={{ marginTop: spacing.lg, paddingHorizontal: spacing.xl }}>
          {CARD_NOTE}
        </Text>

        <SectionHeader title="Journal" action="View all" onAction={() => router.push('/journal')} />
        {data.journal.length === 0 ? (
          /*
            A white card, like every other card on the screen. The grey
            inset panel it used to be is the tone for a panel inside a
            card; on the bare ground it read as a disabled control. And
            the empty state now offers the thing it is empty of.
          */
          <Card>
            <Text variant="callout" color="textSecondary">
              Notes you attach to updates show up here.
            </Text>
            <PressableScale
              onPress={() => router.push({ pathname: '/journal', params: { compose: '1' } })}
              haptic="none"
              accessibilityRole="button"
              accessibilityLabel="Write an entry"
              style={{ alignSelf: 'flex-start', marginTop: spacing.md }}>
              <Text variant="subhead" color="accent">
                Write an entry
              </Text>
            </PressableScale>
          </Card>
        ) : (
          <Card padded={false}>
            {data.journal.slice(0, 3).map((entry, index) => (
              <View key={entry.id}>
                {index > 0 ? <Separator inset={spacing.xl} insetEnd={spacing.xl} /> : null}
                <View style={{ paddingHorizontal: spacing.xl, paddingVertical: spacing.lg }}>
                  <Text variant="caption" color="textTertiary">
                    {formatDate(entry.createdAt)}
                  </Text>
                  <Text variant="callout" style={{ marginTop: spacing.xs }} numberOfLines={3}>
                    {entry.body}
                  </Text>
                </View>
              </View>
            ))}
          </Card>
        )}

        <SectionHeader title="More" />
        <Card padded={false}>
          <ProfileRow
            icon="photo"
            label="Card picture"
            value={data.profile?.avatarUri ? 'Chosen' : 'Not set'}
            onPress={() => router.push('/profile-photo')}
          />
          <RowSeparator />
          <ProfileRow
            icon="bell"
            label="Reminders"
            onPress={() => router.push('/settings')}
          />
          <RowSeparator />
          <ProfileRow
            icon="lock"
            label="App lock"
            value={lock.state.enabled ? 'On' : 'Off'}
            onPress={() => router.push('/settings')}
          />
          <RowSeparator />
          <ProfileRow
            icon="settings"
            label="Settings"
            onPress={() => router.push('/settings')}
          />
        </Card>
      </ScreenScroll>
    </Screen>
  );
}

/** Runs from the text, not the icon, the way a grouped list's does. */
function RowSeparator() {
  const { spacing } = useTheme();
  return <Separator inset={spacing.xl + ROW_WELL + spacing.md} insetEnd={spacing.xl} />;
}

function ProfileRow({
  icon,
  label,
  value,
  onPress,
}: {
  icon: IconName;
  label: string;
  value?: string;
  onPress: () => void;
}) {
  const { colors, spacing, radius } = useTheme();

  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.995}
      haptic="light"
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingHorizontal: spacing.xl,
        paddingVertical: spacing.md + spacing.xxs,
      }}>
      {/*
        The icon sits in a quiet round well rather than loose beside the
        label. A bare glyph in a list row reads as a bullet; a filled one
        reads as the row's mark, and it gives the four rows one left edge.
      */}
      <View
        style={{
          width: ROW_WELL,
          height: ROW_WELL,
          borderRadius: radius.pill,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.fill,
        }}>
        <Icon name={icon} size={16} color={colors.textSecondary} />
      </View>
      <Text variant="body" style={{ flex: 1 }}>
        {label}
      </Text>
      {value ? (
        <Text variant="callout" color="textSecondary">
          {value}
        </Text>
      ) : null}
      <Icon name="chevronRight" size={15} color={colors.textTertiary} />
    </PressableScale>
  );
}
