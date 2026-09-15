/**
 * Journey dashboard cards, cloned from the Track Your Progress design.
 *
 * Every figure here is one the app genuinely observes — consistency,
 * routine adherence, sessions, days tracked, dated milestones, the user's
 * own notes. The design's hair "measurements" (density, thickness,
 * shedding) are deliberately not reproduced: nothing here measures hair,
 * and a number claiming to would be invented.
 *
 * The cards themselves follow one rule: white paper on the warm ground,
 * lifted by a shadow and nothing else. No hairline around the edge, no
 * rule between rows, no chip that casts its own shadow inside a card.
 * Every line that used to be drawn here was a line the eye had to read
 * past to reach the number.
 */

import { Image } from 'expo-image';
import { useId, useState, type ReactNode } from 'react';
import Animated, { ZoomIn, useReducedMotion } from 'react-native-reanimated';
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  LinearGradient,
  Path,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';

import { GlassOrb } from './ui/glass-orb';
import { Icon } from './ui/icon';
import { PressableScale } from './ui/pressable-scale';
import { placeholderSeries } from './ui/ring';
import { CheckGlyph } from './ui/routine-glyphs';
import { Text } from './ui/text';
import type { DayCell, MonthPoint, SeriesPoint } from '@/store/selectors';
import { useTheme } from '@/theme';

/* ------------------------------ shared ------------------------------ */

/**
 * The surface every card on the Journey tab sits on.
 *
 * It matches the shared `Card` — same radius, same twenty points of
 * padding, same soft shadow — so a chart card and a list card on the
 * same screen read as the same kind of object. It stays a separate
 * component only because these cards never clip their children, and
 * the shared one pays for a second view to do so.
 */
export function Panel({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, spacing, radius, shadow } = useTheme();
  return (
    <View
      style={[
        {
          padding: spacing.xl,
          borderRadius: radius.card,
          backgroundColor: colors.surface,
        },
        shadow.soft,
        style,
      ]}>
      {children}
    </View>
  );
}

/**
 * A card's own heading and, when it has one, the way out of it.
 *
 * title3, the size Home gives "Today's Stack" and the section headers
 * use, so a heading inside a card and one above a card weigh the same.
 * The action is the accent word the section headers use too — the small
 * grey word with an arrow it replaced looked like a footnote, and an
 * affordance that looks like a footnote does not get tapped.
 */
function PanelHeader({
  title,
  action,
  onAction,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  const { spacing } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: spacing.lg,
        gap: spacing.md,
      }}>
      <Text variant="title3" numberOfLines={1} style={{ flexShrink: 1 }}>
        {title}
      </Text>
      {action && onAction ? (
        <PressableScale
          onPress={onAction}
          haptic="light"
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`${action}, ${title}`}
          style={{ flexShrink: 0 }}>
          <Text variant="subhead" color="accent">
            {action}
          </Text>
        </PressableScale>
      ) : null}
    </View>
  );
}

/* ----------------------------- score card --------------------------- */

/** Fewer real months than this and the chart shows a labelled preview. */
const MIN_REAL_MONTHS = 2;

export function ScoreCard({
  value,
  delta,
  points,
  months,
  onCycleRange,
  onExplain,
  started,
  style,
}: {
  value: number;
  delta: number | null;
  /** False until anything at all has been recorded. */
  started: boolean;
  points: MonthPoint[];
  months: number;
  onCycleRange: () => void;
  onExplain: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, spacing, radius } = useTheme();
  const realMonths = points.filter((p) => p.value !== null).length;
  const isPreview = realMonths < MIN_REAL_MONTHS;

  return (
    <Panel style={style}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: spacing.md,
        }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
            flexShrink: 1,
          }}>
          <Text variant="title3" numberOfLines={1} style={{ flexShrink: 1 }}>
            Consistency
          </Text>
          <PressableScale
            onPress={onExplain}
            haptic="none"
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="How consistency is calculated">
            <Icon name="info" size={15} color={colors.textSecondary} />
          </PressableScale>
        </View>

        {/*
          A filled chip, not a bordered one with its own shadow. A control
          that floats inside a card that is already floating is a card on
          a card, and the reference's chips all sit flat in the same fill.
        */}
        <PressableScale
          onPress={onCycleRange}
          haptic="light"
          accessibilityRole="button"
          accessibilityLabel={`Showing last ${months} months`}
          accessibilityHint="Changes between 3, 6 and 12 months"
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
            borderRadius: radius.pill,
            backgroundColor: colors.fill,
          }}>
          <Text variant="caption">{`Last ${months} months`}</Text>
          <Icon name="chevronDown" size={12} color={colors.textSecondary} />
        </PressableScale>
      </View>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.lg,
          marginTop: spacing.md,
        }}>
        {/*
          With nothing recorded there is no number to show, so the slot
          says what to do instead. A 48pt zero told somebody they had
          failed at a thing they had not started; a 48pt em dash read as a
          redaction. A sentence reads as an invitation.
        */}
        {started ? (
          <Text variant="display" style={{ fontSize: 52, lineHeight: 58 }}>
            {value}
          </Text>
        ) : (
          <Text variant="callout" color="textSecondary" style={{ flex: 1 }}>
            Tick something off, or take your first photos, and this starts
            filling in.
          </Text>
        )}
        {typeof delta === 'number' && delta !== 0 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Icon
              name={delta > 0 ? 'arrowUpRight' : 'arrowDownRight'}
              size={18}
              color={delta > 0 ? colors.accent : colors.textTertiary}
            />
            <View>
              <Text variant="headline" color={delta > 0 ? 'accent' : 'textTertiary'}>
                {delta > 0 ? '+' : ''}
                {delta} pts
              </Text>
              <Text variant="caption" color="textTertiary">
                vs last month
              </Text>
            </View>
          </View>
        ) : null}
      </View>

      {/*
        One caption, not two. The chart below already says "Preview. Your
        own line fills in as you track." when there is nothing in it, so a
        second line here saying the same thing was the third time this card
        told somebody they had not started.
      */}
      {started ? (
        <Text variant="caption" color="textTertiary" style={{ marginTop: spacing.xs }}>
          Routine adherence by month
        </Text>
      ) : null}

      <TrendChart points={points} preview={isPreview} />

      {/*
        The label stays whatever happens — a drawn line that is not yours
        must say so. But once the card has already invited somebody to
        start, the long version repeats it, so it shortens to the label.
      */}
      {isPreview ? (
        <Text variant="caption" color="textTertiary" center style={{ marginTop: spacing.xs }}>
          {started ? 'Preview. Your own line fills in as you track.' : 'Preview'}
        </Text>
      ) : null}
    </Panel>
  );
}

const CHART_HEIGHT = 158;
const AXIS_WIDTH = 26;
const CHART_TOP = 32;
const CHART_BOTTOM = 22;

function smoothPath(pts: { x: number; y: number }[]): string {
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    d += ` C ${p1.x + (p2.x - p0.x) / 6} ${p1.y + (p2.y - p0.y) / 6}, ${
      p2.x - (p3.x - p1.x) / 6
    } ${p2.y - (p3.y - p1.y) / 6}, ${p2.x} ${p2.y}`;
  }
  return d;
}

function TrendChart({ points, preview }: { points: MonthPoint[]; preview: boolean }) {
  const { colors } = useTheme();
  const uid = useId().replace(/[^A-Za-z0-9]/g, '');
  const [width, setWidth] = useState(0);

  const plotH = CHART_HEIGHT - CHART_TOP - CHART_BOTTOM;
  const n = points.length;
  const x = (i: number) =>
    AXIS_WIDTH + 10 + (n <= 1 ? 0 : (i * (width - AXIS_WIDTH - 24)) / (n - 1));
  const y = (v: number) => CHART_TOP + plotH - (v / 100) * plotH;

  // A preview draws a seeded shape, faded; real data draws the user's months.
  const values: (number | null)[] = preview
    ? placeholderSeries('journey-consistency', n).map((v) => 25 + v * 65)
    : points.map((p) => p.value);

  const drawn = values
    .map((v, i) => (v === null ? null : { x: x(i), y: y(v), v: Math.round(v) }))
    .filter((p): p is { x: number; y: number; v: number } => p !== null);

  const last = drawn[drawn.length - 1];
  const line = drawn.length > 1 ? smoothPath(drawn) : '';
  const area =
    drawn.length > 1
      ? `${line} L ${last.x} ${y(0)} L ${drawn[0].x} ${y(0)} Z`
      : '';

  return (
    <View
      onLayout={(e) => setWidth(Math.floor(e.nativeEvent.layout.width))}
      style={{ height: CHART_HEIGHT, marginTop: 4 }}
      accessible
      accessibilityLabel={
        preview
          ? 'Chart preview. Not enough monthly history yet.'
          : `Monthly routine adherence: ${points
              .filter((p) => p.value !== null)
              .map((p) => `${p.label} ${p.value} percent`)
              .join(', ')}`
      }>
      {width > 0 ? (
        <Svg width={width} height={CHART_HEIGHT}>
          <Defs>
            <LinearGradient id={`fill${uid}`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={colors.accent} stopOpacity={preview ? 0.07 : 0.22} />
              <Stop offset="1" stopColor={colors.accent} stopOpacity={0} />
            </LinearGradient>
          </Defs>

          {[0, 25, 50, 75, 100].map((g) => (
            <G key={g}>
              <Line
                x1={AXIS_WIDTH}
                x2={width}
                y1={y(g)}
                y2={y(g)}
                stroke={colors.separator}
                strokeWidth={1}
              />
              <SvgText
                x={AXIS_WIDTH - 6}
                y={y(g) + 3}
                fontSize={9}
                fill={colors.textTertiary}
                textAnchor="end">
                {g}
              </SvgText>
            </G>
          ))}

          {points.map((p, i) => (
            <SvgText
              key={p.key}
              x={x(i)}
              y={CHART_HEIGHT - 4}
              fontSize={10}
              fill={colors.textTertiary}
              textAnchor="middle">
              {p.label}
            </SvgText>
          ))}

          {area ? <Path d={area} fill={`url(#fill${uid})`} /> : null}
          {line ? (
            <Path
              d={line}
              stroke={colors.accent}
              strokeOpacity={preview ? 0.32 : 1}
              strokeWidth={2}
              strokeLinecap="round"
              fill="none"
            />
          ) : null}

          {!preview
            ? drawn.map((p, i) => {
                const isLast = i === drawn.length - 1;
                return (
                  <Circle
                    key={`${p.x}`}
                    cx={p.x}
                    cy={p.y}
                    r={isLast ? 5.5 : 3.4}
                    fill={colors.accent}
                    stroke={colors.surface}
                    strokeWidth={isLast ? 2.5 : 1.5}
                  />
                );
              })
            : null}

          {!preview && last ? (
            <G>
              <Rect
                x={Math.min(last.x - 17, width - 36)}
                y={last.y - 30}
                width={34}
                height={21}
                rx={7}
                fill={colors.accent}
              />
              <SvgText
                x={Math.min(last.x - 17, width - 36) + 17}
                y={last.y - 15.5}
                fontSize={11}
                fontWeight="600"
                fill={colors.textOnAccent}
                textAnchor="middle">
                {last.v}
              </SvgText>
            </G>
          ) : null}
        </Svg>
      ) : null}
    </View>
  );
}

/* ------------------------------ bar chart --------------------------- */

const BAR_CHART_HEIGHT = 132;
const BAR_LABEL_SPACE = 18;
const BAR_VALUE_SPACE = 22;

/**
 * A small bar chart for one series of counts. The current period is the
 * solid bar and carries its value; earlier periods sit behind it in a
 * lighter tint. With no history yet it draws a seeded preview, faded and
 * labelled, so the card keeps its shape without claiming data.
 */
export function BarChartCard({
  title,
  caption,
  points,
  max,
  format,
  preview,
  style,
}: {
  title: string;
  caption: string;
  points: SeriesPoint[];
  /** Top of the scale; defaults to the largest value. */
  max?: number;
  format: (value: number) => string;
  preview: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, spacing } = useTheme();
  const [width, setWidth] = useState(0);

  const n = points.length;
  const values: (number | null)[] = preview
    ? placeholderSeries(title, n).map((v) => v)
    : points.map((p) => p.value);
  const top = preview
    ? 1
    : Math.max(1, max ?? 0, ...values.map((v) => v ?? 0));

  const plotH = BAR_CHART_HEIGHT - BAR_LABEL_SPACE - BAR_VALUE_SPACE;
  const slot = n > 0 ? width / n : 0;
  const barW = Math.min(22, slot * 0.52);
  const lastIndex = n - 1;
  const current = points[lastIndex]?.value;

  return (
    <Panel style={style}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: spacing.md,
        }}>
        <Text variant="title3" numberOfLines={1} style={{ flexShrink: 1 }}>
          {title}
        </Text>
        {!preview && typeof current === 'number' ? (
          <Text variant="title3" color="accent">
            {format(current)}
          </Text>
        ) : null}
      </View>
      <Text variant="caption" color="textTertiary" style={{ marginTop: spacing.xxs }}>
        {caption}
      </Text>

      <View
        onLayout={(e) => setWidth(Math.floor(e.nativeEvent.layout.width))}
        style={{ height: BAR_CHART_HEIGHT, marginTop: spacing.lg }}
        accessible
        accessibilityLabel={
          preview
            ? `${title} chart preview. No history yet.`
            : `${title}: ${points
                .map((p) => `${p.label} ${p.value === null ? 'no data' : format(p.value)}`)
                .join(', ')}`
        }>
        {width > 0 ? (
          <Svg width={width} height={BAR_CHART_HEIGHT}>
            <Line
              x1={0}
              x2={width}
              y1={BAR_VALUE_SPACE + plotH}
              y2={BAR_VALUE_SPACE + plotH}
              stroke={colors.separator}
              strokeWidth={1}
            />
            {points.map((p, i) => {
              const v = values[i];
              const cx = slot * i + slot / 2;
              const isCurrent = i === lastIndex;
              const h = v === null ? 3 : Math.max(3, (v / top) * plotH);
              const y = BAR_VALUE_SPACE + plotH - h;
              const fill = preview
                ? colors.fillSelected
                : v === null
                  ? colors.fill
                  : colors.accent;
              const opacity = preview ? 0.7 : v === null ? 1 : isCurrent ? 1 : 0.38;
              return (
                <G key={p.key}>
                  <Rect
                    x={cx - barW / 2}
                    y={y}
                    width={barW}
                    height={h}
                    rx={Math.min(6, barW / 2)}
                    fill={fill}
                    fillOpacity={opacity}
                  />
                  {!preview && isCurrent && typeof v === 'number' ? (
                    <SvgText
                      x={cx}
                      y={y - 6}
                      fontSize={10}
                      fontWeight="600"
                      fill={colors.accent}
                      textAnchor="middle">
                      {format(v)}
                    </SvgText>
                  ) : null}
                  <SvgText
                    x={cx}
                    y={BAR_CHART_HEIGHT - 4}
                    fontSize={9}
                    fontWeight={isCurrent ? '600' : '400'}
                    fill={isCurrent && !preview ? colors.accent : colors.textTertiary}
                    textAnchor="middle">
                    {p.label}
                  </SvgText>
                </G>
              );
            })}
          </Svg>
        ) : null}
      </View>

      {preview ? (
        <Text variant="caption" color="textTertiary" center style={{ marginTop: spacing.xs }}>
          Preview. Fills in as you track.
        </Text>
      ) : null}
    </Panel>
  );
}

/* --------------------------- check-in grid -------------------------- */

const GRID_GAP = 6;

/**
 * The last four weeks, a square a day: darker as more of the stack was
 * done, faint before tracking began, today outlined.
 */
export function CheckInGrid({
  days,
  style,
}: {
  days: DayCell[];
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, spacing, radius } = useTheme();
  const [width, setWidth] = useState(0);
  const cell = width > 0 ? (width - GRID_GAP * 6) / 7 : 0;
  const tracked = days.filter((d) => d.value !== null);
  const full = tracked.filter((d) => d.value === 1).length;

  return (
    <Panel style={style}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: spacing.md,
        }}>
        <Text variant="title3" numberOfLines={1} style={{ flexShrink: 1 }}>
          Daily check-ins
        </Text>
        <Text variant="subhead" color={full ? 'accent' : 'textTertiary'}>
          {full} full {full === 1 ? 'day' : 'days'}
        </Text>
      </View>
      <Text variant="caption" color="textTertiary" style={{ marginTop: spacing.xxs }}>
        Last 4 weeks · darker means more of your stack done
      </Text>

      <View
        onLayout={(e) => setWidth(Math.floor(e.nativeEvent.layout.width))}
        accessible
        accessibilityLabel={`Daily check-ins: ${full} of the last ${days.length} days had the whole stack done`}
        style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP, marginTop: spacing.lg }}>
        {cell > 0
          ? days.map((d) => (
              <View
                key={d.key}
                style={{
                  width: cell,
                  height: 26,
                  borderRadius: radius.xs,
                  backgroundColor:
                    d.value === null || d.value === 0 ? colors.fill : colors.accent,
                  opacity:
                    d.value === null ? 0.5 : d.value === 0 ? 1 : 0.28 + 0.72 * d.value,
                  borderWidth: d.isToday ? 1.5 : 0,
                  borderColor: colors.accent,
                }}
              />
            ))
          : null}
      </View>
    </Panel>
  );
}

/* ---------------------------- photo strip --------------------------- */

/** One session in the strip. Always the thumbnail: this is a list. */
export type StripItem = { id: string; thumbnailUri?: string; date: string; label: string };

/*
  Seventy-two by ninety-six, up from fifty-two by seventy-eight. The
  photographs are the product, and at the old size they were postage
  stamps with two lines of ten-point type stamped over them. The
  labels now sit beneath the picture, in the app's own caption size,
  where they can be read without covering what they describe.
*/
const THUMB_W = 72;
const THUMB_H = 96;
const STRIP_GAP = 10;

export function PhotoStrip({
  items,
  onOpen,
  onCapture,
  onSeeAll,
  style,
}: {
  items: StripItem[];
  onOpen: (id: string) => void;
  onCapture: () => void;
  onSeeAll: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, spacing, radius } = useTheme();
  const isEmpty = items.length === 0;

  return (
    <Panel style={style}>
      <PanelHeader
        title="Progress Photos"
        action={isEmpty ? undefined : 'See all'}
        onAction={onSeeAll}
      />

      {/*
        The strip bleeds to the card's edges and pads itself back in, so
        a row that is longer than the card scrolls out from under its
        edge rather than stopping short at the padding.
      */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginHorizontal: -spacing.xl }}
        contentContainerStyle={{ gap: STRIP_GAP, paddingHorizontal: spacing.xl }}>
        {isEmpty ? (
          <>
            {/*
              Where the first photos go, then the months still to come.
              The baseline slot is a solid tint rather than a dashed
              outline: dashed borders are how a form says "drop a file
              here", and this is an invitation, not a field.
            */}
            <PressableScale
              onPress={onCapture}
              accessibilityRole="button"
              accessibilityLabel="Capture your baseline photos"
              style={{ width: THUMB_W, alignItems: 'center', gap: spacing.sm }}>
              <View
                style={{
                  width: THUMB_W,
                  height: THUMB_H,
                  borderRadius: radius.md,
                  backgroundColor: colors.accentSoft,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                <Icon name="plus" size={18} color={colors.accent} />
              </View>
              <Text variant="caption" color="accent" numberOfLines={1}>
                Baseline
              </Text>
            </PressableScale>
            {[1, 2, 3, 4, 5, 6].map((m) => (
              <View
                key={m}
                accessible={false}
                style={{ width: THUMB_W, alignItems: 'center', gap: spacing.sm }}>
                <View
                  style={{
                    width: THUMB_W,
                    height: THUMB_H,
                    borderRadius: radius.md,
                    backgroundColor: colors.fill,
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: 0.6,
                  }}>
                  <Icon name="camera" size={15} color={colors.textTertiary} />
                </View>
                <Text variant="caption" color="textTertiary" numberOfLines={1}>
                  Month {m}
                </Text>
              </View>
            ))}
          </>
        ) : (
          items.map((item) => (
            <PressableScale
              key={item.id}
              onPress={() => onOpen(item.id)}
              scaleTo={0.96}
              accessibilityRole="button"
              accessibilityLabel={`${item.label}, ${item.date}`}
              style={{ width: THUMB_W, alignItems: 'center', gap: spacing.sm }}>
              <View
                style={{
                  width: THUMB_W,
                  height: THUMB_H,
                  borderRadius: radius.md,
                  overflow: 'hidden',
                  backgroundColor: colors.fill,
                }}>
                {item.thumbnailUri ? (
                  <Image
                    source={{ uri: item.thumbnailUri }}
                    style={StyleSheet.absoluteFill}
                    contentFit="cover"
                    recyclingKey={item.id}
                    accessible={false}
                  />
                ) : null}
              </View>
              <View style={{ alignItems: 'center' }}>
                <Text variant="caption" numberOfLines={1}>
                  {item.label}
                </Text>
                <Text variant="caption" color="textTertiary" numberOfLines={1}>
                  {item.date}
                </Text>
              </View>
            </PressableScale>
          ))
        )}
      </ScrollView>

      {isEmpty ? (
        <Text variant="caption" color="textTertiary" style={{ marginTop: spacing.md }}>
          Your photo updates line up here, month by month.
        </Text>
      ) : null}
    </Panel>
  );
}

/* ---------------------------- key metrics --------------------------- */

export type MetricRow = {
  glyph: ReactNode;
  label: string;
  value: string;
  trend?: 'up' | 'down';
};

/**
 * Four figures in one card, two by two.
 *
 * It was a half-width card of four hairlined rows in thirteen-point
 * type, sharing the width with the milestones — two dense columns
 * squeezed into a space meant for one. Set full width, two figures to a
 * row, with the number in the display face, each figure has room to be
 * read as a figure rather than as a line in a table.
 */
export function KeyMetricsCard({
  rows,
  onDetails,
  style,
}: {
  rows: MetricRow[];
  onDetails: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, spacing } = useTheme();
  return (
    <Panel style={style}>
      <PanelHeader title="Key Metrics" action="Details" onAction={onDetails} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.xl }}>
        {rows.map((row) => (
          <View
            key={row.label}
            accessible
            accessibilityLabel={`${row.label}, ${row.value}`}
            style={{
              width: '50%',
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.md,
              paddingRight: spacing.sm,
            }}>
            <GlassOrb size={38} ring={false} tone="neutral">
              {row.glyph}
            </GlassOrb>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                <Text variant="metric" numberOfLines={1} style={{ flexShrink: 1 }}>
                  {row.value}
                </Text>
                {row.trend ? (
                  <Icon
                    name={row.trend === 'up' ? 'arrowUpRight' : 'arrowDownRight'}
                    size={13}
                    color={row.trend === 'up' ? colors.accent : colors.textTertiary}
                  />
                ) : null}
              </View>
              <Text variant="caption" color="textSecondary" numberOfLines={1}>
                {row.label}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </Panel>
  );
}

/* ----------------------------- milestones --------------------------- */

export type Milestone = { label: string; date: string; done: boolean };

/**
 * The dated points the app can vouch for, on a rail.
 *
 * Full width now, with the labels at reading size. Sharing a row with
 * the metrics meant every label had to shrink to fit, and a milestone
 * that has to be squinted at is not much of a milestone.
 */
export function MilestonesCard({
  items,
  style,
}: {
  items: Milestone[];
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, spacing } = useTheme();
  const reduceMotion = useReducedMotion();

  return (
    <Panel style={style}>
      <PanelHeader title="Milestones" />
      {items.map((m, i) => {
        const isLast = i === items.length - 1;
        return (
          <View
            key={m.label}
            accessible
            accessibilityLabel={`${m.label}, ${m.date}, ${m.done ? 'reached' : 'upcoming'}`}
            style={{ flexDirection: 'row', gap: spacing.md }}>
            {/* Rail: a bead per milestone, joined by a hairline. */}
            <View style={{ width: 26, alignItems: 'center' }}>
              {m.done ? (
                // Reached milestones land one after another as the card
                // appears, so a run of them reads as an accumulation.
                <Animated.View
                  entering={
                    reduceMotion
                      ? undefined
                      : ZoomIn.springify().damping(13).stiffness(360).delay(i * 90)
                  }>
                  <GlassOrb size={26} ring={false}>
                    <CheckGlyph size={12} />
                  </GlassOrb>
                </Animated.View>
              ) : (
                <View
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 13,
                    borderWidth: 1.5,
                    borderColor: colors.fillSelected,
                    backgroundColor: colors.surface,
                  }}
                />
              )}
              {!isLast ? (
                <View style={{ flex: 1, width: 1.5, backgroundColor: colors.separator }} />
              ) : null}
            </View>
            <View style={{ flex: 1, paddingBottom: isLast ? 0 : spacing.lg }}>
              <Text
                variant="callout"
                color={m.done ? 'text' : 'textSecondary'}
                numberOfLines={1}
                style={{ fontWeight: '500' }}>
                {m.label}
              </Text>
              <Text variant="caption" color="textTertiary" numberOfLines={1} style={{ marginTop: 1 }}>
                {m.date}
              </Text>
            </View>
          </View>
        );
      })}
    </Panel>
  );
}

/* ------------------------------- journal ---------------------------- */

export function NoteRow({ body, date }: { body: string; date: string }) {
  const { colors, spacing } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
      <GlassOrb size={42} ring={false} tone="neutral">
        <Icon name="note" size={15} color={colors.text} />
      </GlassOrb>
      <View style={{ flex: 1 }}>
        <Text variant="callout" numberOfLines={2}>
          {body}
        </Text>
        <Text variant="caption" color="textTertiary" style={{ marginTop: 2 }}>
          {date}
        </Text>
      </View>
    </View>
  );
}

export function NotesCard({
  latest,
  onOpen,
  onSeeAll,
  style,
}: {
  latest?: { body: string; date: string };
  onOpen: () => void;
  onSeeAll: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, spacing } = useTheme();
  return (
    <Panel style={style}>
      <PanelHeader title="Hair Journal" action={latest ? 'See all' : undefined} onAction={onSeeAll} />
      <PressableScale
        onPress={onOpen}
        scaleTo={0.99}
        accessibilityRole="button"
        accessibilityLabel={
          latest
            ? `Latest journal entry: ${latest.body}. Opens your journal.`
            : 'Write your first journal entry'
        }
        style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <View style={{ flex: 1 }}>
          {latest ? (
            <NoteRow body={latest.body} date={latest.date} />
          ) : (
            <NoteRow
              body="Write what changed, how you felt, anything worth remembering."
              date="No entries yet"
            />
          )}
        </View>
        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: 17,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.fill,
          }}>
          <Icon name={latest ? 'chevronRight' : 'plus'} size={15} color={colors.text} />
        </View>
      </PressableScale>
    </Panel>
  );
}
