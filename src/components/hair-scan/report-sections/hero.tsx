/**
 * The main still, with the mesh held on it and the date on a chip.
 *
 * It is the top of the screen and the thing the report is about: the
 * front frame the scan kept, drawn full bleed under the status bar, the
 * cap the camera showed laid on the head — the instrument the person
 * watched, held on the picture it worked on — and the moment it was
 * taken on a glass chip at the top. The sheet rises over its foot.
 *
 * The mesh comes from one of two places. The screen that ran the scan
 * still has the frame's shutter-time mesh and hands it in; a report
 * without it — one reopened from the journal, or one whose screen did
 * not pass the mesh — has the region rectangles the frame stored, and
 * the face box is run back out of the two temple boxes (layout.ts,
 * `faceFromRegions`), which survive a head high in the frame when the
 * hairline band does not. Either way it is where the scan looked, drawn
 * in the still's own cover fit so it lands where the processing screen's
 * did. When neither is available the hero is the photograph alone.
 *
 * A session that kept no frames has no hero. The space is a dark plate
 * with the date chip, and the sections below say what was not kept.
 */

import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn, useAnimatedStyle, useReducedMotion, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { StaticHairMesh } from '@/components/hair-scan/hair-mesh';
import { GlassSurface } from '@/components/ui/glass-surface';
import { Icon } from '@/components/ui/icon';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Text } from '@/components/ui/text';
import { meshInBox } from '@/features/hair-scan/engine';
import type { HairScanReportModel } from '@/features/hair-scan/report-model';
import type { StillMesh } from '@/features/hair-scan/types';
import { darkColors, iconSize, useTheme } from '@/theme';
import type { Photo } from '@/types/domain';

import { chromeOpacity, faceFromRegions, faceInBox } from './layout';
import { HAIR_SCAN_REPORT_UI_COPY as UI } from './ui-copy';

/** How long the photograph has the screen before the mesh lands on it. */
const MESH_DELAY = 420;
const MESH_IN_MS = 700;

export function ReportHero({
  hero,
  photo,
  mesh,
  height,
}: {
  hero: HairScanReportModel['hero'];
  /** The photograph behind the hero, for its stored regions. */
  photo: Pick<Photo, 'regions' | 'thumbnailUri'> | null;
  /** The shutter-time mesh, when the screen that ran the scan still has it. */
  mesh?: StillMesh | null;
  height: number;
}) {
  const reduceMotion = useReducedMotion();
  const [box, setBox] = useState({ width: 0, height: 0 });

  const still = useMemo(() => ({ width: hero.width, height: hero.height }), [hero.width, hero.height]);

  /*
    The face in the box's points: the live mesh through the same map the
    processing screen used, or the stored rectangles run backwards. Both
    are cover-fitted into the box `expo-image` draws the still in.
  */
  const face = useMemo(() => {
    if (box.width === 0 || box.height === 0) return null;
    if (mesh) return meshInBox(mesh.face, mesh.still, box);
    const fromRegions = faceFromRegions(photo?.regions);
    return fromRegions ? faceInBox(fromRegions, still, box) : null;
  }, [mesh, photo?.regions, still, box]);

  const { uri } = hero;
  const hasPhoto = uri.length > 0;

  return (
    <View
      onLayout={(e) =>
        setBox({ width: Math.round(e.nativeEvent.layout.width), height: Math.round(e.nativeEvent.layout.height) })
      }
      style={{ width: '100%', height, backgroundColor: darkColors.background, overflow: 'hidden' }}>
      {hasPhoto ? (
        /*
          Full resolution on purpose: this is the one photograph the
          screen is about, drawn the width of the screen. The thumbnail
          paints first so the frame is never empty while the file decodes.
        */
        <Image
          source={{ uri }}
          placeholder={photo?.thumbnailUri ? { uri: photo.thumbnailUri } : undefined}
          placeholderContentFit="cover"
          contentFit="cover"
          transition={240}
          accessibilityLabel={UI.hero.photoLabel}
          style={{ width: '100%', height: '100%' }}
        />
      ) : null}

      {face && box.width > 0 ? (
        <Animated.View
          pointerEvents="none"
          entering={reduceMotion ? undefined : FadeIn.delay(MESH_DELAY).duration(MESH_IN_MS)}
          style={{ position: 'absolute', top: 0, left: 0, width: box.width, height: box.height }}>
          <StaticHairMesh
            face={face}
            fit={face.fit}
            width={box.width}
            height={box.height}
            tone="good"
            points
          />
        </Animated.View>
      ) : null}

    </View>
  );
}

/**
 * The chrome over the still: the date on a glass chip, centred, and the
 * way back at the top left when there is one. Drawn above the sheet —
 * the scroll view takes every touch on the still otherwise — and faded
 * out as the sheet rises to meet it, so a stuck tab row never has a
 * button sitting on it. The screen turns its touches off at the same
 * moment. The fade reads the scroll on the UI thread, so it keeps pace
 * with the sheet; under Reduce Motion it steps (layout.ts,
 * `chromeOpacity`).
 */
export function HeroChrome({
  dateLabel,
  onBack,
  scrollY,
  fadeBy,
}: {
  dateLabel: string;
  onBack?: () => void;
  /** The sheet's scroll, in points. */
  scrollY: SharedValue<number>;
  /** The scroll at which the chrome has gone. */
  fadeBy: number;
}) {
  const { spacing, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();

  const fade = useAnimatedStyle(() => ({
    opacity: chromeOpacity(scrollY.get(), fadeBy, reduceMotion),
  }));

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[{ position: 'absolute', top: insets.top + spacing.sm, left: 0, right: 0 }, fade]}>
      {/* The date, on glass, centred at the top of the still. */}
      <View pointerEvents="box-none" style={{ alignItems: 'center', paddingTop: spacing.xs }}>
        <GlassSurface variant="regular" over="dark" borderRadius={radius.pill}>
          <View style={{ paddingVertical: spacing.sm + spacing.xxs, paddingHorizontal: spacing.lg }}>
            <Text variant="subhead" color="textOnPhoto">
              {dateLabel}
            </Text>
          </View>
        </GlassSurface>
      </View>

      {onBack ? (
        <View style={{ position: 'absolute', top: 0, left: spacing.lg }}>
          <GlassSurface variant="regular" over="dark" borderRadius={radius.pill}>
            <PressableScale
              onPress={onBack}
              accessibilityRole="button"
              accessibilityLabel={UI.actions.back}
              style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="chevronLeft" size={iconSize.md} color={darkColors.textOnPhoto} />
            </PressableScale>
          </GlassSurface>
        </View>
      ) : null}
    </Animated.View>
  );
}
