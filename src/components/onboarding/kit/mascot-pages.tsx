/**
 * The pages where the orb speaks for itself.
 *
 *   MascotIntro    the introduction: the big orb, one line, Next
 *   Interstitial   the pause after the first questions: the big orb, a
 *                  greeting with the person's name in it, a supportive
 *                  line, and the way on
 *
 * Both are the same composition — the orb in its light, then the words,
 * then the pill — so the character is met the same way twice. The
 * interstitial's title takes a `{name}` placeholder and fills it (see
 * `greet` in copy.ts); every word comes from the caller.
 */

import { View } from 'react-native';
import Animated, { FadeIn, FadeInDown, useReducedMotion } from 'react-native-reanimated';

import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

import { ContinueBar, FunnelPage } from './chrome';
import { greet } from './copy';
import { Mascot, type MascotExpression } from './mascot';

/** The orb on its own page. */
const BIG = 150;

function MascotStage({
  expression,
  title,
  body,
}: {
  expression: MascotExpression;
  title: string;
  body?: string;
}) {
  const { spacing } = useTheme();
  const reduceMotion = useReducedMotion();

  const arrive = (delay: number) =>
    reduceMotion
      ? FadeIn.duration(220).delay(delay)
      : FadeInDown.springify()
          .damping(22)
          .mass(0.9)
          .delay(delay)
          .withInitialValues({ transform: [{ translateY: 14 }] });

  return (
    <View style={{ alignItems: 'center', gap: spacing.lg }}>
      <Animated.View entering={arrive(0)} style={{ marginBottom: spacing.xxxl }}>
        <Mascot size={BIG} expression={expression} />
      </Animated.View>
      <Animated.View entering={arrive(120)}>
        <Text variant="title1" center accessibilityRole="header">
          {title}
        </Text>
      </Animated.View>
      {body ? (
        <Animated.View entering={arrive(200)}>
          <Text variant="body" color="textSecondary" center>
            {body}
          </Text>
        </Animated.View>
      ) : null}
    </View>
  );
}

export function MascotIntro({
  title,
  cta,
  onNext,
  expression = 'smile',
}: {
  title: string;
  cta: string;
  onNext: () => void;
  expression?: MascotExpression;
}) {
  return (
    <FunnelPage centred bottom={<ContinueBar label={cta} enabled onPress={onNext} />}>
      <MascotStage expression={expression} title={title} />
    </FunnelPage>
  );
}

export function Interstitial({
  name,
  title,
  body,
  cta,
  onNext,
  onBack,
  expression = 'smile',
}: {
  name?: string;
  /** May carry `{name}`, which is replaced with the person's name. */
  title: string;
  body: string;
  cta: string;
  onNext: () => void;
  onBack?: () => void;
  expression?: MascotExpression;
}) {
  return (
    <FunnelPage centred back={onBack} bottom={<ContinueBar label={cta} enabled onPress={onNext} />}>
      <MascotStage expression={expression} title={greet(title, name)} body={body} />
    </FunnelPage>
  );
}
