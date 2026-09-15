/**
 * "Complete your baseline" — on Home while the first session holds fewer
 * than the five angles.
 *
 * The funnel's first scan is one angle: enough to show what the app
 * measures, not enough to compare against later. A month-on-month
 * comparison only works when the same five angles exist both times, so
 * until they do Home carries this one card, and it leaves the moment
 * they do — there is no dismiss, because the only way to make it go
 * away is the thing it is asking for.
 *
 * It says what was captured and what is missing — five pips, one per
 * angle, filled for the angles the first session holds — and nothing
 * about what the photographs show. That is the whole of what the app
 * knows at this point, and the card must not know more than the app.
 *
 * The button leads to the guided five-angle capture, not to "the four
 * you are missing": a comparison set is taken in one sitting, in one
 * light, and a set assembled from two sittings is not one set.
 */

import { View, type StyleProp, type ViewStyle } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';
import { ANGLES, ANGLE_LABELS, type PhotoSession } from '@/types/domain';

/** Height of an angle pip. A bar, not a dot: five dots read as a pager. */
const PIP_HEIGHT = 6;

/**
 * Whether Home should carry the card for this session.
 *
 * Exported so the screen decides with the same rule the card draws
 * with; a screen that showed the card for a session the card then
 * described as complete would be arguing with itself.
 */
export function baselineIsIncomplete(session: PhotoSession | null | undefined): boolean {
  return Boolean(session) && (session?.photos.length ?? 0) < ANGLES.length;
}

export function BaselineCard({
  session,
  onCapture,
  style,
}: {
  /** The first session — the one the funnel's scan created. */
  session: PhotoSession;
  onCapture: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, spacing, radius } = useTheme();

  // Angles present, not photographs: a session with two shots of the
  // same angle still holds one angle, and the pips draw angles.
  const held = new Set(session.photos.map((p) => p.angle));
  const heldCount = ANGLES.filter((angle) => held.has(angle)).length;

  const heldNames = ANGLES.filter((a) => held.has(a))
    .map((a) => ANGLE_LABELS[a])
    .join(', ');

  return (
    <Card style={style}>
      <Text variant="title3" accessibilityRole="header">
        Complete your baseline
      </Text>

      {/*
        Two sentences, and the second is the reason. "Because the
        comparison needs it" is the only argument this card makes; it
        does not say the photographs will show anything, because it
        cannot know that.
      */}
      <Text variant="callout" color="textSecondary" style={{ marginTop: spacing.sm }}>
        {heldCount === 1
          ? 'Your first scan was one angle.'
          : `Your first set has ${heldCount} of the five angles.`}{' '}
        The full five, taken in the same light each time, are what make a
        month-on-month comparison possible.
      </Text>

      {/* Which angles exist. The set is the thing being completed, so
          the set is what is drawn. */}
      <View
        accessible
        accessibilityLabel={`${heldCount} of ${ANGLES.length} angles captured${
          heldNames ? `: ${heldNames}` : ''
        }`}
        style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl }}>
        {ANGLES.map((angle) => {
          const filled = held.has(angle);
          return (
            <View key={angle} style={{ flex: 1, alignItems: 'stretch', gap: spacing.sm }}>
              <View
                style={{
                  height: PIP_HEIGHT,
                  borderRadius: radius.pill,
                  backgroundColor: filled ? colors.accent : colors.fill,
                }}
              />
              <Text
                variant="caption"
                color={filled ? 'text' : 'textTertiary'}
                center
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}>
                {ANGLE_LABELS[angle]}
              </Text>
            </View>
          );
        })}
      </View>

      <Button
        label="Capture all five angles"
        size="md"
        onPress={onCapture}
        accessibilityHint="Opens the guided five-angle capture"
        style={{ marginTop: spacing.xl }}
      />
    </Card>
  );
}
