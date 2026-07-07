// Test scoring with the official penalty (+1 / -0.3333 / blank 0).
import type {
  ErrorSeverity,
  ISODate,
  Question,
  TestAnswer,
  TestAttempt,
} from "./types";
import { addDays } from "./dates";

export interface PenaltyFormula {
  correct: number;
  incorrect: number;
  blank: number;
}

export const OFFICIAL_PENALTY: PenaltyFormula = {
  correct: 1,
  incorrect: -0.3333,
  blank: 0,
};

export function gradeAnswer(
  question: Question,
  selected: string | null,
): "Correcta" | "Error" | "Blanco" {
  if (selected == null || selected === "") return "Blanco";
  return selected.toUpperCase() === question.correctAnswer.toUpperCase()
    ? "Correcta"
    : "Error";
}

export interface ScoreResult {
  correct: number;
  incorrect: number;
  blank: number;
  answered: number;
  total: number;
  netScore: number;
  rawPercentage: number; // correct / total
  netPercentage: number; // netScore / total
}

export function scoreAttempt(
  answers: TestAnswer[],
  formula: PenaltyFormula = OFFICIAL_PENALTY,
): ScoreResult {
  let correct = 0;
  let incorrect = 0;
  let blank = 0;
  for (const a of answers) {
    if (a.result === "Correcta") correct++;
    else if (a.result === "Error") incorrect++;
    else blank++;
  }
  const total = answers.length;
  const netScore =
    correct * formula.correct +
    incorrect * formula.incorrect +
    blank * formula.blank;
  return {
    correct,
    incorrect,
    blank,
    answered: correct + incorrect,
    total,
    netScore: round2(netScore),
    rawPercentage: total ? correct / total : 0,
    netPercentage: total ? netScore / total : 0,
  };
}

export function buildAttempt(
  testId: string,
  questions: Question[],
  rawAnswers: { questionId: string; selected: string | null; flaggedDoubt: boolean }[],
  startedAt: string,
  finishedAt: string,
  formula: PenaltyFormula = OFFICIAL_PENALTY,
): TestAttempt {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const answers: TestAnswer[] = rawAnswers.map((a) => {
    const q = byId.get(a.questionId)!;
    return {
      questionId: a.questionId,
      selected: a.selected,
      flaggedDoubt: a.flaggedDoubt,
      result: gradeAnswer(q, a.selected),
    };
  });
  const score = scoreAttempt(answers, formula);
  const totalSeconds = Math.max(
    0,
    Math.round(
      (new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 1000,
    ),
  );
  return {
    id: `attempt-${Date.now()}`,
    testId,
    startedAt,
    finishedAt,
    answers,
    correct: score.correct,
    incorrect: score.incorrect,
    blank: score.blank,
    netScore: score.netScore,
    rawPercentage: score.rawPercentage,
    netPercentage: score.netPercentage,
    totalSeconds,
  };
}

// Error repetition schedule by severity (matches the Excel formula).
export function errorRepeatOffsets(severity: ErrorSeverity): number {
  if (severity === "Alta") return 1;
  if (severity === "Media") return 3;
  return 7;
}

export function nextErrorReview(
  severity: ErrorSeverity,
  from: ISODate,
): ISODate {
  return addDays(from, errorRepeatOffsets(severity));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
