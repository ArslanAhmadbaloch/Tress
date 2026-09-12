/**
 * The membership card.
 *
 * The one thing in the app that is made to leave it: a keepsake a person
 * gets for setting up their journey, and can save or send. It is drawn
 * glass rather than the live material — it has to survive being captured
 * to a PNG, where a backdrop blur has nothing behind it to sample.
 *
 * Every figure on it is one the app genuinely holds: the name and goal
 * they chose, the date they set as their start, weeks elapsed, and their
 * consistency. The reference design's "68% toward healthier, fuller hair"
 * is not reproduced — nothing here measures hair, so a number pointing at
 * that outcome would be invented, and this is the card they might show
 * someone. The ring is consistency, and the line beneath says so.
 *
 * Laid out from a single `width` so the card is identical everywhere it
 * appears: small on the profile, large in the float view, and the same
 * again in the exported image.
 */

import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useId, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  LinearGradient as SvgLinearGradient,
  Path,
  Stop,
} from 'react-native-svg';

import { Icon } from './ui/icon';
import { Text } from './ui/text';
import { daysBetween } from '@/lib/date';
import { fontFamily, splitAlpha, useTheme } from '@/theme';

const MARK = require('@/assets/images/app-mark.jpg');

/** The width every measurement below is expressed against. */
const BASE = 340;

/**
 * A word for the consistency figure.
 *
 * It describes showing up, not hair: "Steady" means the routine is being
 * ticked off and the photos are being taken, and nothing more. The card is
 * the most likely thing here to be shown to someone else, so it is the last
 * place that should imply a result.
 */
function consistencyStage(value: number): string {
  if (value >= 80) return 'Going strong';
  if (value >= 50) return 'Staying steady';
  if (value >= 20) return 'Building the habit';
  return 'Just getting started';
}

export type MemberCardProps = {
  name: string;
  /** The goal they chose at onboarding, shown under the name. */
  goalLabel?: string;
  /** Their chosen picture, from photos they captured here. */
  portraitUri?: string;
  startedAt: string;
  /** 0-100. The same figure the Journey tab explains in full. */
  consistency: number;
  /** Rendered width. Everything scales from it. */
  width: number;
};

export function MemberCard({
  name,
  goalLabel,
  portraitUri,
  startedAt,
  consistency,
  width,
}: MemberCardProps) {
  const { colors, shadow } = useTheme();

  /** Scale factor from the base design. */
  const s = width / BASE;
  const u = (value: number) => value * s;

  const days = Math.max(0, daysBetween(startedAt));
  const weeks = Math.floor(days / 7);
  const elapsed =
    weeks >= 1
      ? { value: String(weeks), label: weeks === 1 ? 'Week' : 'Weeks' }
      : { value: String(days + 1), label: days === 0 ? 'Day' : 'Days' };

  const started = new Date(startedAt);
  const startedLabel = started.toLocaleDateString(undefined, {
    month: 'short',
    year: 'numeric',
  });
  const estYear = started.getFullYear();

  return (
    <View
      style={[
        {
          width,
          borderRadius: u(34),
          borderWidth: 1,
          borderColor: colors.cardEdge,
          overflow: 'hidden',
        },
        shadow.lifted,
      ]}>
      <LinearGradient
        pointerEvents="none"
        colors={[colors.cardTop, colors.cardBottom]}
        style={StyleSheet.absoluteFill}
      />

      <View style={{ padding: u(20), gap: u(14) }}>
        {/* ------------------------------ header ----------------------------- */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: u(9) }}>
            <Image
              source={MARK}
              style={{ width: u(26), height: u(26), borderRadius: u(9) }}
              contentFit="cover"
              transition={0}
              accessible={false}
            />
            <Text
              numberOfLines={1}
              style={{
                fontFamily: fontFamily.serif,
                fontSize: u(17),
                color: colors.text,
                letterSpacing: u(0.2),
              }}>
              Hair Journey
            </Text>
          </View>

          <View
            style={{
              paddingHorizontal: u(12),
              paddingVertical: u(5),
              borderRadius: u(999),
              backgroundColor: colors.cardPanel,
              borderWidth: 1,
              borderColor: colors.cardPanelEdge,
            }}>
            <Text
              style={{
                fontSize: u(9.5),
                lineHeight: u(13),
                fontWeight: '600',
                letterSpacing: u(1.6),
                color: colors.textSecondary,
              }}>
              EST {estYear}
            </Text>
          </View>
        </View>

        {/* ------------------------------- identity -------------------------- */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: u(12) }}>
          <View style={{ flex: 1, paddingTop: u(18) }}>
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.55}
              style={{
                fontFamily: fontFamily.serif,
                fontSize: u(34),
                lineHeight: u(40),
                color: colors.text,
              }}>
              {name}
            </Text>

            {goalLabel ? (
              <Text
                numberOfLines={2}
                style={{
                  fontSize: u(12.5),
                  lineHeight: u(17),
                  color: colors.textSecondary,
                  marginTop: u(3),
                }}>
                {goalLabel}
              </Text>
            ) : null}

            <View
              style={{
                width: u(34),
                height: 1,
                backgroundColor: colors.textTertiary,
                opacity: 0.5,
                marginTop: u(16),
                marginBottom: u(12),
              }}
            />

            <Text
              style={{
                fontFamily: fontFamily.serif,
                fontStyle: 'italic',
                fontSize: u(14),
                lineHeight: u(20),
                color: colors.textSecondary,
              }}>
              “Better Hair.{'\n'}A Confident You.”
            </Text>
          </View>

          <Portrait uri={portraitUri} name={name} u={u} />
        </View>

        {/* -------------------------------- figures -------------------------- */}
        <Panel u={u}>
          <View style={{ flexDirection: 'row', paddingVertical: u(12) }}>
            <Figure u={u} icon="chart" value={elapsed.value} label={elapsed.label} />
            <Rule u={u} />
            <Figure u={u} icon="leaf" value="Active" label="Journey" />
            <Rule u={u} />
            <Figure u={u} icon="calendar" value={startedLabel} label="Started" />
          </View>
        </Panel>

        {/* --------------------------- consistency --------------------------- */}
        <Panel u={u}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: u(16),
              padding: u(14),
            }}>
            <Ring value={consistency} u={u} />

            <View style={{ flex: 1, gap: u(4) }}>
              <Text
                style={{
                  fontSize: u(11),
                  lineHeight: u(15),
                  fontWeight: '500',
                  color: colors.textSecondary,
                }}>
                Consistency
              </Text>
              <Text
                numberOfLines={1}
                style={{
                  fontFamily: fontFamily.serif,
                  fontSize: u(19),
                  lineHeight: u(24),
                  color: colors.text,
                }}>
                {consistencyStage(consistency)}
              </Text>

              <View
                style={{
                  height: u(7),
                  borderRadius: u(999),
                  backgroundColor: colors.fill,
                  overflow: 'hidden',
                  marginTop: u(4),
                }}>
                <View
                  style={{
                    width: `${Math.max(0, Math.min(100, consistency))}%`,
                    height: '100%',
                    borderRadius: u(999),
                    backgroundColor: colors.accent,
                  }}
                />
              </View>

              <Text
                style={{
                  fontSize: u(10.5),
                  lineHeight: u(14),
                  color: colors.textTertiary,
                  marginTop: u(2),
                }}>
                Routine ticked off, photos taken
              </Text>
            </View>
          </View>
        </Panel>

        {/* ---------------------------- brand line --------------------------- */}
        <Panel u={u}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: u(12),
              padding: u(12),
            }}>
            <View
              style={{
                width: u(34),
                height: u(34),
                borderRadius: u(17),
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.cardPanel,
                borderWidth: 1,
                borderColor: colors.cardPanelEdge,
              }}>
              <Icon name="arrowUpRight" size={u(15)} color={colors.textSecondary} />
            </View>

            <Text
              style={{
                flex: 1,
                fontFamily: fontFamily.serif,
                fontStyle: 'italic',
                fontSize: u(13.5),
                lineHeight: u(19),
                color: colors.textSecondary,
              }}>
              Consistency today.{'\n'}A stronger tomorrow.
            </Text>
          </View>
        </Panel>
      </View>
    </View>
  );
}

/* -------------------------------- pieces -------------------------------- */

type Unit = (value: number) => number;

function Panel({ u, children }: { u: Unit; children: ReactNode }) {
  const { colors } = useTheme();

  return (
    <View
      style={{
        borderRadius: u(20),
        backgroundColor: colors.cardPanel,
        borderWidth: 1,
        borderColor: colors.cardPanelEdge,
        overflow: 'hidden',
      }}>
      {children}
    </View>
  );
}

function Rule({ u }: { u: Unit }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        width: 1,
        alignSelf: 'stretch',
        marginVertical: u(4),
        backgroundColor: colors.separator,
      }}
    />
  );
}

function Figure({
  u,
  icon,
  value,
  label,
}: {
  u: Unit;
  icon: 'chart' | 'leaf' | 'calendar';
  value: string;
  label: string;
}) {
  const { colors } = useTheme();

  return (
    <View
      accessible
      accessibilityLabel={`${value} ${label}`}
      style={{ flex: 1, alignItems: 'center', gap: u(4) }}>
      <Icon name={icon} size={u(17)} color={colors.accent} />
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
        style={{
          fontSize: u(16),
          lineHeight: u(21),
          fontWeight: '600',
          color: colors.text,
          letterSpacing: u(-0.2),
        }}>
        {value}
      </Text>
      <Text
        numberOfLines={1}
        style={{ fontSize: u(10.5), lineHeight: u(14), color: colors.textSecondary }}>
        {label}
      </Text>
    </View>
  );
}

/**
 * The portrait.
 *
 * An asymmetric set of radii rather than a circle, following the design's
 * organic cut. With no picture yet — which is everyone on the day they
 * finish onboarding — it holds their initial on tinted glass instead.
 */
function Portrait({ uri, name, u }: { uri?: string; name: string; u: Unit }) {
  const { colors } = useTheme();

  const shape = {
    width: u(142),
    height: u(168),
    borderTopLeftRadius: u(64),
    borderTopRightRadius: u(80),
    borderBottomRightRadius: u(48),
    borderBottomLeftRadius: u(86),
    overflow: 'hidden' as const,
  };

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={[shape, { backgroundColor: colors.fill }]}
        contentFit="cover"
        transition={0}
        accessibilityLabel="Your picture"
      />
    );
  }

  return (
    <View
      style={[
        shape,
        {
          backgroundColor: colors.accentSoft,
          borderWidth: 1,
          borderColor: colors.accentBorder,
          alignItems: 'center',
          justifyContent: 'center',
        },
      ]}>
      <Text
        style={{
          fontFamily: fontFamily.serif,
          fontSize: u(44),
          lineHeight: u(52),
          color: colors.accent,
        }}>
        {name.trim().charAt(0).toUpperCase() || '?'}
      </Text>
    </View>
  );
}

/** Consistency, as a dial. The figure beside it names what it is. */
function Ring({ value, u }: { value: number; u: Unit }) {
  const { colors } = useTheme();

  const uid = useId().replace(/[^A-Za-z0-9]/g, '');
  const id = `memberRing${uid}`;

  const size = u(76);
  const thickness = u(7);
  const c = size / 2;
  const r = c - thickness / 2;
  const p = Math.max(0, Math.min(1, value / 100));

  const theta = p * Math.PI * 2;
  const arc = `M ${c} ${c - r} A ${r} ${r} 0 ${p > 0.5 ? 1 : 0} 1 ${
    c + r * Math.sin(theta)
  } ${c - r * Math.cos(theta)}`;

  const start = splitAlpha(colors.arcStart);
  const end = splitAlpha(colors.arcEnd);

  return (
    <View
      accessible
      accessibilityLabel={`Consistency ${value} percent`}
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill} accessible={false}>
        <Defs>
          <SvgLinearGradient
            id={id}
            gradientUnits="userSpaceOnUse"
            x1={c}
            y1={c - r}
            x2={c + r}
            y2={c + r * 0.3}>
            <Stop offset="0" stopColor={start.color} stopOpacity={start.opacity} />
            <Stop offset="1" stopColor={end.color} stopOpacity={end.opacity} />
          </SvgLinearGradient>
        </Defs>

        <Circle
          cx={c}
          cy={c}
          r={r}
          stroke={colors.arcStart}
          strokeOpacity={0.28}
          strokeWidth={thickness}
          fill="none"
        />
        {p >= 0.999 ? (
          <Circle cx={c} cy={c} r={r} stroke={`url(#${id})`} strokeWidth={thickness} fill="none" />
        ) : p > 0 ? (
          <Path
            d={arc}
            stroke={`url(#${id})`}
            strokeWidth={thickness}
            strokeLinecap="round"
            fill="none"
          />
        ) : null}
      </Svg>

      <Text
        style={{
          fontSize: u(19),
          lineHeight: u(24),
          fontWeight: '700',
          letterSpacing: u(-0.5),
          color: colors.text,
        }}>
        {value}%
      </Text>
    </View>
  );
}
