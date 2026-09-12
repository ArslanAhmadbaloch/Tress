import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  clamp,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';

import { GlassSurface } from '@/components/ui/glass-surface';
import { EmptyState } from '@/components/ui/layout';
import { Icon } from '@/components/ui/icon';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Text } from '@/components/ui/text';
import { formatMilestone } from '@/lib/date';
import { useAppStore } from '@/store/app-store';
import { sessionsChronological } from '@/store/selectors';
import { concentricRadius, useTheme } from '@/theme';
import { ANGLES, ANGLE_LABELS, type Angle } from '@/types/domain';

type Mode = 'slider' | 'sideBySide';

/** Inset of the selected segment inside its glass container. */
const SEGMENT_PAD = 3;

export default function CompareScreen() {
  const { from } = useLocalSearchParams<{ from?: string }>();
  const { colors, spacing, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data } = useAppStore();

  const sessions = useMemo(() => sessionsChronological(data), [data]);
  const journey = data.journey;

  const [angle, setAngle] = useState<Angle>('front');
  const [mode, setMode] = useState<Mode>('slider');

  // Default to baseline vs latest, which is the comparison people want.
  const [beforeIndex, setBeforeIndex] = useState(0);
  const [afterIndex, setAfterIndex] = useState(() => {
    if (!from) return Math.max(0, sessions.length - 1);
    const i = sessions.findIndex((s) => s.id === from);
    return i >= 0 ? i : Math.max(0, sessions.length - 1);
  });

  if (!journey || sessions.length < 2) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.background,
          paddingTop: insets.top,
        }}>
        <Header onClose={() => router.back()} title="Compare" />
        <EmptyState
          icon="compare"
          title="Two updates needed"
          body="Capture at least two photo sessions and you'll be able to compare any two points in your journey."
        />
      </View>
    );
  }

  const before = sessions[Math.min(beforeIndex, sessions.length - 1)];
  const after = sessions[Math.min(afterIndex, sessions.length - 1)];

  const beforePhoto = before.photos.find((p) => p.angle === angle);
  const afterPhoto = after.photos.find((p) => p.angle === angle);

  const availableAngles = ANGLES.filter(
    (a) =>
      before.photos.some((p) => p.angle === a) &&
      after.photos.some((p) => p.angle === a),
  );

  return (
    <View
      style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
      <Header onClose={() => router.back()} title="Compare" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}>
        {/* Angle picker */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: spacing.lg,
            gap: spacing.sm,
            paddingVertical: spacing.sm,
          }}>
          {ANGLES.map((a) => {
            const active = angle === a;
            const available = availableAngles.includes(a);
            return (
              <PressableScale
                key={a}
                onPress={() => setAngle(a)}
                disabled={!available}
                accessibilityRole="button"
                accessibilityState={{ selected: active, disabled: !available }}
                accessibilityLabel={`Compare ${ANGLE_LABELS[a]}`}
                style={{
                  paddingHorizontal: spacing.lg,
                  paddingVertical: spacing.sm,
                  borderRadius: radius.pill,
                  backgroundColor: active ? colors.accent : colors.fill,
                }}>
                <Text
                  variant="subhead"
                  color={active ? 'textOnAccent' : 'textSecondary'}>
                  {ANGLE_LABELS[a]}
                </Text>
              </PressableScale>
            );
          })}
        </ScrollView>

        {/*
          A segmented control is exactly the kind of element that belongs in
          the glass layer: it is chrome that sits above the photographs it
          controls. The selected segment is inset by `pad`, so its radius is
          concentric with the container rather than an arbitrary pill.
        */}
        <GlassSurface
          variant="regular"
          borderRadius={radius.pill}
          interactive
          style={{
            flexDirection: 'row',
            marginHorizontal: spacing.lg,
            marginTop: spacing.sm,
            padding: SEGMENT_PAD,
          }}>
          {(['slider', 'sideBySide'] as Mode[]).map((m) => {
            const active = mode === m;
            return (
              <PressableScale
                key={m}
                onPress={() => setMode(m)}
                haptic="light"
                scaleTo={0.99}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={
                  m === 'slider' ? 'Slider comparison' : 'Side by side comparison'
                }
                style={{
                  flex: 1,
                  paddingVertical: spacing.sm,
                  borderRadius: concentricRadius(radius.pill, SEGMENT_PAD),
                  alignItems: 'center',
                  backgroundColor: active ? colors.surface : 'transparent',
                }}>
                <Text variant="subhead" color={active ? 'text' : 'textSecondary'}>
                  {m === 'slider' ? 'Slider' : 'Side by side'}
                </Text>
              </PressableScale>
            );
          })}
        </GlassSurface>

        {/* Comparison */}
        <View style={{ marginTop: spacing.lg, paddingHorizontal: spacing.lg }}>
          {!beforePhoto || !afterPhoto ? (
            <View
              style={{
                aspectRatio: 0.82,
                borderRadius: radius.card,
                backgroundColor: colors.backgroundSubtle,
                alignItems: 'center',
                justifyContent: 'center',
                gap: spacing.md,
                padding: spacing.xl,
              }}>
              <Icon name="photo" size={28} color={colors.textTertiary} />
              <Text variant="callout" color="textSecondary" center>
                One of these updates doesn&apos;t include a{' '}
                {ANGLE_LABELS[angle].toLowerCase()} photo.
              </Text>
            </View>
          ) : mode === 'slider' ? (
            <SliderCompare
              beforeUri={beforePhoto.uri}
              afterUri={afterPhoto.uri}
              beforeLabel={formatMilestone(journey.startedAt, before.capturedAt)}
              afterLabel={formatMilestone(journey.startedAt, after.capturedAt)}
            />
          ) : (
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <SidePanel
                uri={beforePhoto.uri}
                label={formatMilestone(journey.startedAt, before.capturedAt)}
              />
              <SidePanel
                uri={afterPhoto.uri}
                label={formatMilestone(journey.startedAt, after.capturedAt)}
                highlighted
              />
            </View>
          )}
        </View>

        {/* Session pickers */}
        <SessionPicker
          title="Before"
          sessions={sessions}
          startedAt={journey.startedAt}
          selectedIndex={beforeIndex}
          onSelect={setBeforeIndex}
        />
        <SessionPicker
          title="After"
          sessions={sessions}
          startedAt={journey.startedAt}
          selectedIndex={afterIndex}
          onSelect={setAfterIndex}
        />
      </ScrollView>
    </View>
  );
}

/* ------------------------------------------------------------------ */

function Header({ title, onClose }: { title: string; onClose: () => void }) {
  const { colors, spacing } = useTheme();

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
      }}>
      <Text variant="title3" accessibilityRole="header">
        {title}
      </Text>
      <PressableScale
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close"
        style={{
          width: 34,
          height: 34,
          borderRadius: 17,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.fill,
        }}>
        <Icon name="close" size={15} color={colors.text} />
      </PressableScale>
    </View>
  );
}

/**
 * Drag-to-reveal comparison.
 *
 * The "after" image is clipped by an animated-width container, so the
 * two frames stay pixel-aligned as the handle moves. Everything runs on
 * the UI thread — a JS-driven handle feels rubbery at this size.
 */
function SliderCompare({
  beforeUri,
  afterUri,
  beforeLabel,
  afterLabel,
}: {
  beforeUri: string;
  afterUri: string;
  beforeLabel: string;
  afterLabel: string;
}) {
  const { colors, spacing, radius } = useTheme();
  const { width: screenWidth } = useWindowDimensions();

  const width = screenWidth - spacing.lg * 2;
  const height = width / 0.82;

  const offset = useSharedValue(width / 2);
  const start = useSharedValue(width / 2);

  const pan = Gesture.Pan()
    .onBegin(() => {
      start.set(offset.get());
    })
    .onUpdate((event) => {
      offset.set(clamp(start.get() + event.translationX, 0, width));
    });

  // Tapping anywhere on the image jumps the handle there.
  const tap = Gesture.Tap().onEnd((event) => {
    offset.set(clamp(event.x, 0, width));
  });

  const composed = Gesture.Race(pan, tap);

  const clipStyle = useAnimatedStyle(() => ({ width: offset.get() }));
  const handleStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.get() - 16 }],
  }));

  return (
    <View>
      <GestureDetector gesture={composed}>
        <View
          accessible
          accessibilityLabel={`Comparison slider between ${beforeLabel} and ${afterLabel}. Drag to reveal.`}
          style={{
            width,
            height,
            borderRadius: radius.card,
            overflow: 'hidden',
            backgroundColor: colors.fill,
          }}>
          <Image
            source={{ uri: beforeUri }}
            style={{ width, height }}
            contentFit="cover"
          />

          <Animated.View
            style={[
              { position: 'absolute', top: 0, left: 0, height, overflow: 'hidden' },
              clipStyle,
            ]}>
            <Image
              source={{ uri: afterUri }}
              style={{ width, height }}
              contentFit="cover"
            />
          </Animated.View>

          {/* Handle */}
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: 'absolute',
                top: 0,
                bottom: 0,
                width: 32,
                alignItems: 'center',
              },
              handleStyle,
            ]}>
            <View style={{ flex: 1, width: 2, backgroundColor: '#fff' }} />
            <View
              style={{
                position: 'absolute',
                top: height / 2 - 16,
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: '#fff',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                gap: 1,
              }}>
              <Icon name="chevronLeft" size={12} color="#111" />
              <Icon name="chevronRight" size={12} color="#111" />
            </View>
          </Animated.View>

          {/* Corner labels */}
          <Label text={afterLabel} position="left" />
          <Label text={beforeLabel} position="right" />
        </View>
      </GestureDetector>

      <Text
        variant="caption"
        color="textTertiary"
        center
        style={{ marginTop: spacing.md }}>
        Drag or tap to reveal
      </Text>
    </View>
  );
}

function Label({ text, position }: { text: string; position: 'left' | 'right' }) {
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 12,
        [position]: 12,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 8,
        backgroundColor: 'rgba(0,0,0,0.55)',
      }}>
      <Text variant="caption" style={{ color: '#fff' }}>
        {text}
      </Text>
    </View>
  );
}

function SidePanel({
  uri,
  label,
  highlighted,
}: {
  uri: string;
  label: string;
  highlighted?: boolean;
}) {
  const { colors, radius, spacing } = useTheme();

  return (
    <View style={{ flex: 1 }}>
      <Image
        source={{ uri }}
        style={{
          width: '100%',
          aspectRatio: 0.82,
          borderRadius: radius.md,
          backgroundColor: colors.fill,
        }}
        contentFit="cover"
        accessibilityLabel={`${label} photo`}
      />
      <Text
        variant="subhead"
        color={highlighted ? 'accent' : 'textSecondary'}
        center
        style={{ marginTop: spacing.sm }}>
        {label}
      </Text>
    </View>
  );
}

function SessionPicker({
  title,
  sessions,
  startedAt,
  selectedIndex,
  onSelect,
}: {
  title: string;
  sessions: { id: string; capturedAt: string; photos: { id: string; thumbnailUri?: string; uri: string }[] }[];
  startedAt: string;
  selectedIndex: number;
  onSelect: (index: number) => void;
}) {
  const { colors, spacing, radius } = useTheme();

  return (
    <View style={{ marginTop: spacing.xl }}>
      <Text
        variant="overline"
        color="textTertiary"
        style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.sm }}>
        {title}
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}>
        {sessions.map((session, index) => {
          const active = index === selectedIndex;
          const thumb = session.photos[0];
          return (
            <PressableScale
              key={session.id}
              onPress={() => onSelect(index)}
              scaleTo={0.96}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${title.toLowerCase()}: ${formatMilestone(startedAt, session.capturedAt)}`}
              style={{ alignItems: 'center', width: 62 }}>
              <View
                style={{
                  width: 56,
                  height: 68,
                  borderRadius: radius.sm,
                  overflow: 'hidden',
                  borderWidth: 2,
                  borderColor: active ? colors.accent : 'transparent',
                  backgroundColor: colors.fill,
                }}>
                {thumb ? (
                  <Image
                    source={{ uri: thumb.thumbnailUri ?? thumb.uri }}
                    style={{ width: '100%', height: '100%' }}
                    contentFit="cover"
                  />
                ) : null}
              </View>
              <Text
                variant="caption"
                color={active ? 'accent' : 'textTertiary'}
                center
                numberOfLines={1}
                style={{ marginTop: 4 }}>
                {formatMilestone(startedAt, session.capturedAt)}
              </Text>
            </PressableScale>
          );
        })}
      </ScrollView>
    </View>
  );
}
