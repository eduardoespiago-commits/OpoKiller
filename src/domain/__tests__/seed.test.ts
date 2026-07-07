import { describe, expect, it, beforeEach } from "vitest";
import { db } from "../../db/db";
import { loadSeed } from "../../db/seed";

describe("seed import from Excel data", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it("loads all 90 official topics", async () => {
    await loadSeed();
    expect(await db.topics.count()).toBe(90);
  });

  it("marks E12 and E36 as partial with subtopics", async () => {
    await loadSeed();
    const e12 = await db.topics.get("E12");
    const e36 = await db.topics.get("E36");
    expect(e12?.materialStatus).toBe("Parcial");
    expect(e36?.materialStatus).toBe("Parcial");
    const subs = await db.subtopics.toArray();
    expect(subs.map((s) => s.id).sort()).toEqual(["E12.2", "E36.1", "E36.2"]);
  });

  it("loads the 50 real questions and links the 17/06 test", async () => {
    await loadSeed();
    expect(await db.questions.count()).toBe(50);
    const test = await db.tests.get("test-2026-06-17");
    expect(test?.questionIds.length).toBe(50);
  });

  it("registers the three weekly tests and materials", async () => {
    await loadSeed();
    expect(await db.tests.count()).toBe(3);
    expect(await db.materials.count()).toBeGreaterThan(10);
  });

  it("every question has a valid correct answer letter", async () => {
    await loadSeed();
    const qs = await db.questions.toArray();
    for (const q of qs) {
      expect(["A", "B", "C", "D"]).toContain(q.correctAnswer);
    }
  });
});
