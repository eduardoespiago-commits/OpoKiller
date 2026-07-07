// Spaced-repetition engine. Adapts the next interval from a 0..5 recall score.
import type { ISODate, ReviewType } from "./types";
import { addDays, diffDays } from "./dates";

// The app varies the review activity so it isn't always "reread".
// Early stages favour active recall; later stages add tests and procedures.
const REVIEW_TYPE_LADDER: ReviewType[] = [
  "esquema",
  "preguntas-cortas",
  "flashcards",
  "mini-test",
  "explicacion-oral",
  "procedimiento",
  "test-acumulativo",
];

export function pickReviewType(stage: number): ReviewType {
  const i = Math.max(0, Math.min(stage, REVIEW_TYPE_LADDER.length - 1));
  return REVIEW_TYPE_LADDER[i];
}

export const REVIEW_TYPE_LABEL: Record<ReviewType, string> = {
  esquema: "Esquema en hoja en blanco",
  "preguntas-cortas": "Preguntas cortas de memoria",
  flashcards: "Flashcards",
  "mini-test": "Mini test",
  "explicacion-oral": "Explicación oral",
  "tabla-datos": "Tabla de datos/cifras",
  procedimiento: "Explicar el procedimiento",
  errores: "Repetir errores anteriores",
  "test-acumulativo": "Test acumulativo",
};

// Default interval (in days) applied *after reaching* each stage.
// Stage 0 -> +1, 1 -> +3, 2 -> +7, 3 -> +14, 4 -> +30, 5 -> +60, 6+ -> +90.
export const DEFAULT_INTERVALS = [1, 3, 7, 14, 30, 60, 90];

export function intervalForStage(
  stage: number,
  intervals: number[] = DEFAULT_INTERVALS,
): number {
  const i = Math.max(0, Math.min(stage, intervals.length - 1));
  return intervals[i];
}

/**
 * Given the current stage and a recall score (0..5), return the next stage.
 * - recall >= 3 advances one stage.
 * - recall == 2 keeps the stage (repeat same interval).
 * - recall <= 1 drops back (0 resets to the start).
 */
export function nextStage(currentStage: number, recall: number): number {
  if (recall >= 3) return currentStage + 1;
  if (recall === 2) return currentStage;
  if (recall === 1) return Math.max(0, currentStage - 1);
  return 0;
}

export interface ReviewOutcome {
  stageAfter: number;
  nextReviewAt: ISODate;
}

export function scheduleAfterReview(
  currentStage: number,
  recall: number,
  completedOn: ISODate,
  intervals: number[] = DEFAULT_INTERVALS,
): ReviewOutcome {
  const stageAfter = nextStage(currentStage, recall);
  const days = intervalForStage(stageAfter, intervals);
  return { stageAfter, nextReviewAt: addDays(completedOn, days) };
}

/** First review after an initial study pass (stage 0 -> due tomorrow). */
export function scheduleFirstReview(
  studiedOn: ISODate,
  intervals: number[] = DEFAULT_INTERVALS,
): ReviewOutcome {
  return { stageAfter: 0, nextReviewAt: addDays(studiedOn, intervals[0]) };
}

export type DueBucket =
  | "hoy"
  | "1-3-dias"
  | "mas-semana"
  | "critico"
  | "futuro";

/** Classify how overdue a scheduled review is, relative to `today`. */
export function dueBucket(scheduledAt: ISODate, today: ISODate): DueBucket {
  const overdue = diffDays(today, scheduledAt); // >0 means overdue
  if (overdue < 0) return "futuro";
  if (overdue === 0) return "hoy";
  if (overdue <= 3) return "1-3-dias";
  if (overdue <= 7) return "mas-semana";
  return "critico";
}

export const DUE_BUCKET_LABEL: Record<DueBucket, string> = {
  hoy: "Vence hoy",
  "1-3-dias": "Vencido 1-3 días",
  "mas-semana": "Vencido +1 semana",
  critico: "Crítico",
  futuro: "Programado",
};
