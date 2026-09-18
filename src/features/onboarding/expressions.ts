/**
 * Which face Tress makes for each question, and where it looks.
 *
 * The funnel is one character asking, and a character that held one
 * expression for sixteen questions would read as a sticker. So each
 * question id maps to an expression and a gaze: a smile for the easy
 * ones, a glance at the bubble when the question is the point, a
 * wince where the answer might be "it stings", a thinking face where
 * the person is being asked to recall. The mapping is data; the
 * drawing lives in the onboarding kit's Mascot.
 *
 * Nothing here is a claim about the person. An expression is the
 * asker's manner, never a reading of the answer — the same face shows
 * whatever they pick.
 */

import type { MascotExpression, MascotGaze } from '@/components/onboarding/kit/mascot';
import type { QuestionId } from '@/features/onboarding/questions';

export type QuestionExpression = { expression: MascotExpression; gaze: MascotGaze };

const FOR_QUESTION: Record<QuestionId, QuestionExpression> = {
  age: { expression: 'smile', gaze: 'user' },
  gender: { expression: 'calm', gaze: 'user' },
  hairType: { expression: 'glance', gaze: 'question' },
  hairWearing: { expression: 'smile', gaze: 'question' },
  scalpType: { expression: 'think', gaze: 'question' },
  scalpSensitivity: { expression: 'clench', gaze: 'user' },
  goal: { expression: 'smile', gaze: 'user' },
  concerns: { expression: 'glance', gaze: 'user' },
  noticed: { expression: 'calm', gaze: 'user' },
  approaches: { expression: 'think', gaze: 'question' },
  medications: { expression: 'calm', gaze: 'user' },
  budget: { expression: 'wink', gaze: 'user' },
  productFactors: { expression: 'glance', gaze: 'question' },
  ingredientReactions: { expression: 'clench', gaze: 'user' },
  scalpConditions: { expression: 'calm', gaze: 'user' },
  lifeFactors: { expression: 'calm', gaze: 'user' },
  heatStyling: { expression: 'blow', gaze: 'user' },
};

/** The default, for any id the table does not know: the plain smile. */
const FALLBACK: QuestionExpression = { expression: 'smile', gaze: 'user' };

function isQuestionId(id: string): id is QuestionId {
  return Object.prototype.hasOwnProperty.call(FOR_QUESTION, id);
}

/** The face and gaze for a funnel question; a smile for anything else. */
export function expressionFor(questionId: string): QuestionExpression {
  return isQuestionId(questionId) ? FOR_QUESTION[questionId] : FALLBACK;
}
