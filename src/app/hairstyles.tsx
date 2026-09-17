/**
 * Hairstyles for your hair: the catalogue's picks, and the rest of it.
 *
 * Three to five suggestions for the hair type the funnel recorded —
 * each a catalogue drawing on a blank head, the cut's name, the lengths
 * it is cut at and one line about the cut — then the rest of the
 * catalogue for that hair type in a grid. The words are the feature's
 * (features/hairstyles/copy.ts) and the list is the picker's
 * (features/hairstyles/picker.ts); this file arranges them.
 *
 * What it says at the top is the whole of the claim: styling
 * suggestions for a hair type, at any length, and whether one is right
 * for somebody is a stylist's call. Nothing on the screen reads the
 * scan, and no drawing is of the reader.
 *
 * Without Premium the first suggestion is shown in full; the rest are
 * held — the drawing blurred, the note as shapes — and the one button
 * opens the paywall. That is the gate the paywall's hairstyle line
 * rests on (features/subscription/paywall-variants.ts). With it, the
 * list is open and the grid follows.
 */

import { useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { View } from 'react-native';

import { StyleCard, StyleTile } from '@/components/hairstyles';
import { BackButton } from '@/components/ui/back-button';
import { Button } from '@/components/ui/button';
import { EmptyState, Screen, ScreenScroll, ScreenTitle, SectionHeader } from '@/components/ui/layout';
import { Text } from '@/components/ui/text';
import {
  HAIRSTYLE_COPY as COPY,
  hairstyleProfileOf,
  hairstylesFor,
  moreHairstylesFor,
  type Hairstyle,
} from '@/features/hairstyles';
import { usePremium } from '@/features/subscription/provider';
import { useBackOrHome } from '@/lib/navigation';
import { useAppStore } from '@/store/app-store';
import { useTheme } from '@/theme';

/** Tiles to a row in the grid. */
const COLUMNS = 2;

/** The grid's rows, the last padded so a lone tile keeps its width. */
function rowsOf(styles: Hairstyle[]): (Hairstyle | null)[][] {
  const rows: (Hairstyle | null)[][] = [];
  for (let i = 0; i < styles.length; i += COLUMNS) {
    const row: (Hairstyle | null)[] = styles.slice(i, i + COLUMNS);
    while (row.length < COLUMNS) row.push(null);
    rows.push(row);
  }
  return rows;
}

export default function HairstylesScreen() {
  const { spacing } = useTheme();
  const router = useRouter();
  const leave = useBackOrHome('/');
  const { data } = useAppStore();
  const { isPremium } = usePremium();

  const profile = useMemo(() => hairstyleProfileOf(data), [data]);
  const picks = useMemo(() => hairstylesFor(data), [data]);
  const more = useMemo(() => moreHairstylesFor(data), [data]);
  const rows = useMemo(() => rowsOf(more), [more]);

  const toPaywall = useCallback(() => router.push('/paywall'), [router]);

  return (
    <Screen ground="stone">
      <ScreenScroll clearsTabBar={false}>
        {/* Pushed screens draw their own way back: the native control is
            captioned with the route it returns to. */}
        <BackButton onPress={leave} />

        <ScreenTitle
          eyebrow={COPY.title.eyebrow}
          title={COPY.title.main}
          titleMuted={COPY.title.muted}
          subtitle={COPY.subtitle(profile.hairType)}
        />

        <Text variant="footnote" color="textTertiary">
          {COPY.disclaimer}
        </Text>

        {picks.length === 0 ? (
          <EmptyState icon="idea" title={COPY.empty.title} body={COPY.empty.body} />
        ) : (
          <>
            <SectionHeader title={COPY.picks.heading} />
            <Text variant="footnote" color="textSecondary" style={{ marginBottom: spacing.lg }}>
              {COPY.picks.subheading(profile.hairType)}
            </Text>
            <View style={{ gap: spacing.md }}>
              {picks.map((style, i) => (
                <StyleCard key={style.id} style={style} held={!isPremium && i > 0} order={i} />
              ))}
            </View>

            {!isPremium ? (
              <View style={{ marginTop: spacing.xl, gap: spacing.md }}>
                <Text variant="footnote" color="textSecondary">
                  {COPY.locked.note}
                </Text>
                <Button
                  label={COPY.cta}
                  variant="secondary"
                  size="md"
                  icon="lock"
                  onPress={toPaywall}
                  accessibilityHint={COPY.a11y.paywallHint}
                />
              </View>
            ) : more.length > 0 ? (
              <>
                <SectionHeader title={COPY.more.heading} />
                <Text variant="footnote" color="textSecondary" style={{ marginBottom: spacing.lg }}>
                  {COPY.more.subheading(more.length, profile.hairType)}
                </Text>
                <View style={{ gap: spacing.md }}>
                  {rows.map((row, r) => (
                    <View key={r} style={{ flexDirection: 'row', gap: spacing.md }}>
                      {row.map((style, c) =>
                        style ? <StyleTile key={style.id} style={style} /> : <View key={`pad_${r}_${c}`} style={{ flex: 1 }} />,
                      )}
                    </View>
                  ))}
                </View>
              </>
            ) : null}
          </>
        )}
      </ScreenScroll>
    </Screen>
  );
}
