import { useRouter } from 'expo-router';
import { View, useWindowDimensions } from 'react-native';

import { CardFloat, MemberCard } from '@/components/member-card';
import { Card } from '@/components/ui/card';
import { Icon, type IconName } from '@/components/ui/icon';
import {
  Screen,
  ScreenScroll,
  ScreenTitle,
  SectionHeader,
  Separator,
} from '@/components/ui/layout';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Text } from '@/components/ui/text';
import { formatDate } from '@/lib/date';
import { useAppStore } from '@/store/app-store';
import { useAppLock } from '@/store/lock-provider';
import { consistencyScore } from '@/store/selectors';
import { useTheme } from '@/theme';
import { HAIR_GOAL_LABELS } from '@/types/domain';

export default function ProfileScreen() {
  const { colors, spacing } = useTheme();
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
        <ScreenTitle
          eyebrow="Profile"
          title="Your"
          titleMuted="journey"
          trailing={
            <PressableScale
              onPress={() => router.push('/settings')}
              accessibilityRole="button"
              accessibilityLabel="Settings"
              style={{
                width: 38,
                height: 38,
                borderRadius: 19,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.fill,
              }}>
              <Icon name="settings" size={18} color={colors.text} />
            </PressableScale>
          }
        />

        <PressableScale
          onPress={() => router.push('/card')}
          scaleTo={0.985}
          accessibilityRole="button"
          accessibilityLabel="Your journey card. Opens it full size, where you can save it."
          style={{ marginTop: spacing.sm, alignItems: 'center' }}>
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
          style={{ marginTop: spacing.md, paddingHorizontal: spacing.xl }}>
          Tap the card to open it full size and save it. Consistency is how
          regularly you tick off your stack and take your photos — it says
          nothing about your hair.
        </Text>

        <SectionHeader title="Journal" action="View all" onAction={() => router.push('/journal')} />
        {data.journal.length === 0 ? (
          <Card tone="subtle">
            <Text variant="callout" color="textSecondary">
              Notes you attach to updates show up here.
            </Text>
          </Card>
        ) : (
          <Card padded={false}>
            {data.journal.slice(0, 3).map((entry, index) => (
              <View key={entry.id}>
                {index > 0 ? <Separator inset={spacing.lg} /> : null}
                <View style={{ padding: spacing.lg }}>
                  <Text variant="caption" color="textTertiary">
                    {formatDate(entry.createdAt)}
                  </Text>
                  <Text variant="callout" style={{ marginTop: 4 }} numberOfLines={3}>
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
          <Separator inset={56} />
          <ProfileRow
            icon="bell"
            label="Reminders"
            onPress={() => router.push('/settings')}
          />
          <Separator inset={56} />
          <ProfileRow
            icon="lock"
            label="App lock"
            value={lock.state.enabled ? 'On' : 'Off'}
            onPress={() => router.push('/settings')}
          />
          <Separator inset={56} />
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
  const { colors, spacing } = useTheme();

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
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.lg,
      }}>
      <Icon name={icon} size={19} color={colors.textSecondary} />
      <Text variant="body" style={{ flex: 1 }}>
        {label}
      </Text>
      {value ? (
        <Text variant="callout" color="textTertiary">
          {value}
        </Text>
      ) : null}
      <Icon name="chevronRight" size={15} color={colors.textTertiary} />
    </PressableScale>
  );
}
