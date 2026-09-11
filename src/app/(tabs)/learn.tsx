import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { Icon, type IconName } from '@/components/ui/icon';
import {
  EmptyState,
  Screen,
  ScreenScroll,
  ScreenTitle,
  SectionHeader,
  Separator,
} from '@/components/ui/layout';
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

const CATEGORY_ICONS: Record<LearnCategory, IconName> = {
  basics: 'learn',
  growth: 'chart',
  treatments: 'pill',
  scalp: 'drop',
  nutrition: 'leaf',
  lifestyle: 'dumbbell',
  transplants: 'sparkle',
  science: 'info',
};

const TOPICS: LearnCategory[] = [
  'basics',
  'growth',
  'treatments',
  'scalp',
  'lifestyle',
];

export default function LearnScreen() {
  const { colors, spacing, radius } = useTheme();
  const router = useRouter();
  const [query, setQuery] = useState('');

  const results = useMemo(() => searchArticles(query), [query]);
  const featured = ARTICLES.find((a) => a.featured) ?? ARTICLES[0];
  const searching = query.trim().length > 0;

  const latest = results.filter((a) => a.slug !== featured.slug);

  return (
    <Screen ground="leaves">
      <ScreenScroll>
        <ScreenTitle
          eyebrow="Learn"
          title="Knowledge"
          titleMuted="for real results"
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
            placeholder="Search articles and topics"
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

        {searching ? (
          results.length === 0 ? (
            <EmptyState
              icon="search"
              title="Nothing found"
              body="Try a different word, or browse the topics below."
            />
          ) : (
            <>
              <SectionHeader
                title={`${results.length} ${results.length === 1 ? 'result' : 'results'}`}
              />
              <Card padded={false}>
                {results.map((article, i) => (
                  <View key={article.slug}>
                    {i > 0 ? <Separator inset={spacing.lg} /> : null}
                    <ArticleRow
                      article={article}
                      onPress={() => router.push(`/learn/${article.slug}`)}
                    />
                  </View>
                ))}
              </Card>
            </>
          )
        ) : (
          <>
            {/* Featured — the one editorial card on the screen */}
            <PressableScale
              onPress={() => router.push(`/learn/${featured.slug}`)}
              scaleTo={0.985}
              accessibilityRole="button"
              accessibilityLabel={`Featured: ${featured.title}`}
              style={{
                marginTop: spacing.xl,
                borderRadius: radius.section,
                overflow: 'hidden',
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
                padding: spacing.xl,
              }}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}>
                <View
                  style={{
                    paddingHorizontal: spacing.md,
                    paddingVertical: 4,
                    borderRadius: radius.pill,
                    backgroundColor: colors.accentSoft,
                  }}>
                  <Text variant="caption" color="accent">
                    Featured
                  </Text>
                </View>
                <Text variant="caption" color="textTertiary">
                  {featured.readingMinutes} min read
                </Text>
              </View>

              <Text variant="title2" style={{ marginTop: spacing.lg }}>
                {featured.title}
              </Text>
              <Text
                variant="callout"
                color="textSecondary"
                style={{ marginTop: spacing.sm }}>
                {featured.standfirst}
              </Text>

              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.sm,
                  marginTop: spacing.lg,
                }}>
                <Text variant="subhead" color="accent">
                  Read article
                </Text>
                <Icon name="arrowRight" size={15} color={colors.accent} />
              </View>
            </PressableScale>

            {/* Topics */}
            <SectionHeader title="Popular topics" />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: spacing.sm }}>
              {TOPICS.map((topic) => (
                <PressableScale
                  key={topic}
                  onPress={() => setQuery(CATEGORY_LABELS[topic])}
                  scaleTo={0.96}
                  accessibilityRole="button"
                  accessibilityLabel={CATEGORY_LABELS[topic]}
                  style={{
                    width: 116,
                    padding: spacing.lg,
                    borderRadius: radius.card,
                    backgroundColor: colors.surface,
                    borderWidth: 1,
                    borderColor: colors.border,
                    gap: spacing.md,
                  }}>
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: colors.accentSoft,
                    }}>
                    <Icon
                      name={CATEGORY_ICONS[topic]}
                      size={17}
                      color={colors.accent}
                    />
                  </View>
                  <Text variant="subhead">{CATEGORY_LABELS[topic]}</Text>
                </PressableScale>
              ))}
            </ScrollView>

            {/* Latest */}
            <SectionHeader title="Latest articles" />
            <Card padded={false}>
              {latest.map((article, i) => (
                <View key={article.slug}>
                  {i > 0 ? <Separator inset={spacing.lg} /> : null}
                  <ArticleRow
                    article={article}
                    onPress={() => router.push(`/learn/${article.slug}`)}
                  />
                </View>
              ))}
            </Card>

            {/* FAQ */}
            <PressableScale
              onPress={() => router.push('/learn/faq')}
              scaleTo={0.99}
              accessibilityRole="button"
              accessibilityLabel="Frequently asked questions"
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.md,
                marginTop: spacing.xl,
                padding: spacing.lg,
                borderRadius: radius.card,
                backgroundColor: colors.accentSoft,
              }}>
              <Icon name="help" size={19} color={colors.accent} />
              <View style={{ flex: 1 }}>
                <Text variant="headline">Have a question?</Text>
                <Text variant="footnote" color="textSecondary" style={{ marginTop: 2 }}>
                  Common questions about tracking and photographs.
                </Text>
              </View>
              <Icon name="chevronRight" size={15} color={colors.textTertiary} />
            </PressableScale>

            <Text
              variant="caption"
              color="textTertiary"
              style={{ marginTop: spacing.xl }}>
              Educational information only. Hair Journey does not diagnose
              conditions or recommend treatments — speak to a qualified
              healthcare professional about anything medical.
            </Text>
          </>
        )}
      </ScreenScroll>
    </Screen>
  );
}

function ArticleRow({
  article,
  onPress,
}: {
  article: Article;
  onPress: () => void;
}) {
  const { colors, spacing, radius } = useTheme();

  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.99}
      accessibilityRole="button"
      accessibilityLabel={`${article.title}, ${article.readingMinutes} minute read`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        padding: spacing.lg,
      }}>
      <View
        style={{
          width: 42,
          height: 42,
          borderRadius: radius.sm,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.fill,
        }}>
        <Icon
          name={CATEGORY_ICONS[article.category]}
          size={18}
          color={colors.textSecondary}
        />
      </View>

      <View style={{ flex: 1 }}>
        <Text variant="headline" numberOfLines={2}>
          {article.title}
        </Text>
        <Text variant="caption" color="textTertiary" style={{ marginTop: 3 }}>
          {CATEGORY_LABELS[article.category]} · {article.readingMinutes} min read
        </Text>
      </View>

      <Icon name="chevronRight" size={15} color={colors.textTertiary} />
    </PressableScale>
  );
}
