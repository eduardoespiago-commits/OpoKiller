import { describe, expect, it } from "vitest";
import {
  gradeAnswer,
  nextErrorReview,
  OFFICIAL_PENALTY,
  scoreAttempt,
} from "../scoring";
import type { Question, TestAnswer } from "../types";

function q(id: string, correct: string): Question {
  return {
    id,
    topicId: "E53",
    subtopicId: null,
    type: "test",
    category: "Tema semanal",
    statement: "x",
    options: ["a", "b", "c", "d"],
    correctAnswer: correct,
    explanation: "",
    source: "",
    difficulty: "Media",
    timesAnswered: 0,
    timesCorrect: 0,
    timesIncorrect: 0,
    lastAnsweredAt: null,
    nextRepeatAt: null,
  };
}

describe("test scoring", () => {
  it("grades correct, wrong and blank", () => {
    expect(gradeAnswer(q("1", "C"), "c")).toBe("Correcta");
    expect(gradeAnswer(q("1", "C"), "A")).toBe("Error");
    expect(gradeAnswer(q("1", "C"), null)).toBe("Blanco");
    expect(gradeAnswer(q("1", "C"), "")).toBe("Blanco");
  });

  it("applies the official penalty (+1 / -0.3333 / 0)", () => {
    const answers: TestAnswer[] = [
      { questionId: "1", selected: "A", flaggedDoubt: false, result: "Correcta" },
      { questionId: "2", selected: "A", flaggedDoubt: false, result: "Correcta" },
      { questionId: "3", selected: "B", flaggedDoubt: false, result: "Error" },
      { questionId: "4", selected: null, flaggedDoubt: false, result: "Blanco" },
    ];
    const s = scoreAttempt(answers, OFFICIAL_PENALTY);
    expect(s.correct).toBe(2);
    expect(s.incorrect).toBe(1);
    expect(s.blank).toBe(1);
    // 2 - 0.3333 = 1.6667 -> rounded to 1.67
    expect(s.netScore).toBe(1.67);
    expect(s.rawPercentage).toBeCloseTo(0.5);
  });

  it("schedules error repeats by severity", () => {
    expect(nextErrorReview("Alta", "2026-07-07")).toBe("2026-07-08");
    expect(nextErrorReview("Media", "2026-07-07")).toBe("2026-07-10");
    expect(nextErrorReview("Baja", "2026-07-07")).toBe("2026-07-14");
  });
});
