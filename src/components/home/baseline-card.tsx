/**
 * "Scan your baseline" — on Home while the only session is a baseline
 * from before the Hair Scan existed.
 *
 * `sessionToExtend` names exactly one kind of session: a baseline taken
 * as a photograph, from the front, that still lacks angles and is the
 * only session there is. A scan baseline never qualifies — a scan keeps
 * the angles the turn reached, and nothing nags about the ones it did
 * not — so this card is only ever about that one photograph.
 *
 * What the button opens is the Hair Scan, and the scan saves a session
 * of its own beside the photograph; it does not add frames to it. The
 * card says so. It also says which angles the photograph holds and
 * which a scan reaches — the front, both sides and the top — and
 * nothing about what any image shows, because at this point the app
 * knows nothing more than that.
 *
 * There is no dismiss: the card leaves the moment a second session
 * exists, which is what it is asking for.
 */

import { View, type StyleProp, type ViewStyle } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';
import { ANGLE_LABELS, type Angle, type PhotoSession } from '@/types/domain';

/** Height of an angle pip. A bar, not a dot: a row of dots reads as a pager. */
const PIP_HEIGHT = 6;

/**
 * The angles one scan can reach, in the order a turn meets them. A
 * front camera cannot see the back of the head, so the crown is not
 * here, and the card does not ask for it.
 */
const SCAN_ANGLES: readonly Angle[] = ['front', 'leftTemple', 'rightTemple', 'top'];

export function BaselineCard({
  session,
  onCapture,
  style,
}: {
  /** The baseline — a photograph from before the Hair Scan existed. */
  session: PhotoSession;
  onCapture: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, spacing, radius } = useTheme();

  // Angles present, not photographs: a session with two shots of the
  // same angle still holds one angle, and the pips draw angles.
  const held = new Set(session.photos.map((p) => p.angle));
  const heldNames = SCAN_ANGLES.filter((a) => held.has(a))
    .map((a) => ANGLE_LABELS[a])
    .join(', ');
  const heldCount = SCAN_ANGLES.filter((a) => held.has(a)).length;

  return (
    <Card style={style}>
      <Text variant="title3" accessibilityRole="header">
        Scan your baseline
      </Text>

      {/*
        Two sentences: what exists, and what a scan does. Neither says
        the images will show anything, because the card cannot know that.
      */}
      <Text variant="callout" color="textSecondary" style={{ marginTop: spacing.sm }}>
        {heldCount === 1
          ? `Your baseline is one photograph, from the ${heldNames.toLowerCase()}.`
          : 'Your baseline was photographed before the Hair Scan existed.'}{' '}
        A scan captures the front, both sides and the top on its own and is
        saved beside it, so the next comparison has the same angles both times.
      </Text>

      {/* Which of the angles a scan reaches the photograph already holds. */}
      <View
        accessible
        accessibilityLabel={`Your baseline holds ${heldCount} of the ${SCAN_ANGLES.length} angles a scan reaches${
          heldNames ? `: ${heldNames}` : ''
        }`}
        style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl }}>
        {SCAN_ANGLES.map((angle) => {
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
        label="Start a scan"
        size="md"
        onPress={onCapture}
        accessibilityHint="Opens the hair scan. Its frames are saved as a scan of their own beside your baseline photograph"
        style={{ marginTop: spacing.xl }}
      />
    </Card>
  );
}
