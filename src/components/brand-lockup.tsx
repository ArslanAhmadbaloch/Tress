/**
 * The brand lockup: the plate, the mark, and the phrase.
 *
 * One drawing, used in two places — the launch animation, which brings its
 * pieces up one at a time, and the first screen of onboarding, which shows
 * it whole. Keeping the geometry here is what stops those two drifting:
 * the artwork someone sees while the app is starting is the same artwork,
 * at the same position, as the screen it hands over to.
 *
 * Everything is placed as a fraction of the designer's plate and then
 * mapped onto whatever rectangle that plate covers on this screen, so the
 * lockup stays registered on any aspect ratio.
 */

import { Image } from 'expo-image';
import { StyleSheet, View, useWindowDimensions, type ViewStyle } from 'react-native';

export const PLATE = require('@/assets/images/splash-plate.jpg');
const EMBLEM = require('@/assets/images/splash-emblem.png');
const LINE_ONE = require('@/assets/images/splash-line-one.png');
const LINE_TWO = require('@/assets/images/splash-line-two.png');

/** Held until these have decoded, so the first frame is the finished plate. */
export const LOCKUP_ASSETS = [PLATE, EMBLEM, LINE_ONE, LINE_TWO];

/** The design's own pixel dimensions; every position below is a fraction of it. */
export const PLATE_W = 853;
export const PLATE_H = 1844;

export type Tile = {
  source: number;
  /** Top-left corner and width, as fractions of the plate. */
  left: number;
  top: number;
  width: number;
  /** The tile's own pixel aspect, so it is never stretched. */
  aspect: number;
};

/** Printed by scripts/splash-tiles.swift when it cuts the artwork. */
export const EMBLEM_TILE: Tile = {
  source: EMBLEM,
  left: 0.26729,
  top: 0.28254,
  width: 0.45252,
  aspect: 386 / 431,
};
export const LINE_ONE_TILE: Tile = {
  source: LINE_ONE,
  left: 0.2755,
  top: 0.51627,
  width: 0.45369,
  aspect: 387 / 70,
};
export const LINE_TWO_TILE: Tile = {
  source: LINE_TWO,
  left: 0.19343,
  top: 0.55369,
  width: 0.61782,
  aspect: 527 / 96,
};

/** Centre and radius of the mark's disc, for light that plays on it. */
export const DISC = { x: 0.498, y: 0.42, r: 0.182 };

export type CoverRect = { width: number; height: number; left: number; top: number };

/**
 * The rectangle the plate covers on a screen of this size.
 *
 * Cover rather than fit: the lockup is centred artwork on a much larger
 * field, so cropping the field costs nothing and letterboxing would break
 * the illusion.
 */
export function coverRect(width: number, height: number): CoverRect {
  const scale = Math.max(width / PLATE_W, height / PLATE_H);
  return {
    width: PLATE_W * scale,
    height: PLATE_H * scale,
    left: (width - PLATE_W * scale) / 2,
    top: (height - PLATE_H * scale) / 2,
  };
}

/** Where a tile sits, in the coordinates of the covering rectangle. */
export function tileStyle(tile: Tile, rect: CoverRect): ViewStyle {
  const width = tile.width * rect.width;
  return {
    position: 'absolute',
    left: rect.left + tile.left * rect.width,
    top: rect.top + tile.top * rect.height,
    width,
    height: width / tile.aspect,
  };
}

/** One piece of the artwork, drawn where it belongs. */
export function LockupTile({ tile, rect }: { tile: Tile; rect: CoverRect }) {
  return (
    <View style={tileStyle(tile, rect)}>
      <Image
        source={tile.source}
        style={StyleSheet.absoluteFill}
        contentFit="fill"
        transition={0}
        cachePolicy="memory-disk"
        accessible={false}
      />
    </View>
  );
}

/** The plate, full bleed. */
export function Plate() {
  return (
    <Image
      source={PLATE}
      style={StyleSheet.absoluteFill}
      contentFit="cover"
      contentPosition="center"
      transition={0}
      cachePolicy="memory-disk"
      accessible={false}
    />
  );
}

/**
 * The finished lockup, standing still.
 *
 * Deliberately without the "Track progress / Build a healthier tomorrow"
 * line from the original artwork: the phrase is the promise, and a second
 * line of smaller type under it reads as a strapline competing with it.
 */
export function BrandLockup() {
  const { width, height } = useWindowDimensions();
  const rect = coverRect(width, height);

  return (
    <View
      pointerEvents="none"
      accessible
      accessibilityRole="image"
      accessibilityLabel="Hair Journey. Better hair, a confident you."
      style={StyleSheet.absoluteFill}>
      <Plate />
      <LockupTile tile={EMBLEM_TILE} rect={rect} />
      <LockupTile tile={LINE_ONE_TILE} rect={rect} />
      <LockupTile tile={LINE_TWO_TILE} rect={rect} />
    </View>
  );
}
