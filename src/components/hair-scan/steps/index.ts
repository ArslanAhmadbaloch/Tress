/**
 * The step chrome — everything the guided scan draws around the head.
 *
 * Four pieces, in the order a person meets them: the header at the top
 * with its bar and its title, the brackets framing the head, the arrow
 * telling them which way to turn, and the checklist at the end saying
 * what was captured. They share one thing besides the tokens — the
 * arithmetic in `geometry.ts`, which is a plain module so the test run
 * can import it and call it with numbers — and not one of them writes a
 * sentence: every word arrives as a prop.
 */

export {
  CaptureChecklist,
  type CaptureChecklistItem,
  type CaptureChecklistProps,
} from './capture-checklist';
export {
  BRACKET_ARM,
  BRACKET_RADIUS,
  BRACKET_WEIGHT,
  FrameBrackets,
  type BracketTone,
  type FrameBracketsProps,
} from './frame-brackets';
export {
  CHECKLIST_STAGGER_MS,
  CHEVRON_COUNT,
  CHEVRON_GAP,
  CHEVRON_HEIGHT,
  CHEVRON_WIDTH,
  DRIFT,
  FLOOR_CALM,
  FLOOR_URGENT,
  INSIST_SCALE,
  SETTLE_SCALE,
  STEP_BAR_HEIGHT,
  SWEEP_CALM_MS,
  SWEEP_GEARS,
  SWEEP_URGENT_MS,
  chevronFloor,
  chevronLit,
  chevronOpacity,
  driftFor,
  gearDuration,
  rotationFor,
  rowDelay,
  segmentFill,
  sweepDuration,
  sweepGear,
  unit,
  type TurnDirection,
} from './geometry';
export { StepHeader, type StepHeaderProps } from './step-header';
export { TurnArrow, type TurnArrowProps } from './turn-arrow';
