/**
 * "Tress says": the coach's paragraph, beside its face.
 *
 * The bubble carries the speaker's name in small grey over the paragraph
 * the coach wrote from the record (features/coach/report-summary.ts):
 * what the turn kept, where the person's own focus points, whether the
 * figures were counted, when the next scan is due. The face beside it is
 * the same Tress the funnel shows — the onboarding kit's Mascot, with
 * its parted hair and its smile, idling — so the paragraph reads as
 * said by someone rather than printed by something, and by the same
 * someone who asked the questions. Its glow is off here: a report row
 * is a tight layout and the light would spill under the bubble. It is
 * hidden from the screen reader, which hears the speaker's name once,
 * from the bubble, rather than once from the picture and again from
 * the paragraph.
 *
 * It is a drawing, not a person: the paragraph never speaks in the
 * first person, and the sweep holds it to that.
 */

import { View } from 'react-native';

import { Mascot } from '@/components/onboarding/kit';
import { Text } from '@/components/ui/text';
import type { SaysBlock } from '@/features/hair-scan/report-model';
import { useTheme } from '@/theme';

const ORB = 56;

export function SaysBlockView({ says }: { says: SaysBlock }) {
  const { colors, radius, spacing } = useTheme();

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm }}>
      <Mascot size={ORB} expression="smile" glow={false} idle accessible={false} />
      <View
        accessible
        accessibilityLabel={`${says.speaker}: ${says.body}`}
        style={{
          flex: 1,
          minWidth: 0,
          backgroundColor: colors.backgroundSubtle,
          borderRadius: radius.card,
          borderBottomLeftRadius: radius.xs,
          paddingVertical: spacing.lg,
          paddingHorizontal: spacing.xl,
          gap: spacing.xs,
        }}>
        <Text variant="caption" color="textTertiary">
          {says.speaker}
        </Text>
        <Text variant="callout">{says.body}</Text>
      </View>
    </View>
  );
}
