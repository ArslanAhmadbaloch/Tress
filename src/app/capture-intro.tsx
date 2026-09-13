import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { MetricExplainer } from '@/components/dashboard';
import { Button } from '@/components/ui/button';
import { GlassOrb } from '@/components/ui/glass-orb';
import { Icon, type IconName } from '@/components/ui/icon';
import { Screen, ScreenScroll, ScreenTitle } from '@/components/ui/layout';
import { PressableScale } from '@/components/ui/pressable-scale';
import { BulbGlyph } from '@/components/ui/tab-glyphs';
import { Text } from '@/components/ui/text';
import { ANGLE_EXAMPLES, CAPTURE_PORTRAIT } from '@/features/capture/examples';
import { formatRelative } from '@/lib/date';
import { useBackOrHome } from '@/lib/navigation';
import { usePremium } from '@/features/subscription/provider';
import { useAppStore } from '@/store/app-store';
import { latestSession } from '@/store/selectors';
import { useTheme } from '@/theme';
import { ANGLES, ANGLE_GUIDANCE, ANGLE_LABELS } from '@/types/domain';

/**
 * Guided 5-angle capture — the step before the camera.
 *
 * Its whole job is to make the next five minutes repeatable: show every
 * angle that is coming as one set, explain the selected one with a clear
 * example, and keep the conditions that decide whether the comparison
 * will be worth anything one tap away. Consistency is the product; this
 * screen is where it is bought.
 *
 * The photographs are design-kit examples of framing, labelled as such;
 * the user's own photos never appear here mixed in with them.
 */
const CONDITIONS = [
  'Same light — near a window works well',
  'Same distance, arm held the same way',
  'Dry hair, styled as you normally wear it',
];

/** Photo diameter of an angle in the orbit, and its ring. */
const SAT = 60;
const SAT_RING = SAT + 8;

/** Where each angle sits on the ring, in degrees from 12 o'clock. */
const ORBIT_OFFSETS = [0, -62, 62, -128, 128];

export default function CaptureIntroScreen() {
  const { colors, spacing, radius, shadow } = useTheme();
  const router = useRouter();
  const leave = useBackOrHome();
  const { width } = useWindowDimensions();
  const { data } = useAppStore();
  const { isPremium } = usePremium();

  const [index, setIndex] = useState(0);
  const [showTips, setShowTips] = useState(false);
  const [showExample, setShowExample] = useState(false);

  const last = latestSession(data);
  const isBaseline = data.sessions.length === 0;

  // Every route into the camera passes through this screen, so this is
  // the only place capture has to be gated — a new entry point added
  // later cannot slip past it.
  useEffect(() => {
    if (!isPremium) router.replace('/paywall');
  }, [isPremium, router]);
  const angle = ANGLES[index];
  const label = ANGLE_LABELS[angle];

  /* Orbit geometry, scaled to the screen. */
  const W = Math.min(width - spacing.xl * 2, 380);
  const R = W * 0.4;
  const cx = W / 2;
  const cy = R + SAT_RING / 2 + spacing.xs;
  const centre = R * 1.05;
  const H = cy + R * Math.sin((38 * Math.PI) / 180) + SAT_RING / 2 + 30;

  const position = (i: number) => {
    const a = ((ORBIT_OFFSETS[i] - 90) * Math.PI) / 180;
    return { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) };
  };

  return (
    <Screen>
      <ScreenScroll clearsTabBar={false}>
        {/* Back, step dots, close. */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: spacing.xs,
            marginBottom: spacing.md,
          }}>
          {/*
            Steps back through the angles, and nothing else: on the first
            angle it is disabled rather than doubling as a second way out.
            Two controls that both close the screen is one too many.
          */}
          <CircleButton
            icon="chevronLeft"
            label="Previous angle"
            disabled={index === 0}
            onPress={() => setIndex(Math.max(0, index - 1))}
          />
          <StepDots count={ANGLES.length} active={index} />
          <CircleButton icon="close" label="Close" onPress={leave} />
        </View>

        <ScreenTitle
          eyebrow="Capture photos"
          title="Guided 5-Angle"
          titleMuted="Capture"
          subtitle={
            isBaseline
              ? 'Take 5 clear photos to track your progress from all important angles.'
              : `Last captured ${last ? formatRelative(last.capturedAt) : 'recently'}. Match those conditions as closely as you can.`
          }
        />

        {/* The five angles as one set around a front-facing portrait. */}
        <View
          accessibilityRole="radiogroup"
          style={{ width: W, height: H, alignSelf: 'center', marginTop: spacing.md }}>
          <Svg width={W} height={H} style={StyleSheet.absoluteFill} accessible={false}>
            <Circle cx={cx} cy={cy} r={R} stroke={colors.separator} strokeWidth={1.2} fill="none" />
            {[-28, 28, -95, 95].map((deg) => {
              const a = ((deg - 90) * Math.PI) / 180;
              return (
                <Circle
                  key={deg}
                  cx={cx + R * Math.cos(a)}
                  cy={cy + R * Math.sin(a)}
                  r={2.6}
                  fill={colors.textTertiary}
                />
              );
            })}
          </Svg>

          <View
            style={[
              {
                position: 'absolute',
                left: cx - centre / 2,
                top: cy - centre / 2,
                width: centre,
                height: centre,
                borderRadius: centre / 2,
                backgroundColor: colors.surface,
                padding: 3,
              },
              shadow.lifted,
            ]}>
            {/* A fixed front-facing portrait: the person the five angles
                are taken of. The selected angle shows in the step card. */}
            <Image
              source={CAPTURE_PORTRAIT}
              style={{ flex: 1, borderRadius: centre / 2 }}
              contentFit="cover"
              accessible={false}
            />
          </View>

          {ANGLES.map((a, i) => {
            const p = position(i);
            const selected = i === index;
            return (
              <View
                key={a}
                style={{
                  position: 'absolute',
                  left: p.x - SAT_RING / 2 - 24,
                  top: p.y - SAT_RING / 2,
                  width: SAT_RING + 48,
                  alignItems: 'center',
                }}>
                <PressableScale
                  onPress={() => setIndex(i)}
                  haptic="light"
                  scaleTo={0.94}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${i + 1}. ${ANGLE_LABELS[a]}`}>
                  {selected ? (
                    <View
                      style={{
                        position: 'absolute',
                        top: -7,
                        left: -7,
                        width: SAT_RING + 14,
                        height: SAT_RING + 14,
                        borderRadius: (SAT_RING + 14) / 2,
                        backgroundColor: colors.tabGlow,
                      }}
                    />
                  ) : null}
                  <View
                    style={[
                      {
                        width: SAT_RING,
                        height: SAT_RING,
                        borderRadius: SAT_RING / 2,
                        padding: 3,
                        backgroundColor: colors.surface,
                        borderWidth: selected ? 2 : StyleSheet.hairlineWidth,
                        borderColor: selected ? colors.accent : colors.border,
                      },
                      shadow.soft,
                    ]}>
                    <Image
                      source={ANGLE_EXAMPLES[a]}
                      style={{ flex: 1, borderRadius: SAT_RING / 2 }}
                      contentFit="cover"
                      accessible={false}
                    />
                  </View>
                </PressableScale>
                <View
                  pointerEvents="none"
                  style={[
                    {
                      marginTop: -9,
                      paddingHorizontal: spacing.md,
                      paddingVertical: 4,
                      borderRadius: radius.pill,
                      backgroundColor: colors.surface,
                    },
                    shadow.soft,
                  ]}>
                  <Text variant="caption" color={selected ? 'accent' : 'text'} numberOfLines={1}>
                    {i + 1}. {ANGLE_LABELS[a]}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>

        {/* The selected step. */}
        <View
          style={[
            {
              marginTop: spacing.md,
              padding: spacing.lg,
              borderRadius: radius.section,
              backgroundColor: colors.surface,
            },
            shadow.soft,
          ]}>
          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            <View style={{ flex: 1 }}>
              <View
                style={{
                  alignSelf: 'flex-start',
                  paddingHorizontal: spacing.md,
                  paddingVertical: 5,
                  borderRadius: radius.pill,
                  backgroundColor: colors.backgroundSubtle,
                }}>
                <Text variant="caption" color="textSecondary">
                  Step {index + 1} of {ANGLES.length}
                </Text>
              </View>
              <Text variant="title2" accessibilityRole="header" style={{ marginTop: spacing.md }}>
                {label} View
              </Text>
              <Text variant="callout" color="textSecondary" style={{ marginTop: spacing.xs }}>
                {ANGLE_GUIDANCE[angle].instruction}
              </Text>
              <PressableScale
                onPress={() => setShowExample(true)}
                haptic="light"
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`View example ${label} photo`}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  marginTop: spacing.md,
                  alignSelf: 'flex-start',
                }}>
                <Text variant="subhead" color="textSecondary">
                  View example
                </Text>
                <Icon name="chevronRight" size={12} color={colors.textSecondary} />
              </PressableScale>
            </View>

            {/* Fixed height so the tag anchors to the photo, not the column. */}
            <View style={{ width: 112, height: 122 }}>
              <Image
                source={ANGLE_EXAMPLES[angle]}
                style={{
                  width: 112,
                  height: 122,
                  borderRadius: radius.md,
                  backgroundColor: colors.fill,
                }}
                contentFit="cover"
                transition={180}
                accessibilityLabel={`Good example of a ${label.toLowerCase()} photo`}
              />
              <View
                pointerEvents="none"
                style={{ position: 'absolute', left: 0, right: 0, bottom: -10, alignItems: 'center' }}>
                <View
                  style={[
                    {
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 4,
                      paddingHorizontal: spacing.sm,
                      paddingVertical: 4,
                      borderRadius: radius.pill,
                      backgroundColor: colors.accentSoft,
                      borderWidth: 1,
                      borderColor: colors.accentBorder,
                    },
                    shadow.soft,
                  ]}>
                  <Icon name="check" size={12} color={colors.accent} />
                  <Text variant="caption" color="accent">
                    Good example
                  </Text>
                </View>
              </View>
            </View>
          </View>

          <Button
            label="Take Photo"
            icon="camera"
            style={{ marginTop: spacing.xl }}
            onPress={() =>
              router.replace({ pathname: '/capture-session', params: { start: angle } })
            }
          />
        </View>

        {/* Conditions, one tap away. */}
        <PressableScale
          onPress={() => setShowTips(true)}
          scaleTo={0.99}
          accessibilityRole="button"
          accessibilityLabel="Tips for best results"
          style={[
            {
              marginTop: spacing.md,
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.md,
              padding: spacing.md,
              paddingLeft: spacing.lg,
              borderRadius: radius.section,
              backgroundColor: colors.surface,
            },
            shadow.soft,
          ]}>
          <GlassOrb size={44} ring={false} tone="neutral">
            <BulbGlyph size={21} color={colors.text} />
          </GlassOrb>
          <View style={{ flex: 1 }}>
            <Text variant="headline">Tips for best results</Text>
            <Text variant="footnote" color="textSecondary" style={{ marginTop: 2 }}>
              Use good lighting, keep your hair dry, and follow the same angles each time.
            </Text>
          </View>
          <View
            style={[
              {
                width: 34,
                height: 34,
                borderRadius: 17,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.surface,
              },
              shadow.soft,
            ]}>
            <Icon name="chevronRight" size={12} color={colors.text} />
          </View>
        </PressableScale>

        <Text variant="caption" color="textTertiary" center style={{ marginTop: spacing.lg }}>
          Photos are saved to this device only. The photos above are examples.
        </Text>
      </ScreenScroll>

      {showTips ? (
        <MetricExplainer
          title="Tips for best results"
          body="A comparison is only as good as the consistency between sessions. Match these every time."
          points={[
            ...CONDITIONS,
            ...ANGLE_GUIDANCE[angle].tips.map((tip) => `${label}: ${tip}`),
            ...(last
              ? ['During capture you can overlay your previous photo to line the shot up']
              : []),
          ]}
          onClose={() => setShowTips(false)}
        />
      ) : null}

      <Modal
        visible={showExample}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setShowExample(false)}>
        <Pressable
          onPress={() => setShowExample(false)}
          accessibilityRole="button"
          accessibilityLabel="Close example"
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            padding: spacing.xl,
            backgroundColor: colors.photoScrim,
          }}>
          <Image
            source={ANGLE_EXAMPLES[angle]}
            style={{ width: '100%', aspectRatio: 0.84, borderRadius: radius.lg }}
            contentFit="cover"
            accessibilityLabel={`Example ${label} photo`}
          />
          <Text variant="subhead" color="textOnPhoto" center style={{ marginTop: spacing.md }}>
            Example of a clear {label.toLowerCase()} photo
          </Text>
        </Pressable>
      </Modal>
    </Screen>
  );
}

/* ------------------------------------------------------------------ */

function CircleButton({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const { colors, shadow } = useTheme();
  return (
    <PressableScale
      hitSlop={1}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      style={[
        {
          width: 42,
          height: 42,
          borderRadius: 21,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.surface,
        },
        shadow.soft,
      ]}>
      <Icon name={icon} size={15} color={colors.text} />
    </PressableScale>
  );
}

/** Five dots joined by hairlines; the current step is a soft green bead. */
function StepDots({ count, active }: { count: number; active: number }) {
  const { colors } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={`Angle ${active + 1} of ${count}`}
      style={{ flexDirection: 'row', alignItems: 'center' }}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center' }}>
          {i > 0 ? (
            <View style={{ width: 14, height: 1, backgroundColor: colors.separator }} />
          ) : null}
          <View
            style={
              i === active
                ? {
                    width: 16,
                    height: 16,
                    borderRadius: 8,
                    backgroundColor: colors.tabGlow,
                    borderWidth: 1.5,
                    borderColor: colors.accent,
                  }
                : {
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: colors.fillSelected,
                  }
            }
          />
        </View>
      ))}
    </View>
  );
}
