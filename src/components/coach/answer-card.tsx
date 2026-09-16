/**
 * One answer from Ask Tress.
 *
 * It lands with the report's own Reveal, because it is the same kind of
 * thing: a reading from the record, delivered rather than dumped. A
 * refusal is drawn exactly like any other answer — no tint, no icon, no
 * warning colour — since being told "Tress can't say" is not an error,
 * it is the honest answer.
 *
 * The person's own words come back as a quotation in the serif italic,
 * set off by a rule, so what they wrote is never mistaken for what the
 * app is saying.
 */

import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { ReadingRing, Reveal, revealDelay } from '@/components/report';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import type { CoachAnswer } from '@/features/coach';
import { serifItalicStyle, useTheme } from '@/theme';

/**
 * The ring waits for its card the way the report tab's rings do
 * (`index * STAGGER + 200`), with the Reveal lead in place of the stagger.
 */
const RING_DELAY = revealDelay(0) + 200;

export function AnswerCard({
  answer,
}: {
  answer: CoachAnswer;
  /**
   * Position in the thread. Every answer lands alone after a fixed lead,
   * so the card does not read it; it is part of the contract so a caller
   * keying and staging the thread has one shape to pass.
   */
  index: number;
}) {
  const { colors, spacing } = useTheme();
  const router = useRouter();

  const { source, headline, detail, echoLabel, echo, figure, action } = answer;

  return (
    <Reveal index={0}>
      <Card>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: spacing.md,
          }}>
          {/*
            One accessible element for the whole reading, so VoiceOver
            says it as one thing. The action below is a sibling on
            purpose: a button inside an accessible view cannot be reached.
          */}
          <View
            accessible
            accessibilityLabel={`Tress: ${source}. ${headline} ${detail ?? ''}`}
            accessibilityLiveRegion="polite"
            style={{ flex: 1, minWidth: 0, gap: spacing.xs }}>
            <Text variant="caption" color="textSecondary">
              {source}
            </Text>
            <Text variant="headline" style={{ marginTop: spacing.xs }}>
              {headline}
            </Text>
            {detail ? (
              <Text variant="footnote" color="textSecondary">
                {detail}
              </Text>
            ) : null}

            {echo?.length ? (
              <View style={{ marginTop: spacing.sm, gap: spacing.xs }}>
                {echoLabel ? (
                  <Text variant="caption" color="textTertiary">
                    {echoLabel}
                  </Text>
                ) : null}
                {echo.map((line, i) => (
                  <Text
                    key={i}
                    variant="callout"
                    style={[
                      serifItalicStyle,
                      {
                        paddingLeft: spacing.md,
                        borderLeftWidth: 2,
                        borderLeftColor: colors.accentBorder,
                      },
                    ]}>
                    {line}
                  </Text>
                ))}
              </View>
            ) : null}
          </View>

          {figure ? (
            <ReadingRing
              value={figure.value}
              label={figure.label}
              size={60}
              thickness={5}
              variant="subhead"
              delay={RING_DELAY}
            />
          ) : null}
        </View>

        {action ? (
          <Button
            label={action.label}
            variant="secondary"
            size="md"
            block={false}
            onPress={() => router.push(action.href)}
            style={{ marginTop: spacing.md }}
          />
        ) : null}
      </Card>
    </Reveal>
  );
}
