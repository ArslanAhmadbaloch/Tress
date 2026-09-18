/**
 * The shelf.
 *
 * Somebody asked for product suggestions for their hair type. The app has
 * never asked anybody what their hair is like, holds no efficacy data and
 * cannot compare two bottles, so this screen does the one honest version
 * of that request: it lays out the records they wrote down themselves,
 * what their own list says, and the answers they gave at the start — each
 * under a heading that says which of those it is.
 *
 * The screen used to have a fourth thing on it: what an online cosmetics
 * database stated about a bottle whose barcode had been scanned. The
 * scanner and the lookup behind it are gone, so the ingredient panel, the
 * database tags and the licence footnote went with them. What is left is
 * the part that was always the person's own.
 *
 * It is a reading surface and nothing else. There is no ordering except
 * by date, no marks out of anything, no sentence about what a formula
 * does, and — deliberately — no button that adds a bottle to anything.
 * An earlier draft carried an "Add to My List" control that staged a
 * prefill and stepped back, which only worked if the shelf had been
 * pushed from the routine sheet and did nothing visible anywhere else;
 * worse, a shopping affordance is exactly what turns a page of neutral
 * facts into a page of suggestions. Adding to the list stays where it
 * already lives, on the routine sheet.
 *
 * For the same reason the comparison lines are set as plain sentences
 * rather than a table of ticks and empty boxes: a tick makes the line
 * above it an achievement and the line below it a gap to fill.
 *
 * Everything visible is built in features/products/shelf.ts and swept by
 * scripts/test/shelf.test.ts; the only strings this file writes are
 * headings and labels, and the sweep reads this file's literals too.
 */

import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';

import { BackButton } from '@/components/ui/back-button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import {
  EmptyState,
  Screen,
  ScreenScroll,
  ScreenTitle,
  SectionHeader,
  Separator,
} from '@/components/ui/layout';
import { Text } from '@/components/ui/text';
import { buildShelf, type ShelfFact, type ShelfProduct } from '@/features/products';
import { useAppStore } from '@/store/app-store';
import { iconSize, useTheme } from '@/theme';

const THUMB = 56;

export default function ShelfScreen() {
  const { spacing } = useTheme();
  const router = useRouter();
  const { data } = useAppStore();

  const shelf = useMemo(() => buildShelf(data), [data]);

  return (
    <Screen ground="stone">
      <ScreenScroll clearsTabBar={false}>
        {/* Pushed screens draw their own way back: the native control is
            captioned with the route it returns to. */}
        <BackButton onPress={() => router.back()} />

        <ScreenTitle
          eyebrow="Products"
          title="Your shelf,"
          titleMuted="as you recorded it."
          subtitle="The products you wrote down, what your own list says, and what you told us at the start. Nothing here is ordered by anything but a date."
        />

        {shelf.productCount === 0 ? (
          <EmptyState
            icon="bottle"
            title="No records yet"
            body="Add a product while you add a task to your routine, and the record lands here with the name and brand exactly as you typed them."
            actionLabel="Back to your routine"
            onAction={() => router.back()}
          />
        ) : (
          shelf.sections.map((section) => (
            <View key={section.id}>
              <SectionHeader title={section.title} />
              <Text variant="footnote" color="textSecondary" style={{ marginBottom: spacing.md }}>
                {section.note}
              </Text>
              <View style={{ gap: spacing.md }}>
                {section.products.map((product) => (
                  <ProductCard key={product.barcode} product={product} />
                ))}
              </View>
            </View>
          ))
        )}

        {shelf.listNotes.length > 0 ? (
          <View>
            <SectionHeader title={shelf.listNotesTitle} />
            <Text variant="footnote" color="textSecondary" style={{ marginBottom: spacing.md }}>
              {shelf.listNotesNote}
            </Text>
            <Card padded={false}>
              <View style={{ paddingVertical: spacing.xs }}>
                {shelf.listNotes.map((note, index) => (
                  <View key={note.id}>
                    {index > 0 ? <Separator inset={spacing.lg} insetEnd={spacing.lg} /> : null}
                    <NoteLine note={note} />
                  </View>
                ))}
              </View>
            </Card>
          </View>
        ) : null}

        {shelf.answers.watching.length > 0 ||
        shelf.answers.goals.length > 0 ||
        shelf.answers.using.length > 0 ||
        shelf.answers.preferences.length > 0 ||
        shelf.answers.reactions.length > 0 ? (
          <View>
            <SectionHeader title="What you told us" />
            <Text variant="footnote" color="textSecondary" style={{ marginBottom: spacing.md }}>
              {shelf.answers.note}
            </Text>
            <Card>
              <AnswerGroup label="Watching" values={shelf.answers.watching} />
              <AnswerGroup label="Hoping for" values={shelf.answers.goals} />
              <AnswerGroup label="Using" values={shelf.answers.using} />
              <AnswerGroup label="Looking for" values={shelf.answers.preferences} />
              <AnswerGroup label="Reacted to" values={shelf.answers.reactions} />
            </Card>
          </View>
        ) : null}

        <View style={{ marginTop: spacing.xxl, gap: spacing.md }}>
          {shelf.footnotes.map((line) => (
            <Text key={line} variant="caption" color="textTertiary">
              {line}
            </Text>
          ))}
        </View>
      </ScreenScroll>
    </Screen>
  );
}

/**
 * One record: the bottle as it is held, and nothing more.
 *
 * It used to open on a tap, because there was a panel of the database's
 * own words behind it. With the lookup gone there is nothing behind the
 * card that is not already on its face, so it no longer pretends to
 * open. What is drawn is the name, the brand and size as typed, and the
 * sentences features/products/shelf.ts wrote about the record — never a
 * sentence about what the product does.
 */
function ProductCard({ product }: { product: ShelfProduct }) {
  const { colors, spacing, radius } = useTheme();

  const subtitle = [product.brand, product.quantity].filter(Boolean).join(' · ');

  return (
    <Card padded={false}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          padding: spacing.lg,
        }}>
        <View
          style={{
            width: THUMB,
            height: THUMB,
            borderRadius: radius.md,
            backgroundColor: colors.backgroundSubtle,
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}>
          {/* A glyph, not a photograph. The only pictures this card ever
              had came off the retired lookup's image server, and drawing
              one would be the app reaching the network again. */}
          <Icon name="bottle" size={iconSize.sm} color={colors.textTertiary} />
        </View>

        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text variant="headline" numberOfLines={2}>
            {product.name}
          </Text>
          {subtitle ? (
            <Text variant="footnote" color="textSecondary" numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>

      <View
        style={{
          paddingHorizontal: spacing.lg,
          paddingBottom: spacing.lg,
          gap: spacing.xs,
        }}>
        {product.facts.map((fact) => (
          <Text key={fact.id} variant="footnote" color="textSecondary">
            {fact.text}
          </Text>
        ))}
      </View>
    </Card>
  );
}

/**
 * One line about their list.
 *
 * Set as a sentence, with no glyph in front of it. The earlier draft put
 * a tick beside the lines that matched and an empty circle beside the
 * rest, which read as a checklist: four empty boxes on a product screen
 * are four things to go and buy, whatever the words next to them say.
 */
function NoteLine({ note }: { note: ShelfFact }) {
  const { spacing } = useTheme();

  return (
    <View style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}>
      <Text variant="footnote" color="textSecondary">
        {note.text}
      </Text>
    </View>
  );
}

/** Their answers, in the words they picked, as chips. */
function AnswerGroup({ label, values }: { label: string; values: string[] }) {
  const { colors, spacing, radius } = useTheme();
  if (values.length === 0) return null;

  return (
    <View style={{ gap: spacing.sm, paddingBottom: spacing.md }}>
      <Text variant="subhead">{label}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
        {values.map((value) => (
          <View
            key={value}
            style={{
              paddingHorizontal: spacing.md,
              paddingVertical: 6,
              borderRadius: radius.pill,
              backgroundColor: colors.fill,
            }}>
            <Text variant="caption" color="textSecondary">
              {value}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
