import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { EmptyState, Screen, ScreenScroll, ScreenTitle } from '@/components/ui/layout';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Text } from '@/components/ui/text';
import { formatRelative } from '@/lib/date';
import {
  FILTERS,
  SAMPLE_POSTS,
  matchesFilter,
} from '@/features/community/sample-feed';
import { useTheme } from '@/theme';
import {
  ANGLE_LABELS,
  type CommunityFilter,
  type CommunityPost,
} from '@/types/domain';

export default function CommunityScreen() {
  const { colors, spacing, radius } = useTheme();
  const [filter, setFilter] = useState<CommunityFilter>('all');

  // Local-only: these do not persist, because the posts are sample rows.
  const [interactions, setInteractions] = useState<
    Record<string, { liked: boolean; saved: boolean }>
  >({});

  const posts = useMemo(
    () => SAMPLE_POSTS.filter((post) => matchesFilter(post, filter)),
    [filter],
  );

  const toggle = (id: string, key: 'liked' | 'saved') =>
    setInteractions((prev) => ({
      ...prev,
      [id]: {
        liked: prev[id]?.liked ?? false,
        saved: prev[id]?.saved ?? false,
        [key]: !prev[id]?.[key],
      },
    }));

  return (
    <Screen>
      <ScreenScroll>
        <ScreenTitle
          title="Community"
          subtitle="Real journeys, organised by where people are in them."
        />

        {/* Honest about what this is until the backend lands. */}
        <View
          style={{
            flexDirection: 'row',
            gap: spacing.md,
            alignItems: 'center',
            padding: spacing.md,
            borderRadius: radius.md,
            backgroundColor: colors.backgroundSubtle,
            marginTop: spacing.sm,
          }}>
          <Icon name="info" size={16} color={colors.textTertiary} />
          <Text variant="footnote" color="textSecondary" style={{ flex: 1 }}>
            Sample journeys. The live community arrives with accounts — your
            own journey is never shared without you choosing to.
          </Text>
        </View>
      </ScreenScroll>

      {/* Filters sit outside the scroll body so they stay reachable. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: spacing.lg,
          gap: spacing.sm,
          paddingVertical: spacing.sm,
        }}
        style={{ flexGrow: 0 }}>
        {FILTERS.map((option) => {
          const active = filter === option.value;
          return (
            <PressableScale
              key={option.value}
              onPress={() => setFilter(option.value)}
              haptic="light"
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`Filter by ${option.label}`}
              style={{
                paddingHorizontal: spacing.lg,
                paddingVertical: spacing.sm,
                borderRadius: radius.pill,
                backgroundColor: active ? colors.accent : colors.fill,
              }}>
              <Text variant="subhead" color={active ? 'textOnAccent' : 'textSecondary'}>
                {option.label}
              </Text>
            </PressableScale>
          );
        })}
      </ScrollView>

      <ScreenScroll style={{ flex: 1 }}>
        {posts.length === 0 ? (
          <EmptyState
            icon="community"
            title="Nothing here yet"
            body="No sample journeys match this stage. Try another filter."
          />
        ) : (
          <View style={{ gap: spacing.lg, paddingTop: spacing.sm }}>
            {posts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                liked={interactions[post.id]?.liked ?? post.likedByMe}
                saved={interactions[post.id]?.saved ?? post.savedByMe}
                onLike={() => toggle(post.id, 'liked')}
                onSave={() => toggle(post.id, 'saved')}
              />
            ))}
          </View>
        )}
      </ScreenScroll>
    </Screen>
  );
}

function PostCard({
  post,
  liked,
  saved,
  onLike,
  onSave,
}: {
  post: CommunityPost;
  liked: boolean;
  saved: boolean;
  onLike: () => void;
  onSave: () => void;
}) {
  const { colors, spacing, radius } = useTheme();

  return (
    <View
      style={{
        borderRadius: radius.card,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        overflow: 'hidden',
      }}>
      {/* Author */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          padding: spacing.lg,
        }}>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: colors.fill,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Text variant="headline" color="textSecondary">
            {post.author.displayName.charAt(0)}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="headline">{post.author.displayName}</Text>
          <Text variant="caption" color="textTertiary" style={{ marginTop: 1 }}>
            {post.author.journeyMonths}-month journey ·{' '}
            {formatRelative(post.createdAt)}
          </Text>
        </View>
      </View>

      {/* Structured before/after — the thing that makes this not Instagram */}
      <View style={{ flexDirection: 'row', gap: 2, paddingHorizontal: 2 }}>
        <ProgressSlot label={post.beforeLabel} />
        <ProgressSlot label={post.afterLabel} highlighted />
      </View>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.md,
        }}>
        <View
          style={{
            paddingHorizontal: spacing.sm,
            paddingVertical: 3,
            borderRadius: radius.xs,
            backgroundColor: colors.fill,
          }}>
          <Text variant="caption" color="textSecondary">
            {ANGLE_LABELS[post.angle]}
          </Text>
        </View>
        {post.routineSummary ? (
          <Text variant="caption" color="textTertiary" numberOfLines={1} style={{ flex: 1 }}>
            {post.routineSummary}
          </Text>
        ) : null}
      </View>

      <Text variant="callout" style={{ padding: spacing.lg, paddingTop: spacing.sm }}>
        {post.caption}
      </Text>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.xl,
          paddingHorizontal: spacing.lg,
          paddingBottom: spacing.lg,
        }}>
        <PressableScale
          onPress={onLike}
          accessibilityRole="button"
          accessibilityLabel={liked ? 'Unlike' : 'Like'}
          style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
          <Icon
            name={liked ? 'heartFilled' : 'heart'}
            size={18}
            color={liked ? colors.danger : colors.textSecondary}
          />
          <Text variant="subhead" color="textSecondary">
            {post.likeCount + (liked ? 1 : 0)}
          </Text>
        </PressableScale>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
          <Icon name="comment" size={18} color={colors.textSecondary} />
          <Text variant="subhead" color="textSecondary">
            {post.commentCount}
          </Text>
        </View>

        <View style={{ flex: 1 }} />

        <PressableScale
          onPress={onSave}
          accessibilityRole="button"
          accessibilityLabel={saved ? 'Remove from saved' : 'Save journey'}>
          <Icon
            name="bookmark"
            size={18}
            color={saved ? colors.accent : colors.textSecondary}
          />
        </PressableScale>
      </View>
    </View>
  );
}

/**
 * Stands in for a shared progress photo. Deliberately a labelled
 * placeholder rather than a stock face — see sample-feed.ts.
 */
function ProgressSlot({
  label,
  highlighted,
}: {
  label: string;
  highlighted?: boolean;
}) {
  const { colors, spacing, radius } = useTheme();

  return (
    <View
      style={{
        flex: 1,
        aspectRatio: 0.82,
        backgroundColor: highlighted ? colors.accentSoft : colors.backgroundSubtle,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.xs,
        gap: spacing.sm,
      }}>
      <Icon
        name="photo"
        size={22}
        color={highlighted ? colors.accent : colors.textTertiary}
      />
      <Text variant="caption" color={highlighted ? 'accent' : 'textTertiary'}>
        {label}
      </Text>
    </View>
  );
}
