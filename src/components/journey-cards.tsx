/**
 * Journey dashboard cards, cloned from the Track Your Progress design.
 *
 * Every figure here is one the app genuinely observes — consistency,
 * routine adherence, sessions, days tracked, dated milestones, the user's
 * own notes. The design's hair "measurements" (density, thickness,
 * shedding) are deliberately not reproduced: nothing in the app measures
 * hair, and a number claiming to would be invented.
 */

import { Image } from 'expo-image';
import { useId, useState, type ReactNode } from 'react';
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
          padding: spacing.lg,
          borderRadius: radius.section,
          backgroundColor: colors.surface,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.glassBorder,
        },
        shadow.soft,
        style,
      ]}>
      {children}
    </View>
  );
}

function PanelHeader({
  title,
  action,
  onAction,
  compact,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
  /** Half-width cards: the action shrinks to its arrow so the title fits. */
  compact?: boolean;
}) {
  const { colors, spacing } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: spacing.md,
        gap: spacing.sm,
      }}>
      <Text variant="headline" numberOfLines={1} style={{ flexShrink: 1 }}>
        {title}
      </Text>
      {action && onAction ? (
        <PressableScale
          onPress={onAction}
          haptic="light"
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`${action}, ${title}`}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          {compact ? null : (
            <Text variant="footnote" color="textSecondary">
              {action}
            </Text>
          )}
          <Icon name="arrowRight" size={compact ? 14 : 12} color={colors.textSecondary} />
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
  style,
}: {
  value: number;
  delta: number | null;
  points: MonthPoint[];
  months: number;
  onCycleRange: () => void;
  onExplain: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, spacing, radius, shadow } = useTheme();
  const realMonths = points.filter((p) => p.value !== null).length;
  const isPreview = realMonths < MIN_REAL_MONTHS;

  return (
    <Panel style={style}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Text variant="headline">Consistency</Text>
          <PressableScale
            onPress={onExplain}
            haptic="none"
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="How consistency is calculated">
            <Icon name="info" size={16} color={colors.textSecondary} />
          </PressableScale>
        </View>

        <PressableScale
          onPress={onCycleRange}
          haptic="light"
          accessibilityRole="button"
          accessibilityLabel={`Showing last ${months} months`}
          accessibilityHint="Changes between 3, 6 and 12 months"
          style={[
            {
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingHorizontal: spacing.md,
              paddingVertical: 7,
              borderRadius: radius.pill,
              backgroundColor: colors.surface,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: colors.border,
            },
            shadow.soft,
          ]}>
          <Text variant="footnote">{`Last ${months} Months`}</Text>
          <Icon name="chevronDown" size={11} color={colors.text} />
        </PressableScale>
      </View>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          marginTop: spacing.sm,
        }}>
        <Text variant="display" style={{ fontSize: 48, lineHeight: 54 }}>
          {value}
        </Text>
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

      <Text variant="caption" color="textTertiary" style={{ marginTop: spacing.xs }}>
        Routine adherence by month
      </Text>

      <TrendChart points={points} preview={isPreview} />

      {isPreview ? (
        <Text variant="caption" color="textTertiary" center style={{ marginTop: spacing.xs }}>
          Preview. Your own line fills in as you track.
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
 * A small bar chart for one measurement series. The current period is
 * the solid bar and carries its value; earlier periods sit behind it in
 * a lighter tint. With no history yet it draws a seeded preview, faded
 * and labelled, so the card keeps its shape without claiming data.
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
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <Text variant="headline">{title}</Text>
        {!preview && typeof current === 'number' ? (
          <Text variant="headline" color="accent">
            {format(current)}
          </Text>
        ) : null}
      </View>
      <Text variant="caption" color="textTertiary" style={{ marginTop: 2 }}>
        {caption}
      </Text>

      <View
        onLayout={(e) => setWidth(Math.floor(e.nativeEvent.layout.width))}
        style={{ height: BAR_CHART_HEIGHT, marginTop: spacing.md }}
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

const GRID_GAP = 5;

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
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <Text variant="headline">Daily check-ins</Text>
        <Text variant="footnote" color={full ? 'accent' : 'textTertiary'}>
          {full} full {full === 1 ? 'day' : 'days'}
        </Text>
      </View>
      <Text variant="caption" color="textTertiary" style={{ marginTop: 2 }}>
        Last 4 weeks · darker means more of your stack done
      </Text>

      <View
        onLayout={(e) => setWidth(Math.floor(e.nativeEvent.layout.width))}
        accessible
        accessibilityLabel={`Daily check-ins: ${full} of the last ${days.length} days had the whole stack done`}
        style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP, marginTop: spacing.md }}>
        {cell > 0
          ? days.map((d) => (
              <View
                key={d.key}
                style={{
                  width: cell,
                  height: 24,
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

const THUMB_W = 52;
const THUMB_H = 78;

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
        action={isEmpty ? undefined : 'See All'}
        onAction={onSeeAll}
      />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 5 }}>
        {isEmpty ? (
          <>
            {/* Where the first photos go, then the months still to come. */}
            <PressableScale
              onPress={onCapture}
              accessibilityRole="button"
              accessibilityLabel="Capture your baseline photos"
              style={{
                width: THUMB_W,
                height: THUMB_H,
                borderRadius: radius.sm,
                borderWidth: 1.5,
                borderStyle: 'dashed',
                borderColor: colors.accent,
                backgroundColor: colors.accentSoft,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
              }}>
              <Icon name="plus" size={16} color={colors.accent} />
              <Text variant="caption" color="accent" style={{ fontSize: 9, lineHeight: 11 }}>
                Baseline
              </Text>
            </PressableScale>
            {[1, 2, 3, 4, 5, 6].map((m) => (
              <View
                key={m}
                accessible={false}
                style={{
                  width: THUMB_W,
                  height: THUMB_H,
                  borderRadius: radius.sm,
                  backgroundColor: colors.backgroundSubtle,
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                  opacity: 0.75,
                }}>
                <Icon name="camera" size={13} color={colors.textTertiary} />
                <Text variant="caption" color="textTertiary" style={{ fontSize: 9, lineHeight: 11 }}>
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
              style={{
                width: THUMB_W,
                height: THUMB_H,
                borderRadius: radius.sm,
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
              <View
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  bottom: 0,
                  paddingHorizontal: 5,
                  paddingVertical: 4,
                  backgroundColor: colors.photoScrim,
                }}>
                <Text
                  variant="caption"
                  color="textOnPhoto"
                  numberOfLines={1}
                  style={{ fontSize: 9, lineHeight: 11 }}>
                  {item.date}
                </Text>
                <Text
                  variant="caption"
                  color="textOnPhoto"
                  numberOfLines={1}
                  style={{ fontSize: 9, lineHeight: 11 }}>
                  {item.label}
                </Text>
              </View>
            </PressableScale>
          ))
        )}
      </ScrollView>

      {isEmpty ? (
        <Text variant="caption" color="textTertiary" style={{ marginTop: spacing.sm }}>
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
    <Panel style={[{ padding: spacing.md }, style]}>
      <PanelHeader title="Key Metrics" action="Details" onAction={onDetails} compact />
      {rows.map((row, i) => (
        <View
          key={row.label}
          accessible
          accessibilityLabel={`${row.label}, ${row.value}`}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
            paddingVertical: 7,
            borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth,
            borderTopColor: colors.separator,
          }}>
          <GlassOrb size={30} ring={false} tone="neutral">
            {row.glyph}
          </GlassOrb>
          <Text
            variant="footnote"
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
            style={{ flex: 1 }}>
            {row.label}
          </Text>
          <Text variant="footnote" style={{ fontWeight: '600' }}>
            {row.value}
          </Text>
          {row.trend ? (
            <Icon
              name={row.trend === 'up' ? 'arrowUpRight' : 'arrowDownRight'}
              size={11}
              color={row.trend === 'up' ? colors.accent : colors.textTertiary}
            />
          ) : null}
        </View>
      ))}
    </Panel>
  );
}

/* ----------------------------- milestones --------------------------- */

export type Milestone = { label: string; date: string; done: boolean };

export function MilestonesCard({
  items,
  style,
}: {
  items: Milestone[];
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, spacing } = useTheme();
  return (
    <Panel style={[{ padding: spacing.md }, style]}>
      <PanelHeader title="Milestones" />
      {items.map((m, i) => {
        const isLast = i === items.length - 1;
        return (
          <View
            key={m.label}
            accessible
            accessibilityLabel={`${m.label}, ${m.date}, ${m.done ? 'reached' : 'upcoming'}`}
            style={{ flexDirection: 'row', gap: spacing.sm }}>
            {/* Rail: a bead per milestone, joined by a hairline. */}
            <View style={{ width: 24, alignItems: 'center' }}>
              {m.done ? (
                <GlassOrb size={24} ring={false}>
                  <CheckGlyph size={12} />
                </GlassOrb>
              ) : (
                <View
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 12,
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
            <View style={{ flex: 1, paddingBottom: isLast ? 0 : spacing.sm }}>
              <Text variant="caption" color="textTertiary" numberOfLines={1}>
                {m.date}
              </Text>
              <Text
                variant="footnote"
                color={m.done ? 'textSecondary' : 'textTertiary'}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.85}>
                {m.label}
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
      <GlassOrb size={40} ring={false} tone="neutral">
        <Icon name="note" size={16} color={colors.text} />
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
      <PanelHeader title="Hair Journal" action={latest ? 'See All' : undefined} onAction={onSeeAll} />
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
            width: 32,
            height: 32,
            borderRadius: 16,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.backgroundSubtle,
          }}>
          <Icon name={latest ? 'chevronRight' : 'plus'} size={14} color={colors.text} />
        </View>
      </PressableScale>
    </Panel>
  );
}
