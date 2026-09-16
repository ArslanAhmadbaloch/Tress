/**
 * A stand-in camera for the simulator, so the flow can be walked.
 *
 * The iOS simulator has no camera: expo-camera renders black and
 * `takePictureAsync` has nothing to hand back, which means everything
 * after the shutter — the frame flying into the pile, the review strip,
 * the analysing pass, the report — cannot be seen at all. This renders a
 * bundled example frame instead, and its `takePhoto` photographs its own
 * preview rather than returning the asset file.
 *
 * ── Why it photographs itself ─────────────────────────────────────────
 * Because the marker has to travel with the picture. The preview carries
 * a "Simulator · sample frame" pill, and `captureRef` burns that pill
 * into the JPEG, so every later rendering of that photograph — the
 * report hero, Home, Compare, the pile — says what it is without a
 * single `__DEV__` branch in any of those files. The shrink, the quality
 * reading and the write then run on it exactly as they would on a real
 * frame, because by then it is one: a real JPEG of a sample.
 *
 * It exists only in a development build on something that is not a
 * device (`sampleCameraActive`), and the record it produces is marked
 * `capture: 'sample'` by the screen on top of the pixels' own marker.
 */

import * as Device from 'expo-device';
import { Image } from 'expo-image';
import { useCallback, useImperativeHandle, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { Text } from '@/components/ui/text';
import { radius, spacing, useTheme } from '@/theme';

import type { TrackedCameraHandle, TrackedCameraProps } from './types';

/** What the pill says, in the photograph as well as on the preview. */
const MARKER = 'Simulator · sample frame';

/**
 * Whether this build should stand a sample frame in for the camera.
 *
 * `__DEV__` first, so the whole thing is stripped from a release bundle;
 * the simulator check is what keeps a development build on a real phone
 * using its real camera.
 */
export function sampleCameraActive(): boolean {
  return __DEV__ && !Device.isDevice;
}

export function SampleCamera({ ref, sampleSource }: TrackedCameraProps) {
  const { colors } = useTheme();
  const root = useRef<View>(null);
  /**
   * Whether there is a frame on screen to photograph. Written from the
   * image's own load callback — a ref rather than state, because nothing
   * renders differently once it is true.
   */
  const loaded = useRef(false);

  const markLoaded = useCallback(() => {
    loaded.current = true;
  }, []);

  useImperativeHandle(
    ref,
    (): TrackedCameraHandle => ({
      async takePhoto() {
        if (!loaded.current) throw new Error('Sample frame not loaded');
        const path = await captureRef(root, {
          format: 'jpg',
          quality: 0.92,
          result: 'tmpfile',
        });
        return { uri: path.startsWith('file://') ? path : `file://${path}` };
      },
    }),
    [],
  );

  return (
    /*
      `collapsable={false}` so Android keeps a real view behind this node
      for the capture to read; on iOS it is a no-op. Black underneath, the
      way an unlit camera is black — not a themed surface.
    */
    <View ref={root} collapsable={false} style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }]}>
      {sampleSource !== undefined ? (
        <Image
          source={sampleSource}
          onLoad={markLoaded}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          accessible={false}
        />
      ) : null}

      {/*
        At 60 % of the height: below a framed face, above the bottom card,
        and inside the band a cover-crop keeps on every phone shape. Set
        at headline rather than caption so it survives the shrink to 1440
        pixels and is still readable when the photograph is a hero.
      */}
      <View style={{ position: 'absolute', top: '60%', left: 0, right: 0, alignItems: 'center' }}>
        <View
          style={{
            backgroundColor: colors.photoScrim,
            borderRadius: radius.pill,
            paddingVertical: spacing.xs + 1,
            paddingHorizontal: spacing.md,
          }}>
          <Text variant="headline" color="textOnPhoto">
            {MARKER}
          </Text>
        </View>
      </View>
    </View>
  );
}
