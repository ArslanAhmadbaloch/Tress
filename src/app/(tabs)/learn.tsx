import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';

import {
  ArticleListRow,
  ChipRow,
  FaqCard,
  FeaturedCard,
  TopicCard,
} from '@/components/learn-cards';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { EmptyState, Screen, ScreenScroll, ScreenTitle, Separator } from '@/components/ui/layout';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Text } from '@/components/ui/text';
import {
  ARTICLES,
  CATEGORY_LABELS,
  searchArticles,
  type Article,
  type LearnCategory,
} from '@/features/learn/library';
import { MIN_TOUCH_TARGET, useTheme } from '@/theme';

type Filter = 'all' | LearnCategory;

const CHIPS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'basics', label: 'Hair Loss' },
  { value: 'treatments', label: 'Treatments' },
  { value: 'nutrition', label: 'Nutrition' },
  { value: 'lifestyle', label: 'Lifestyle' },
  { value: 'science', label: 'Science' },
  { value: 'growth', label: 'Hair Growth' },
  { value: 'scalp', label: 'Scalp' },
  { value: 'transplants', label: 'Transplants' },
];

const TOPICS: LearnCategory[] = [
  'basics',
  'treatments',
  'nutrition',
  'lifestyle',
  'scalp',
  'growth',
  'transplants',
  'science',
];

const LATEST_COUNT = 3;
const TOPIC_CARD_WIDTH = 92;

/**
 * The Learn library, laid out after the Learn & Grow design: search,
 * filter chips, one featured story, topic cards, the latest pieces and
 * the FAQ. Everything below the chips is a view of the same library.
 */
export default function LearnScreen() {
  const { colors, spacing, radius } = useTheme();
  const router = useRouter();

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [showAll, setShowAll] = useState(false);
  const [topicsExpanded, setTopicsExpanded] = useState(false);
  const [gridWidth, setGridWidth] = useState(0);

  const results = useMemo(() => searchArticles(query), [query]);
  const searching = query.trim().length > 0;
  const featured = ARTICLES.find((a) => a.featured) ?? ARTICLES[0];
  const byDate = useMemo(
    () => [...ARTICLES].sort((a, b) => b.updated.localeCompare(a.updated)),
    [],
  );

  // The newest pieces, one per topic, so the short list shows range.
  const latest = useMemo(() => {
    const seen = new Set<LearnCategory>();
    const picked: Article[] = [];
    for (const a of byDate) {
      if (a.slug === featured.slug || seen.has(a.category)) continue;
      seen.add(a.category);
      picked.push(a);
      if (picked.length === LATEST_COUNT) break;
    }
    return picked;
  }, [byDate, featured.slug]);

  const open = (a: Article) => router.push(`/learn/${a.slug}`);
  const chooseFilter = (next: Filter) => {
    setFilter(next);
    setShowAll(false);
  };

  const list = (articles: Article[]) => (
    <Card padded={false} style={{ marginTop: spacing.md }}>
      {articles.map((a, i) => (
        <View key={a.slug}>
          {i > 0 ? <Separator inset={spacing.md} insetEnd={spacing.md} /> : null}
          <ArticleListRow article={a} onPress={() => open(a)} />
        </View>
      ))}
    </Card>
  );

  return (
    <Screen ground="leaves">
      <ScreenScroll>
        <ScreenTitle
          eyebrow="Learn & Grow"
          title="Knowledge"
          titleMuted="for Real Results"
          subtitle="Evidence-based information. No noise."
          script="Better Knowledge Healthier Hair"
        />

        {/* Search */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.md,
            marginTop: spacing.lg,
            paddingHorizontal: spacing.lg,
            height: MIN_TOUCH_TARGET + 6,
            borderRadius: radius.pill,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
          }}>
          <Icon name="search" size={17} color={colors.textTertiary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search articles, topics, or questions..."
            placeholderTextColor={colors.textTertiary}
            returnKeyType="search"
            accessibilityLabel="Search the library"
            style={{ flex: 1, color: colors.text, fontSize: 16 }}
          />
          {searching ? (
            <PressableScale
              onPress={() => setQuery('')}
              haptic="none"
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Clear search">
              <Icon name="close" size={15} color={colors.textTertiary} />
            </PressableScale>
          ) : null}
        </View>

        <ChipRow options={CHIPS} value={filter} onChange={chooseFilter} />

        {searching ? (
          results.length === 0 ? (
            <EmptyState
              icon="search"
              title="Nothing found"
              body="Try a different word, or pick a topic above."
            />
          ) : (
            <>
              <SectionRow
                title={`${results.length} ${results.length === 1 ? 'result' : 'results'}`}
              />
              {list(results)}
            </>
          )
        ) : filter !== 'all' ? (
          <>
            <SectionRow
              title={CATEGORY_LABELS[filter]}
              detail={`${ARTICLES.filter((a) => a.category === filter).length} articles`}
            />
            {list(ARTICLES.filter((a) => a.category === filter))}
          </>
        ) : showAll ? (
          <>
            <SectionRow
              title="All Articles"
              detail={`${byDate.length} articles, newest first`}
              action="Done"
              onAction={() => setShowAll(false)}
            />
            {list(byDate)}
          </>
        ) : (
          <>
            <FeaturedCard article={featured} onPress={() => open(featured)} />

            <SectionRow
              title="Popular Topics"
              action={topicsExpanded ? 'Less' : 'See All'}
              onAction={() => setTopicsExpanded((v) => !v)}
            />
            {topicsExpanded ? (
              <View
                onLayout={(e) => setGridWidth(Math.floor(e.nativeEvent.layout.width))}
                style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md }}>
                {gridWidth > 0
                  ? TOPICS.map((t) => (
                      <TopicCard
                        key={t}
                        topic={t}
                        width={(gridWidth - spacing.sm * 3) / 4}
                        onPress={() => chooseFilter(t)}
                      />
                    ))
                  : null}
              </View>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ marginTop: spacing.sm, marginHorizontal: -spacing.xl }}
                contentContainerStyle={{
                  gap: spacing.sm,
                  paddingHorizontal: spacing.xl,
                  paddingVertical: spacing.xs,
                }}>
                {TOPICS.map((t) => (
                  <TopicCard
                    key={t}
                    topic={t}
                    width={TOPIC_CARD_WIDTH}
                    onPress={() => chooseFilter(t)}
                  />
                ))}
              </ScrollView>
            )}

            <SectionRow title="Latest Articles" action="See All" onAction={() => setShowAll(true)} />
            {list(latest)}

            <FaqCard onPress={() => router.push('/learn/faq')} style={{ marginTop: spacing.lg }} />
          </>
        )}

        <Text variant="caption" color="textTertiary" style={{ marginTop: spacing.xl }}>
          Educational information only. Hair Journey does not diagnose
          conditions or recommend treatments — speak to a qualified
          healthcare professional about anything medical.
        </Text>
      </ScreenScroll>
    </Screen>
  );
}

function SectionRow({
  title,
  detail,
  action,
  onAction,
}: {
  title: string;
  detail?: string;
  action?: string;
  onAction?: () => void;
}) {
  const { colors, spacing } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: spacing.xl,
      }}>
      <View style={{ flex: 1 }}>
        <Text variant="title3" accessibilityRole="header">
          {title}
        </Text>
        {detail ? (
          <Text variant="footnote" color="textSecondary" style={{ marginTop: 2 }}>
            {detail}
          </Text>
        ) : null}
      </View>
      {action && onAction ? (
        <PressableScale
          onPress={onAction}
          haptic="light"
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`${action}, ${title}`}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <Text variant="subhead" color="textSecondary">
            {action}
          </Text>
          <Icon name="chevronRight" size={12} color={colors.textSecondary} />
        </PressableScale>
      ) : null}
    </View>
  );
}
