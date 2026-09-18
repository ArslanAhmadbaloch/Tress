/**
 * "Scan your baseline" — on Home while the only session is a baseline
 * photograph rather than a scan.
 *
 * `sessionToExtend` names exactly one kind of session: a baseline taken
 * as a photograph, that still lacks angles and is the only session there
 * is. A scan baseline never qualifies — a scan keeps the angles the turn
 * reached, and nothing nags about the ones it did not — so this card is
 * only ever about that one photograph.
 *
 * Two kinds of session reach it now. One is a baseline from before the
 * Hair Scan existed; the other is a picture taken minutes ago on the
 * plain camera (`src/app/photo.tsx`), which writes an ordinary
 * one-photograph session. So the card must not say when the photograph
 * was taken — it cannot know — and it must handle the back of a head,
 * which is the slot the plain camera's rear lens files under.
 *
 * What the button opens is the Hair Scan, and the scan saves a session
 * of its own beside the photograph; it does not add frames to it. The
 * card says so, in two sentences: which angle the photograph holds, and
 * which a scan reaches — the front, both sides and the top. Nothing
 * about what any image shows, because at this point the app knows
 * nothing more than that.
 *
 * The four-segment bar that used to sit under those sentences is gone.
 * It was a meter with nothing to measure — one photograph, one segment
 * lit, for ever — and the sentence above it already said the same thing
 * in words.
 *
 * There is no dismiss: the card leaves the moment a second session
 * exists, which is what it is asking for.
 */

import type { StyleProp, ViewStyle } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';
import { ANGLES, ANGLE_LABELS, type PhotoSession } from '@/types/domain';

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
  const { spacing } = useTheme();

  /*
    Angles present, not photographs: a session with two shots of the
    same angle still holds one angle, and the sentence names angles.

    Every angle counts, including the back. An earlier version counted
    only the four a scan reaches, which meant a baseline holding just the
    back — which is what the plain camera's rear lens files (see
    features/photo/session.ts) — counted as none and fell through to a
    sentence about when the photograph was taken. That sentence was false
    for a picture taken minutes ago. The card names the slot the journal
    captions and says nothing about when.
  */
  const held = new Set(session.photos.map((p) => p.angle));
  const heldAngles = ANGLES.filter((a) => held.has(a));
  const heldNames = heldAngles.map((a) => ANGLE_LABELS[a]).join(', ');
  const heldCount = heldAngles.length;

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
          : 'Your baseline is a photograph rather than a scan.'}{' '}
        A scan captures the front, both sides and the top on its own and is
        saved beside it, so the next comparison has the same angles both times.
      </Text>

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
