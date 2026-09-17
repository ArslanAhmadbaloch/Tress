/**
 * "Tress says": the coach's paragraph, beside its face.
 *
 * The bubble carries the speaker's name in small grey over the paragraph
 * the coach wrote from the record (features/coach/report-summary.ts):
 * what the turn kept, where the person's own focus points, whether the
 * figures were counted, when the next scan is due. The face beside it is
 * the app's own orb — a cream sphere lit from the upper left with two
 * line eyes and a smile, drawn in the tokens — so the paragraph reads as
 * said by someone rather than printed by something. It is a drawing,
 * not a person: the paragraph never speaks in the first person, and the
 * sweep holds it to that.
 */

import { useId } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from 'react-native-svg';

import { Text } from '@/components/ui/text';
import type { SaysBlock } from '@/features/hair-scan/report-model';
import { splitAlpha, useTheme } from '@/theme';

const ORB = 56;

/** The coach's face: an orb with two arched eyes and a smile. */
export function TressOrb({ size = ORB }: { size?: number }) {
  const { colors } = useTheme();
  const uid = useId().replace(/[^A-Za-z0-9]/g, '');
  const r = size / 2;
  const core = splitAlpha(colors.orbCore);
  const mid = splitAlpha(colors.orbMid);
  const edge = splitAlpha(colors.orbEdge);
  const shadow = splitAlpha(colors.orbShadow);
  // The eyes and the smile, as fractions of the orb.
  const eyeY = r * 0.86;
  const eyeDx = r * 0.36;
  const eyeR = r * 0.16;
  const smileY = r * 1.22;
  const smileW = r * 0.5;

  return (
    <Svg width={size} height={size + 6} accessible={false} importantForAccessibility="no-hide-descendants">
      <Defs>
        <RadialGradient id={`orb${uid}`} cx="36%" cy="30%" r="72%">
          <Stop offset="0" stopColor={core.color} stopOpacity={core.opacity} />
          <Stop offset="0.6" stopColor={mid.color} stopOpacity={mid.opacity} />
          <Stop offset="1" stopColor={edge.color} stopOpacity={edge.opacity} />
        </RadialGradient>
      </Defs>
      {/* The contact shadow under it. */}
      <Circle cx={r} cy={size + 1} r={r * 0.62} fill={shadow.color} fillOpacity={shadow.opacity} />
      <Circle cx={r} cy={r} r={r - 1} fill={`url(#orb${uid})`} stroke={colors.orbRimBottom} strokeWidth={1} />
      {/* Two arched eyes, the way the owner's mascot smiles with them. */}
      <Path
        d={`M${r - eyeDx - eyeR} ${eyeY} Q${r - eyeDx} ${eyeY - eyeR * 1.6} ${r - eyeDx + eyeR} ${eyeY}`}
        stroke={colors.text}
        strokeWidth={2}
        strokeLinecap="round"
        fill="none"
      />
      <Path
        d={`M${r + eyeDx - eyeR} ${eyeY} Q${r + eyeDx} ${eyeY - eyeR * 1.6} ${r + eyeDx + eyeR} ${eyeY}`}
        stroke={colors.text}
        strokeWidth={2}
        strokeLinecap="round"
        fill="none"
      />
      <Path
        d={`M${r - smileW / 2} ${smileY} Q${r} ${smileY + smileW * 0.55} ${r + smileW / 2} ${smileY}`}
        stroke={colors.text}
        strokeWidth={2}
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  );
}

export function SaysBlockView({ says }: { says: SaysBlock }) {
  const { colors, radius, spacing } = useTheme();

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm }}>
      <TressOrb />
      <View
        accessible
        accessibilityLabel={`${says.speaker}: ${says.body}`}
        style={{
          flex: 1,
          minWidth: 0,
          backgroundColor: colors.backgroundSubtle,
          borderRadius: radius.card,
          borderBottomLeftRadius: radius.xs,
          paddingVertical: spacing.lg,
          paddingHorizontal: spacing.xl,
          gap: spacing.xs,
        }}>
        <Text variant="caption" color="textTertiary">
          {says.speaker}
        </Text>
        <Text variant="callout">{says.body}</Text>
      </View>
    </View>
  );
}
