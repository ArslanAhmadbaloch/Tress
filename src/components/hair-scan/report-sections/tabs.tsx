/**
 * The tab row: All / Hairline / Temples / Crown / Light.
 *
 * It filters the analysis rows and nothing else — the sections under the
 * rows are the same whichever tab is open — so it is a row of quiet
 * labels with the chosen one on a filled pill, not the app's segmented
 * control, which is for choices that change a whole screen. The tabs
 * come from the model, because the light tab exists only when a frame
 * carries a reading; the row never invents one.
 *
 * This is the top of the sheet: it carries the sheet's rounded top
 * corners and sticks under the status bar while the sections scroll
 * beneath it, so the way into the rows is always in reach.
 */

import { ScrollView, View } from 'react-native';

import { PressableScale } from '@/components/ui/pressable-scale';
import { Text } from '@/components/ui/text';
import type { ReportTab } from '@/features/hair-scan/report-model';
import { useTheme } from '@/theme';

import { HAIR_SCAN_REPORT_UI_COPY as UI } from './ui-copy';

/** The height of the tab row, which the sheet's scroll-to sums subtract. */
export const TAB_ROW_HEIGHT = 64;

export function ReportTabs({
  tabs,
  value,
  onChange,
}: {
  tabs: { id: ReportTab; label: string }[];
  value: ReportTab;
  onChange: (next: ReportTab) => void;
}) {
  const { colors, radius, spacing } = useTheme();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityRole="tablist"
      accessibilityLabel={UI.a11y.tabs}
      style={{ height: TAB_ROW_HEIGHT, flexGrow: 0 }}
      contentContainerStyle={{
        paddingHorizontal: spacing.md,
        alignItems: 'center',
        gap: spacing.xs,
        minWidth: '100%',
      }}>
      {tabs.map((tab) => {
        const selected = tab.id === value;
        return (
          <PressableScale
            key={tab.id}
            onPress={() => onChange(tab.id)}
            haptic="light"
            scaleTo={0.94}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={tab.label}
            style={{
              height: 40,
              paddingHorizontal: spacing.lg,
              borderRadius: radius.pill,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: selected ? colors.fill : undefined,
            }}>
            <Text variant="callout" color={selected ? 'text' : 'textSecondary'} numberOfLines={1}>
              {tab.label}
            </Text>
          </PressableScale>
        );
      })}
      {/* A trailing seat, so the last label is never flush with the edge. */}
      <View style={{ width: spacing.sm }} />
    </ScrollView>
  );
}
