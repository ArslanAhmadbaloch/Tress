import { useRouter } from 'expo-router';
import { View } from 'react-native';

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
import { StatTile } from '@/components/ui/stat';
import { Text } from '@/components/ui/text';
import { formatDate, formatDuration } from '@/lib/date';
import { useAppStore } from '@/store/app-store';
import { adherencePercent } from '@/store/selectors';
import { useTheme } from '@/theme';

const AREA_LABELS: Record<string, string> = {
  hairline: 'Hairline',
  crown: 'Crown',
  overallThinning: 'Overall thinning',
  diffuseThinning: 'Diffuse thinning',
  shedding: 'Shedding',
  density: 'Density',
  transplantRecovery: 'Transplant recovery',
  generalChanges: 'General changes',
};

const VISIBILITY_LABEL = {
  private: 'Private',
  followers: 'Followers',
  public: 'Public',
} as const;

export default function ProfileScreen() {
  const { colors, spacing, radius } = useTheme();
  const router = useRouter();
  const { data } = useAppStore();

  const journey = data.journey;
  if (!journey) return null;

  const name = data.profile?.displayName ?? 'You';
  const adherence = adherencePercent(data);

  return (
    <Screen>
      <ScreenScroll>
        <ScreenTitle
          title="Profile"
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

        <Card style={{ marginTop: spacing.lg, alignItems: 'center' }}>
          <View
            style={{
              width: 76,
              height: 76,
              borderRadius: 38,
              backgroundColor: colors.accentSoft,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <Text variant="title1" color="accent">
              {name.charAt(0).toUpperCase()}
            </Text>
          </View>

          <Text variant="title2" style={{ marginTop: spacing.lg }}>
            {name}
          </Text>
          <Text variant="footnote" color="textSecondary" style={{ marginTop: 2 }}>
            Journey started {formatDate(journey.startedAt)}
          </Text>

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.xs,
              marginTop: spacing.md,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.xs,
              borderRadius: radius.pill,
              backgroundColor: colors.fill,
            }}>
            <Icon name="lock" size={12} color={colors.textSecondary} />
            <Text variant="caption" color="textSecondary">
              {VISIBILITY_LABEL[journey.visibility]}
            </Text>
          </View>
        </Card>

        <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.md }}>
          <StatTile icon="clock" label="Duration" value={formatDuration(journey.startedAt)} />
          <StatTile icon="photo" label="Sessions" value={data.sessions.length} />
          <StatTile
            icon="chart"
            label="Adherence"
            value={adherence ?? '—'}
            suffix={adherence === null ? '' : '%'}
          />
        </View>

        <SectionHeader title="Tracking" />
        <Card>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {journey.trackingAreas.map((area) => (
              <View
                key={area}
                style={{
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.xs,
                  borderRadius: radius.pill,
                  backgroundColor: colors.accentSoft,
                }}>
                <Text variant="subhead" color="accent">
                  {AREA_LABELS[area] ?? area}
                </Text>
              </View>
            ))}
          </View>
        </Card>

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
            icon="bell"
            label="Reminders"
            onPress={() => router.push('/settings')}
          />
          <Separator inset={56} />
          <ProfileRow
            icon="lock"
            label="Privacy"
            value={VISIBILITY_LABEL[journey.visibility]}
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
