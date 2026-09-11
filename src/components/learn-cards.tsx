/**
 * Learn library pieces, cloned from the Learn & Grow design: the featured
 * story, topic cards, rich article rows, filter chips and the FAQ prompt.
 */

import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';

import { GlassOrb } from './ui/glass-orb';
import { Icon, type IconName } from './ui/icon';
import { LeafShadow } from './ui/leaf-shadow';
import { PressableScale } from './ui/pressable-scale';
import { BulbGlyph } from './ui/tab-glyphs';
import { Text } from './ui/text';
import { articleImage } from '@/features/learn/images';
import type { Article, LearnCategory } from '@/features/learn/library';
import { splitAlpha, useTheme, withZeroAlpha } from '@/theme';

export const CATEGORY_ICONS: Record<LearnCategory, IconName> = {
  basics: 'learn',
  growth: 'chart',
  treatments: 'pill',
  scalp: 'drop',
  nutrition: 'leaf',
  lifestyle: 'dumbbell',
  transplants: 'sparkle',
  science: 'info',
};

/** Two-line names for the topic cards. */
export const TOPIC_CARD_LABELS: Record<LearnCategory, string> = {
  basics: 'Hair Loss\nBasics',
  growth: 'Hair\nGrowth',
  treatments: 'Medications\n& Treatments',
  scalp: 'Scalp\nHealth',
  nutrition: 'Nutrition\n& Supplements',
  lifestyle: 'Lifestyle\n& Habits',
  transplants: 'Hair\nTransplants',
  science: 'The\nScience',
};

/* ------------------------------ cover ------------------------------- */

/**
 * An article's picture: its photograph where one fits, otherwise a drawn
 * cover — the topic's glyph in glass over a frond shadow — rather than an
 * unrelated stock image.
 */
export function ArticleCover({
  article,
  style,
  iconSize = 18,
}: {
  article: Pick<Article, 'slug' | 'category'>;
  style?: StyleProp<ViewStyle>;
  iconSize?: number;
}) {
  const { colors } = useTheme();
  const image = articleImage(article);

  return (
    <View style={[{ overflow: 'hidden', backgroundColor: colors.backgroundSubtle }, style]}>
      {image ? (
        <Image
          source={image}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={150}
          cachePolicy="memory-disk"
          accessible={false}
        />
      ) : (
        <>
          <View style={{ position: 'absolute', top: 0, bottom: 0, right: '-8%', width: '70%' }}>
            <LeafShadow width={200} height={260} />
          </View>
          <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
            <GlassOrb size={iconSize * 2.4} ring={false} tone="neutral">
              <Icon name={CATEGORY_ICONS[article.category]} size={iconSize} color={colors.text} />
            </GlassOrb>
          </View>
        </>
      )}
    </View>
  );
}

/* ----------------------------- featured ----------------------------- */

export function FeaturedCard({ article, onPress }: { article: Article; onPress: () => void }) {
  const { colors, spacing, radius, shadow } = useTheme();

  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.985}
      accessibilityRole="button"
      accessibilityLabel={`Featured: ${article.title}. ${article.readingMinutes} minute read.`}
      style={[{ marginTop: spacing.lg, borderRadius: radius.section, backgroundColor: colors.surface }, shadow.soft]}>
      <View style={{ borderRadius: radius.section, overflow: 'hidden', minHeight: 208 }}>
        {/* The photograph fills the right side and fades into the card. */}
        <View style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: '58%' }}>
          <ArticleCover article={article} style={StyleSheet.absoluteFill} iconSize={24} />
          <LinearGradient
            colors={[colors.surface, withZeroAlpha(colors.surface)]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0.6, y: 0 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
        </View>

        <View
          style={[
            {
              position: 'absolute',
              top: spacing.md,
              right: spacing.md,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              paddingHorizontal: spacing.sm + 2,
              paddingVertical: 5,
              borderRadius: radius.pill,
              backgroundColor: colors.surface,
            },
            shadow.soft,
          ]}>
          <Icon name="clock" size={11} color={colors.text} />
          <Text variant="caption">{article.readingMinutes} min read</Text>
        </View>

        <View style={{ width: '64%', padding: spacing.lg, gap: spacing.md, flex: 1, justifyContent: 'space-between' }}>
          <View>
            <View
              style={{
                alignSelf: 'flex-start',
                paddingHorizontal: spacing.sm,
                paddingVertical: 3,
                borderRadius: radius.pill,
                backgroundColor: colors.accentSoft,
              }}>
              <Text variant="caption" color="accent" style={{ letterSpacing: 1.2, fontSize: 10 }}>
                FEATURED
              </Text>
            </View>
            <Text variant="title3" numberOfLines={3} style={{ marginTop: spacing.sm }}>
              {article.title}
            </Text>
            <Text variant="footnote" color="textSecondary" numberOfLines={3} style={{ marginTop: 4 }}>
              {article.standfirst}
            </Text>
          </View>

          <View
            style={{
              alignSelf: 'flex-start',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingHorizontal: spacing.lg,
              paddingVertical: spacing.sm + 1,
              borderRadius: radius.pill,
              backgroundColor: colors.accent,
            }}>
            <Text variant="subhead" color="textOnAccent" style={{ fontWeight: '600' }}>
              Read Article
            </Text>
            <Icon name="arrowRight" size={13} color={colors.textOnAccent} />
          </View>
        </View>
      </View>
    </PressableScale>
  );
}

/* ------------------------------ topics ------------------------------ */

export function TopicCard({
  topic,
  width,
  onPress,
}: {
  topic: LearnCategory;
  width: number;
  onPress: () => void;
}) {
  const { colors, spacing, radius, shadow } = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.95}
      accessibilityRole="button"
      accessibilityLabel={TOPIC_CARD_LABELS[topic].replace('\n', ' ')}
      style={[
        {
          width,
          alignItems: 'center',
          gap: spacing.sm,
          paddingVertical: spacing.md,
          paddingHorizontal: spacing.xs,
          borderRadius: radius.card,
          backgroundColor: colors.surface,
        },
        shadow.soft,
      ]}>
      <GlassOrb size={42} ring={false} tone="neutral">
        <Icon name={CATEGORY_ICONS[topic]} size={18} color={colors.text} />
      </GlassOrb>
      <Text variant="caption" center numberOfLines={2} style={{ color: colors.text, fontWeight: '500' }}>
        {TOPIC_CARD_LABELS[topic]}
      </Text>
    </PressableScale>
  );
}

/* ------------------------------- rows ------------------------------- */

export function ArticleListRow({ article, onPress }: { article: Article; onPress: () => void }) {
  const { colors, spacing, radius } = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.99}
      accessibilityRole="button"
      accessibilityLabel={`${article.title}. ${article.readingMinutes} minute read.`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md }}>
      <ArticleCover article={article} style={{ width: 96, height: 72, borderRadius: radius.md }} />
      <View style={{ flex: 1 }}>
        <Text variant="subhead" numberOfLines={2} style={{ color: colors.text, fontWeight: '600' }}>
          {article.title}
        </Text>
        <Text variant="caption" color="textSecondary" numberOfLines={2} style={{ marginTop: 2, fontWeight: '400' }}>
          {article.standfirst}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
          <Icon name="clock" size={11} color={colors.textTertiary} />
          <Text variant="caption" color="textTertiary">
            {article.readingMinutes} min read
          </Text>
        </View>
      </View>
      <Icon name="chevronRight" size={14} color={colors.text} />
    </PressableScale>
  );
}

/* ------------------------------- chips ------------------------------ */

/**
 * Filter chips. The selected chip is the white pill of the design with
 * the tab bar's soft green light inside it, so it reads as the same
 * selection language as every other toggle in the app.
 */
export function ChipRow<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
}) {
  const { colors, spacing, radius, shadow } = useTheme();
  const glow = splitAlpha(colors.tabGlow);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ marginTop: spacing.md, marginHorizontal: -spacing.xl }}
      contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.xl, paddingVertical: 4 }}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <PressableScale
            key={option.value}
            onPress={() => onChange(option.value)}
            haptic="light"
            scaleTo={0.95}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            style={[
              {
                height: 38,
                justifyContent: 'center',
                paddingHorizontal: spacing.lg,
                borderRadius: radius.pill,
                overflow: 'hidden',
                backgroundColor: selected ? colors.surface : colors.backgroundSubtle,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: selected ? colors.glassBorder : 'transparent',
              },
              selected && shadow.soft,
            ]}>
            {selected ? (
              <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} pointerEvents="none">
                <Defs>
                  <RadialGradient id={`chip-${option.value}`} cx="50%" cy="50%" r="50%">
                    <Stop offset="0" stopColor={glow.color} stopOpacity={glow.opacity * 0.9} />
                    <Stop offset="1" stopColor={glow.color} stopOpacity={0} />
                  </RadialGradient>
                </Defs>
                <Ellipse cx="50%" cy="50%" rx="48%" ry="46%" fill={`url(#chip-${option.value})`} />
              </Svg>
            ) : null}
            <Text
              variant="subhead"
              style={{
                color: selected ? colors.text : colors.textSecondary,
                fontWeight: selected ? '600' : '500',
              }}>
              {option.label}
            </Text>
          </PressableScale>
        );
      })}
    </ScrollView>
  );
}

/* -------------------------------- faq ------------------------------- */

export function FaqCard({ onPress, style }: { onPress: () => void; style?: StyleProp<ViewStyle> }) {
  const { colors, spacing, radius, shadow } = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.99}
      accessibilityRole="button"
      accessibilityLabel="Have a question? View the FAQ."
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          padding: spacing.md,
          paddingLeft: spacing.lg,
          borderRadius: radius.section,
          backgroundColor: colors.surface,
        },
        shadow.soft,
        style,
      ]}>
      <GlassOrb size={44} ring={false}>
        <BulbGlyph size={21} color={colors.text} />
      </GlassOrb>
      <View style={{ flex: 1 }}>
        <Text variant="headline">Have a question?</Text>
        <Text variant="caption" color="textSecondary" style={{ marginTop: 2, fontWeight: '400' }}>
          Find answers in our FAQ section.
        </Text>
      </View>
      <View
        style={[
          {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
            borderRadius: radius.pill,
            backgroundColor: colors.surface,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.border,
          },
          shadow.soft,
        ]}>
        <Text variant="footnote" style={{ fontWeight: '600' }}>
          View FAQ
        </Text>
        <Icon name="arrowRight" size={12} color={colors.text} />
      </View>
    </PressableScale>
  );
}
