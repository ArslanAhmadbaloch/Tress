/**
 * "{Goal} care tips": four numbered notes, the way the reference numbers
 * its recommendations.
 *
 * A grey disc with the number, the small grey kicker, and the note led
 * by its emoji. Every note is general care practice picked by the goal —
 * how to wash, dry, brush, tie — and none of them says what will happen
 * if it is followed; the sweep on features/hair-scan/tips.ts holds them
 * to that. Without Premium the first note is shown in full and the rest
 * are held blocks under their numbers.
 */

import { View } from 'react-native';

import { Text } from '@/components/ui/text';
import type { Tip } from '@/features/hair-scan/report-model';
import { useTheme } from '@/theme';

import { HeldBlock } from './locked';
import { HAIR_SCAN_REPORT_UI_COPY as UI } from './ui-copy';

const DISC = 48;

export function TipList({ items, locked }: { items: Tip[]; locked: boolean }) {
  const { colors, radius, spacing } = useTheme();

  /*
    A note that says when to see a doctor is never held back.

    The lock exists to keep the depth of a reading behind the
    subscription, and a line telling somebody that a sore or flaking
    scalp belongs with a GP is not depth — it is the one thing in here
    that could matter to their health, and charging for it would be
    indefensible. `safety` marks those notes at the source, in tips.ts,
    so the rule travels with the note rather than living in a component
    that might be copied without it.
  */

  return (
    <View style={{ gap: spacing.xl }}>
      {items.map((tip, i) => {
        const held = locked && i > 0 && tip.safety !== true;
        return (
          <View
            key={tip.id}
            accessible
            accessibilityLabel={held ? `${UI.a11y.tipNumber(i + 1)}. ${UI.locked.placeholder}` : `${UI.a11y.tipNumber(i + 1)}. ${tip.kicker}. ${tip.body}`}
            style={{ flexDirection: 'row', gap: spacing.lg, alignItems: 'flex-start' }}>
            <View
              style={{
                width: DISC,
                height: DISC,
                borderRadius: radius.pill,
                backgroundColor: colors.backgroundSubtle,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <Text variant="title3" color="textTertiary">
                {i + 1}
              </Text>
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: spacing.xs, paddingTop: spacing.xxs }}>
              <Text variant="subhead" color="textTertiary">
                {tip.kicker}
              </Text>
              {held ? (
                <HeldBlock lines={2} />
              ) : (
                <Text variant="callout">
                  {tip.emoji} {tip.body}
                </Text>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}
