/**
 * Camera permission, asked for on the scanner's own dark ground.
 *
 * Two states and no dead end. Before the system has been asked, one
 * title, one line and Continue — the caller makes the actual request,
 * because the camera lane owns the permission hook. After a refusal the
 * system will not ask again, so the same screen changes its line and
 * offers the only route that still works: the phone's Settings, through
 * `Linking.openSettings`, with a way back for someone who would rather
 * not.
 *
 * Copy comes from the scan copy so this screen says what the rest of the
 * scanner says about where the images go.
 */

import { Linking, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { HAIR_SCAN_COPY } from '@/features/hair-scan/copy';
import { darkColors, iconSize, motion, radius, spacing } from '@/theme';

export type PermissionStatus = 'undetermined' | 'denied';

export type PermissionViewProps = {
  status: PermissionStatus;
  /** Ask the system. Only offered while `status` is `undetermined`. */
  onContinue: () => void;
  /** Leave the scanner. */
  onClose: () => void;
};

export function PermissionView({ status, onContinue, onClose }: PermissionViewProps) {
  const insets = useSafeAreaInsets();
  const copy = HAIR_SCAN_COPY.permission;
  const denied = status === 'denied';

  const openSettings = () => {
    Linking.openSettings().catch(() => undefined);
  };

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: darkColors.background,
        paddingTop: insets.top + spacing.giant,
        paddingBottom: insets.bottom + spacing.xl,
        paddingHorizontal: spacing.xxl,
        justifyContent: 'space-between',
      }}>
      <Animated.View
        key={status}
        entering={FadeIn.duration(motion.duration.slow)}
        style={{ alignItems: 'center', gap: spacing.lg }}>
        <View
          style={{
            width: 72,
            height: 72,
            borderRadius: radius.pill,
            backgroundColor: darkColors.surface,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Icon name="camera" size={iconSize.xl} color={darkColors.text} />
        </View>
        <Text variant="title2" center style={{ color: darkColors.text }}>
          {copy.title}
        </Text>
        <Text variant="body" center style={{ color: darkColors.textSecondary }}>
          {denied ? copy.denied : copy.body}
        </Text>
      </Animated.View>

      <View style={{ gap: spacing.md }}>
        {denied ? (
          <Button label={copy.openSettings} onPress={openSettings} icon="settings" />
        ) : (
          <Button label={copy.cta} onPress={onContinue} />
        )}
        <Button label={HAIR_SCAN_COPY.error.close} variant="ghost" onPress={onClose} />
      </View>
    </View>
  );
}
