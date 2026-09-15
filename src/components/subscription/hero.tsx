/**
 * The paywall's hero: the person's own first photograph, in a frame.
 *
 * The reference for this screen puts the user's picture at the top of
 * the subscription card, and it works because it makes the ask concrete
 * — this is your record, this is what it keeps. The card copies that and
 * refuses the other half of the pattern. There is no "after" beside the
 * photograph, no arrow, no second frame left suggestively empty. One
 * picture, as they took it, with the date it was taken and the one thing
 * that is true of it in every state: it stays on this device.
 *
 * The frame is a white card with a thin margin around the picture, the
 * way a print sits in a mount, rather than a full-bleed photo tile. The
 * margin is what makes it read as *kept* rather than *displayed*, which
 * is the difference between a record and a feed.
 *
 * Resolution: this is one image on a screen, not a list, so it loads the
 * display-resolution file and shows the pre-scaled thumbnail while that
 * decodes. A 320-pixel thumbnail stretched across a 340-point frame on a
 * 3× display would be the first blurry thing on the paywall, and it would
 * be a picture of them.
 */

import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { GlassOrb } from '@/components/ui/glass-orb';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import {
  HERO_COPY,
  heroAccessibilityLabel,
  heroCaption,
  type PaywallHero as Hero,
} from '@/features/subscription/paywall-variants';
import { concentricRadius, useTheme } from '@/theme';

/** Height of the frame. Tall enough for a face, short enough that the
    features and plans are one small scroll away. */
const FRAME_HEIGHT = 340;
/** The empty frame is shorter: there is nothing in it to look at. */
const EMPTY_FRAME_HEIGHT = 188;

export function PaywallHeroCard({ hero }: { hero: Hero | null }) {
  const { colors, spacing, radius } = useTheme();

  // The mount: a hair wider than the card's own padding would be, so the
  // picture's corners sit concentrically inside the card's.
  const mount = spacing.sm;
  const frameRadius = concentricRadius(radius.card, mount);

  return (
    <Card padded={false}>
      <View
        accessible
        accessibilityRole={hero ? 'image' : 'text'}
        accessibilityLabel={heroAccessibilityLabel(hero)}
        style={{ padding: mount }}>
        <View
          style={{
            height: hero ? FRAME_HEIGHT : EMPTY_FRAME_HEIGHT,
            borderRadius: frameRadius,
            overflow: 'hidden',
            backgroundColor: colors.fill,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          {hero ? (
            <Image
              source={{ uri: hero.uri }}
              placeholder={hero.placeholderUri ? { uri: hero.placeholderUri } : undefined}
              placeholderContentFit="cover"
              contentFit="cover"
              transition={220}
              style={StyleSheet.absoluteFill}
              accessible={false}
            />
          ) : (
            /* No photograph yet. A neutral bead and nothing else — not a
               stock face, not a silhouette of somebody with better hair. */
            <GlassOrb size={52} ring={false} tone="neutral">
              <Icon name="camera" size={20} color={colors.textSecondary} />
            </GlassOrb>
          )}
        </View>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.md,
            paddingHorizontal: spacing.md,
            paddingTop: spacing.lg,
            paddingBottom: spacing.md,
          }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="headline">{HERO_COPY.title}</Text>
            <Text variant="footnote" color="textSecondary" style={{ marginTop: 2 }}>
              {hero ? heroCaption(hero) : HERO_COPY.emptyBody}
            </Text>
          </View>

          {/* The privacy line, small and beside the caption rather than a
              badge on the photo: a lock drawn over somebody's face reads
              as surveillance, which is the opposite of the point. */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
            <Icon name="lock" size={11} color={colors.textTertiary} />
            <Text variant="caption" color="textTertiary">
              {HERO_COPY.onDevice}
            </Text>
          </View>
        </View>
      </View>
    </Card>
  );
}
