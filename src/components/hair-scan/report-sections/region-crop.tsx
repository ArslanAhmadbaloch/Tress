/**
 * One place on one photograph, in a rounded square.
 *
 * The square is a window: the photograph is drawn behind it at the size
 * that makes the crop rectangle fill the window, slid so the rectangle
 * sits in it, and everything outside is clipped. The sums are in
 * layout.ts (`cropLayout`), which the tests pin — a crop is a caption on
 * a picture, and a caption on the wrong part of the picture reads as a
 * finding about the wrong place.
 *
 * When the photograph carries the segmenter's trace, a few marks are set
 * on it through the same cover fit the hero's mask uses: the measured
 * boundary as a thin line and points along its top edge, only the ones
 * inside the window (layout.ts, `edgeDots`). They are the measurement,
 * not a decoration, and they appear only where one was made. They are
 * static and light on purpose: a report shows up to seven crops at once,
 * and the hero's full overlay — a scrim over everything outside the mask,
 * a wipe, a drawn edge — is one instrument for one photograph, not a
 * treatment for a thumbnail; at this size a scrim over a forehead is a
 * heavy thing to put beside a person's name for a place. A crop cut from
 * the fallback rectangle — no face placed at the shutter — says so in a
 * small caption, because "Hairline" over the top third of a frame is a
 * guess and the row must not pass it off as a placed crop.
 */

import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import Svg, { Circle, Path } from 'react-native-svg';

import { maskPaths, maskTraceOf, projector, type ParsedMaskTrace } from '@/components/report';
import { Text } from '@/components/ui/text';
import type { ReportCrop } from '@/features/hair-scan/region-crops';
import { useTheme } from '@/theme';
import type { Photo } from '@/types/domain';

import { cropLayout, edgeDots, type CropLayout } from './layout';
import { HAIR_SCAN_REPORT_UI_COPY as UI } from './ui-copy';

/** The side of a crop in an analysis row. */
export const ROW_CROP = 88;
/** The side of a crop in the focus block's row of three. */
export const FOCUS_CROP = 96;

/** A mark's radius, and the ring of photograph-white that lifts it off hair. */
const DOT_R = 2.2;
const DOT_RING = 1;

export function RegionCrop({
  crop,
  photo,
  size = ROW_CROP,
  label,
  showApproximate = true,
  style,
}: {
  crop: ReportCrop;
  /** The photograph the crop is cut from, when the caller has it: the mask is read off it. */
  photo?: Pick<Photo, 'maskTrace' | 'width' | 'height'> | null;
  size?: number;
  /** The accessible name: which place this is. */
  label: string;
  /** Whether a fallback crop is captioned as one. */
  showApproximate?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, radius, spacing } = useTheme();
  const [box, setBox] = useState({ width: size, height: size });
  const layout = cropLayout(crop, box);

  const trace = useMemo(() => (photo ? maskTraceOf(photo) : null), [photo]);
  const hasMask = trace !== null && crop.width > 0 && crop.height > 0 && box.width > 0;
  const { uri } = crop;

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      onLayout={(e) =>
        setBox({ width: Math.round(e.nativeEvent.layout.width), height: Math.round(e.nativeEvent.layout.height) })
      }
      style={[
        {
          width: size,
          height: size,
          borderRadius: radius.md,
          overflow: 'hidden',
          backgroundColor: colors.backgroundSubtle,
        },
        style,
      ]}>
      {uri ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: layout.imageWidth,
            height: layout.imageHeight,
            transform: [{ translateX: layout.translateX }, { translateY: layout.translateY }],
          }}>
          <Image
            source={{ uri }}
            contentFit="cover"
            transition={200}
            accessible={false}
            style={{ width: '100%', height: '100%' }}
          />
          {hasMask && trace ? (
            <CropMarks trace={trace} photoWidth={crop.width} photoHeight={crop.height} layout={layout} box={box} />
          ) : null}
        </View>
      ) : null}

      {showApproximate && crop.approximate ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: spacing.xs,
            right: spacing.xs,
            bottom: spacing.xs,
            paddingVertical: spacing.xxs,
            paddingHorizontal: spacing.xs,
            borderRadius: radius.xs,
            backgroundColor: colors.photoScrim,
          }}>
          <Text variant="micro" color="textOnPhoto" numberOfLines={1} center>
            {UI.crop.approximate}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/**
 * The marks: the measured boundary as a thin line and points along its
 * top edge, in the drawn photograph's points, over the whole drawn
 * picture — the window clips them like the picture. Static: nothing here
 * moves, so there is nothing for Reduce Motion to stand down, and a
 * crop that is drawn out of sight costs its paths and nothing more.
 */
function CropMarks({
  trace,
  photoWidth,
  photoHeight,
  layout,
  box,
}: {
  trace: ParsedMaskTrace;
  photoWidth: number;
  photoHeight: number;
  layout: CropLayout;
  box: { width: number; height: number };
}) {
  const { colors } = useTheme();
  const { imageWidth, imageHeight, translateX, translateY } = layout;

  const marks = useMemo(() => {
    const project = projector({ width: photoWidth, height: photoHeight }, imageWidth, imageHeight);
    const paths = maskPaths(trace, project, imageWidth, imageHeight);
    const dots = edgeDots(trace, project, {
      x: -translateX,
      y: -translateY,
      width: box.width,
      height: box.height,
    });
    return { region: paths.region, dots };
  }, [trace, photoWidth, photoHeight, imageWidth, imageHeight, translateX, translateY, box.width, box.height]);

  return (
    <Svg
      width={imageWidth}
      height={imageHeight}
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ position: 'absolute', top: 0, left: 0 }}>
      <Path d={marks.region} fillRule="evenodd" fill="none" stroke={colors.accent} strokeOpacity={0.7} strokeWidth={1} />
      {marks.dots.map((dot, i) => (
        <Circle
          key={`${i}:${Math.round(dot.x)}:${Math.round(dot.y)}`}
          cx={dot.x}
          cy={dot.y}
          r={DOT_R}
          fill={colors.accent}
          stroke={colors.surface}
          strokeWidth={DOT_RING}
        />
      ))}
    </Svg>
  );
}
