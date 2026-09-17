/**
 * A saved scan's report, reopened from the journal.
 *
 * The same report the scan ended on, drawn for a session already in the
 * record: the still, the sheet, the sections, the pill. It differs only
 * at the edges — a way back over the still, Done as the way out, and
 * Scan again opening a fresh scan rather than restarting one — and in
 * where its mesh comes from: the shutter-time mesh is long gone, so the
 * hero places the cap from the regions the frame stored.
 *
 * Reached with `?id=` from the update screen for any session the scan
 * saved. A session that is not there any more says so and offers the
 * way back, as the update screen does. It never spends the one
 * notifications ask (`ask={false}`): that belongs to a scan's own report.
 */

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { View } from 'react-native';

import { HairScanReport } from '@/components/hair-scan/report';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/layout';
import { Text } from '@/components/ui/text';
import { useBackOrHome } from '@/lib/navigation';
import { useAppStore } from '@/store/app-store';
import { useTheme } from '@/theme';

export default function HairReportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { spacing } = useTheme();
  const router = useRouter();
  const leave = useBackOrHome('/journey');
  const { data } = useAppStore();

  const session = data.sessions.find((s) => s.id === id);
  const rescan = useCallback(() => router.push('/hair-scan'), [router]);

  if (!session) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl }}>
          <Text variant="title3">Report not found</Text>
          <Text variant="callout" color="textSecondary" center style={{ marginTop: spacing.sm }}>
            The scan it belongs to may have been deleted.
          </Text>
          <Button label="Go back" variant="secondary" block={false} style={{ marginTop: spacing.xl }} onPress={leave} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={[]} ground="plain">
      <HairScanReport session={session} ask={false} onBack={leave} onDone={leave} onRescan={rescan} />
    </Screen>
  );
}
