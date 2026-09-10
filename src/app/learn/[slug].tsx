import { useLocalSearchParams, useRouter } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import {
  EmptyState,
  Screen,
  ScreenScroll,
  SectionHeader,
  Separator,
} from '@/components/ui/layout';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Text } from '@/components/ui/text';
import {
  ARTICLES,
  CATEGORY_LABELS,
  FAQS,
  articleBySlug,
} from '@/features/learn/library';
import { formatDate } from '@/lib/date';
import { useTheme } from '@/theme';

/**
 * Article reader, and the FAQ under the reserved slug "faq".
 *
 * Deliberately a long single column with generous measure: this is the one
 * place in the app where the job is sustained reading rather than glancing,
 * so it drops the card grid and behaves like a page of a publication.
 */
export default function ArticleScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { colors, spacing, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  if (slug === 'faq') return <FaqScreen />;

  const article = articleBySlug(String(slug));

  if (!article) {
    return (
      <Screen>
        <BackBar onBack={() => router.back()} />
        <EmptyState
          icon="learn"
          title="Article not found"
          body="This piece may have been removed from the library."
        />
      </Screen>
    );
  }

  const related = ARTICLES.filter(
    (a) => a.slug !== article.slug && a.category === article.category,
  ).slice(0, 3);

  return (
    <Screen edges={[]}>
      <ScreenScroll contentContainerStyle={{ paddingTop: insets.top + spacing.sm }}>
        <BackBar onBack={() => router.back()} inline />

        <Text
          variant="caption"
          color="textTertiary"
          style={{ letterSpacing: 2, marginTop: spacing.xl }}>
          {CATEGORY_LABELS[article.category].toUpperCase()}
        </Text>

        <Text variant="title1" accessibilityRole="header" style={{ marginTop: spacing.sm }}>
          {article.title}
        </Text>

        <Text variant="title3" color="textSecondary" style={{ marginTop: spacing.md }}>
          {article.standfirst}
        </Text>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.lg,
            marginTop: spacing.lg,
          }}>
          <Row icon="clock" label={`${article.readingMinutes} min read`} />
          <Row icon="calendar" label={`Updated ${formatDate(article.updated)}`} />
        </View>

        {/* Key takeaways — the summary for anyone who will not read it all */}
        <Card style={{ marginTop: spacing.xxl }}>
          <Text variant="headline">Key takeaways</Text>
          <View style={{ marginTop: spacing.md, gap: spacing.md }}>
            {article.keyTakeaways.map((point) => (
              <View
                key={point}
                style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
                <View
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 3,
                    marginTop: 8,
                    backgroundColor: colors.accent,
                  }}
                />
                <Text variant="callout" color="textSecondary" style={{ flex: 1 }}>
                  {point}
                </Text>
              </View>
            ))}
          </View>
        </Card>

        {/* Body */}
        {article.sections.map((section) => (
          <View key={section.heading} style={{ marginTop: spacing.xxxl }}>
            <Text variant="title3" accessibilityRole="header">
              {section.heading}
            </Text>
            <Text
              variant="body"
              color="textSecondary"
              style={{ marginTop: spacing.md, lineHeight: 26 }}>
              {section.body}
            </Text>
          </View>
        ))}

        {article.references?.length ? (
          <>
            <SectionHeader title="Further reading" />
            <Card tone="subtle">
              {article.references.map((reference) => (
                <Text
                  key={reference}
                  variant="footnote"
                  color="textSecondary"
                  style={{ marginBottom: spacing.sm }}>
                  {reference}
                </Text>
              ))}
            </Card>
          </>
        ) : null}

        {related.length > 0 ? (
          <>
            <SectionHeader title="Related" />
            <Card padded={false}>
              {related.map((item, i) => (
                <View key={item.slug}>
                  {i > 0 ? <Separator inset={spacing.lg} /> : null}
                  <PressableScale
                    onPress={() => router.replace(`/learn/${item.slug}`)}
                    scaleTo={0.99}
                    accessibilityRole="button"
                    accessibilityLabel={item.title}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: spacing.md,
                      padding: spacing.lg,
                    }}>
                    <View style={{ flex: 1 }}>
                      <Text variant="headline" numberOfLines={2}>
                        {item.title}
                      </Text>
                      <Text variant="caption" color="textTertiary" style={{ marginTop: 3 }}>
                        {item.readingMinutes} min read
                      </Text>
                    </View>
                    <Icon name="chevronRight" size={15} color={colors.textTertiary} />
                  </PressableScale>
                </View>
              ))}
            </Card>
          </>
        ) : null}

        <View
          style={{
            marginTop: spacing.xxxl,
            flexDirection: 'row',
            gap: spacing.md,
            padding: spacing.lg,
            borderRadius: radius.md,
            backgroundColor: colors.backgroundSubtle,
          }}>
          <Icon name="info" size={17} color={colors.textTertiary} />
          <Text variant="footnote" color="textSecondary" style={{ flex: 1 }}>
            This is general educational information, not medical advice, and
            it cannot account for your individual circumstances. Speak to a
            qualified healthcare professional about diagnosis or treatment.
          </Text>
        </View>
      </ScreenScroll>
    </Screen>
  );
}

function FaqScreen() {
  const { spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <Screen edges={[]}>
      <ScreenScroll contentContainerStyle={{ paddingTop: insets.top + spacing.sm }}>
        <BackBar onBack={() => router.back()} inline />

        <Text
          variant="caption"
          color="textTertiary"
          style={{ letterSpacing: 2, marginTop: spacing.xl }}>
          FAQ
        </Text>
        <Text variant="title1" accessibilityRole="header" style={{ marginTop: spacing.sm }}>
          Common questions
        </Text>

        <View style={{ marginTop: spacing.xxl, gap: spacing.md }}>
          {FAQS.map((item) => (
            <Card key={item.question}>
              <Text variant="headline">{item.question}</Text>
              <Text
                variant="callout"
                color="textSecondary"
                style={{ marginTop: spacing.sm, lineHeight: 23 }}>
                {item.answer}
              </Text>
            </Card>
          ))}
        </View>
      </ScreenScroll>
    </Screen>
  );
}

function Row({ icon, label }: { icon: 'clock' | 'calendar'; label: string }) {
  const { colors, spacing } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
      <Icon name={icon} size={14} color={colors.textTertiary} />
      <Text variant="caption" color="textTertiary">
        {label}
      </Text>
    </View>
  );
}

function BackBar({ onBack, inline }: { onBack: () => void; inline?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={inline ? undefined : { padding: 16 }}>
      <PressableScale
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="Back"
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
        }}>
        <Icon name="chevronLeft" size={16} color={colors.text} />
      </PressableScale>
    </View>
  );
}
