import { describe, expect, it } from "vitest";
import {
  dueBucket,
  intervalForStage,
  nextStage,
  scheduleAfterReview,
  scheduleFirstReview,
} from "../review";

describe("spaced repetition", () => {
  it("uses the default interval ladder", () => {
    expect(intervalForStage(0)).toBe(1);
    expect(intervalForStage(2)).toBe(7);
    expect(intervalForStage(6)).toBe(90);
    expect(intervalForStage(99)).toBe(90); // clamps
  });

  it("advances stage on good recall, resets on blank recall", () => {
    expect(nextStage(2, 5)).toBe(3);
    expect(nextStage(2, 4)).toBe(3);
    expect(nextStage(2, 3)).toBe(3);
    expect(nextStage(2, 2)).toBe(2); // hold
    expect(nextStage(2, 1)).toBe(1); // step back
    expect(nextStage(3, 0)).toBe(0); // reset
  });

  it("first review lands one day later", () => {
    const out = scheduleFirstReview("2026-07-07");
    expect(out.stageAfter).toBe(0);
    expect(out.nextReviewAt).toBe("2026-07-08");
  });

  it("schedules the next review from the recall score", () => {
    // stage 1 + recall 4 -> stage 2 -> +7 days
    const out = scheduleAfterReview(1, 4, "2026-07-07");
    expect(out.stageAfter).toBe(2);
    expect(out.nextReviewAt).toBe("2026-07-14");
  });

  it("buckets overdue reviews by urgency", () => {
    expect(dueBucket("2026-07-07", "2026-07-07")).toBe("hoy");
    expect(dueBucket("2026-07-05", "2026-07-07")).toBe("1-3-dias");
    expect(dueBucket("2026-06-30", "2026-07-07")).toBe("mas-semana"); // 7 días
    expect(dueBucket("2026-06-20", "2026-07-07")).toBe("critico"); // 17 días
    expect(dueBucket("2026-07-10", "2026-07-07")).toBe("futuro");
  });
});
