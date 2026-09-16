/**
 * The preview of an update's export, and the sheet that hands it on.
 *
 * Two rules shape this file.
 *
 * The first: what the person sees is exactly what is captured. The view
 * inside the panel *is* the capture target, so there is no second,
 * off-screen copy that could drift from the preview — and `captureRef` is
 * only reliable on a mounted, laid-out view anyway.
 *
 * The second: the sheet is always light, whatever the app's appearance.
 * The image is a document; it may be printed, or read on somebody else's
 * phone, and a dark-mode export puts near-black around scalp photographs.
 * So the card takes `lightColors` directly while the panel around it
 * follows the theme — a light card on a dark panel is the honest preview
 * of the file that is about to leave.
 */

import { File, Paths } from 'expo-file-system';
import { Image } from 'expo-image';
import * as Sharing from 'expo-sharing';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
} from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { captureRef } from 'react-native-view-shot';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { SHARE_COPY, type SessionSheet } from '@/features/share/session-sheet';
import { lightColors, radius, spacing, useTheme } from '@/theme';
import { type Angle } from '@/types/domain';

/**
 * Tall-ish frames, matching the thumbnails on the session screen so the
 * image looks like the record it came from.
 */
const FRAME_ASPECT = 0.78;

export function SessionSheetView({
  sheet,
  width,
  onFrameSettled,
}: {
  sheet: SessionSheet;
  width: number;
  onFrameSettled: (angle: Angle) => void;
}) {
  const [broken, setBroken] = useState<Angle[]>([]);

  const markBroken = (angle: Angle) =>
    setBroken((prev) => (prev.includes(angle) ? prev : [...prev, angle]));

  return (
    <View
      // collapsable={false} so the view keeps a native backing layer of its
      // own; view-shot has nothing to draw without one.
      collapsable={false}
      accessible
      accessibilityRole="image"
      accessibilityLabel={sheet.accessibilityLabel}
      style={{
        width,
        padding: spacing.lg,
        borderRadius: radius.lg,
        backgroundColor: lightColors.surface,
      }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {/*
          The wordmark's resting state, drawn as plain text rather than the
          Wordmark component: its halo breathes, and a capture taken
          mid-swell would put a smear on the file.
        */}
        <Text
          variant="caption"
          style={{ color: lightColors.accent, fontWeight: '700', letterSpacing: 2 }}>
          TRESS
        </Text>
        <View style={{ flex: 1 }} />
        <Text variant="headline" style={{ color: lightColors.text }}>
          {sheet.heading}
        </Text>
      </View>

      <Text variant="subhead" style={{ color: lightColors.textSecondary, marginTop: 2 }}>
        {sheet.dateLine}
      </Text>
      {sheet.baselineLine ? (
        <Text variant="footnote" style={{ color: lightColors.textSecondary, marginTop: 2 }}>
          {sheet.baselineLine}
        </Text>
      ) : null}

      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: spacing.sm,
          marginTop: spacing.lg,
        }}>
        {sheet.frames.map((frame) => (
          <View key={frame.angle} style={{ width: '31.5%' }}>
            {broken.includes(frame.angle) ? (
              // A file that is gone is a fact about the record, so it is
              // shown as one rather than quietly dropped from the image.
              <View
                style={{
                  width: '100%',
                  aspectRatio: FRAME_ASPECT,
                  borderRadius: radius.sm,
                  backgroundColor: lightColors.fill,
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: spacing.xs,
                }}>
                <Text
                  variant="caption"
                  center
                  style={{ color: lightColors.textSecondary }}>
                  {SHARE_COPY.missingFrame}
                </Text>
              </View>
            ) : (
              <Image
                source={frame.source}
                contentFit="cover"
                // No transition: a frame still fading when the shutter
                // fires is a half-drawn photograph in the file.
                recyclingKey={frame.source.uri}
                accessible={false}
                onLoadEnd={() => onFrameSettled(frame.angle)}
                onError={() => {
                  markBroken(frame.angle);
                  // onLoadEnd fires for a failure too, but the Image is
                  // swapped for the empty slot on this same event — so the
                  // frame counts itself settled here rather than relying on
                  // a callback from a view that may already be gone.
                  onFrameSettled(frame.angle);
                }}
                style={{
                  width: '100%',
                  aspectRatio: FRAME_ASPECT,
                  borderRadius: radius.sm,
                  backgroundColor: lightColors.fill,
                }}
              />
            )}
            <Text
              variant="caption"
              style={{ color: lightColors.textSecondary, marginTop: 4 }}>
              {frame.caption}
            </Text>
          </View>
        ))}
      </View>

      <Text
        variant="footnote"
        style={{ color: lightColors.textSecondary, marginTop: spacing.lg }}>
        {sheet.footer}
      </Text>
    </View>
  );
}

export function ShareUpdateModal({
  sheet,
  onClose,
}: {
  sheet: SessionSheet | null;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();

  return (
    <Modal
      visible={sheet !== null}
      transparent
      statusBarTranslucent
      animationType={reduceMotion ? 'none' : 'slide'}
      // Android's back gesture should close the sheet, not the screen.
      onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end' }}>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={SHARE_COPY.close}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
        {/*
          Mounted only while the sheet is open, which is what resets the
          per-open bookkeeping — which frames have settled — without an
          effect that writes state on every change of the sheet.
        */}
        {sheet ? <SharePanel sheet={sheet} onClose={onClose} /> : null}
      </View>
    </Modal>
  );
}

function SharePanel({ sheet, onClose }: { sheet: SessionSheet; onClose: () => void }) {
  const { colors, shadow } = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  const shot = useRef<View>(null);
  /** A second tap while the file is being written must do nothing. */
  const busy = useRef(false);
  /*
    Close stays live while the image is being written, so the panel can
    be gone before the work finishes. Nothing that puts something on the
    screen — the system share sheet, either alert — may fire after that:
    a sheet the person dismissed must not reappear over the screen they
    went back to. Cleanup only, so no state is written from an effect.
  */
  const live = useRef(true);
  useEffect(() => () => {
    live.current = false;
  }, []);
  const [composing, setComposing] = useState(false);
  const [settled, setSettled] = useState<Angle[]>([]);

  const onFrameSettled = useCallback((angle: Angle) => {
    setSettled((prev) => (prev.includes(angle) ? prev : [...prev, angle]));
  }, []);

  const ready = settled.length >= sheet.frames.length;

  const share = async () => {
    if (busy.current) return;
    busy.current = true;
    setComposing(true);

    try {
      const captured = await captureRef(shot, { format: 'jpg', quality: 0.92 });
      if (!live.current) return;

      // view-shot names its output with a UUID, which is what the share
      // sheet would otherwise show as the name of the file.
      const named = new File(Paths.cache, sheet.fileName);
      if (named.exists) named.delete();
      await new File(captured).move(named);
      if (!live.current) return;

      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert(SHARE_COPY.unavailableTitle, SHARE_COPY.unavailableBody);
        return;
      }
      if (!live.current) return;

      await Sharing.shareAsync(named.uri, {
        mimeType: 'image/jpeg',
        UTI: 'public.jpeg',
        dialogTitle: SHARE_COPY.dialogTitle,
      });

      // No tick, no "Shared" line: the promise resolves the same way
      // whether the person sent the image or cancelled the sheet, so the
      // app says nothing that would depend on knowing which.
      onClose();
    } catch {
      if (live.current) Alert.alert(SHARE_COPY.failedTitle, SHARE_COPY.failedBody);
    } finally {
      busy.current = false;
      if (live.current) setComposing(false);
    }
  };

  const panelWidth = width - spacing.lg * 2 - spacing.xl * 2;

  return (
    <View
      accessibilityViewIsModal
      style={[
        {
          margin: spacing.lg,
          marginBottom: insets.bottom + spacing.lg,
          padding: spacing.xl,
          borderRadius: radius.xl,
          backgroundColor: colors.surface,
        },
        shadow.lifted,
      ]}>
      {/* Grabber, so it reads as a sheet rather than a floating panel. */}
      <View
        style={{
          alignSelf: 'center',
          width: 36,
          height: 4,
          borderRadius: 2,
          backgroundColor: colors.fillSelected,
          marginBottom: spacing.lg,
        }}
      />

      <Text variant="title3">{SHARE_COPY.title}</Text>
      <Text variant="footnote" color="textSecondary" style={{ marginTop: spacing.xs }}>
        {SHARE_COPY.hint}
      </Text>

      <ScrollView
        showsVerticalScrollIndicator={false}
        style={{ maxHeight: height * 0.55, marginTop: spacing.md }}>
        <View ref={shot} collapsable={false}>
          <SessionSheetView
            sheet={sheet}
            width={panelWidth}
            onFrameSettled={onFrameSettled}
          />
        </View>
      </ScrollView>

      <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg }}>
        <Button
          label={SHARE_COPY.close}
          variant="secondary"
          size="md"
          onPress={onClose}
          style={{ flex: 1 }}
        />
        <Button
          label={composing ? SHARE_COPY.composing : ready ? SHARE_COPY.share : SHARE_COPY.preparing}
          icon="share"
          size="md"
          loading={composing || !ready}
          onPress={share}
          style={{ flex: 1 }}
        />
      </View>
    </View>
  );
}
