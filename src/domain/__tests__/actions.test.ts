import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/db";
import { loadSeed } from "../../db/seed";
import {
  closeSession,
  getActiveSession,
  discardSession,
  moveTask,
  planRecovery,
  reviewTopicNow,
  startSession,
} from "../../db/actions";
import { todayISO } from "../dates";
import type { StudyTask } from "../types";

function task(over: Partial<StudyTask> = {}): StudyTask {
  return {
    id: `t-${Math.random().toString(36).slice(2)}`,
    topicId: "E09",
    subtopicId: null,
    type: "primera-vuelta",
    title: "E09 primera vuelta",
    objective: "",
    expectedOutput: "",
    plannedDate: todayISO(),
    plannedMinutes: 45,
    actualMinutes: 0,
    priority: 0,
    priorityReasons: [],
    status: "pendiente",
    source: "auto",
    locked: false,
    order: 0,
    createdAt: new Date().toISOString(),
    ...over,
  };
}

describe("session + review pipeline", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    await loadSeed();
  });

  it("a completed session creates a pending review row for the topic", async () => {
    const t = task();
    await db.tasks.put(t);
    const sid = await startSession(t);
    await closeSession(sid, {
      actualMinutes: 45,
      completedPercentage: 90,
      focusScore: 4,
      energy: 3,
      difficulty: 3,
      recall: 4,
      notes: "",
    });
    const topic = await db.topics.get("E09");
    expect(topic?.accumulatedMinutes).toBe(45);
    expect(topic?.nextReviewAt).toBeTruthy();
    const reviews = (await db.reviews.toArray()).filter((r) => r.topicId === "E09" && !r.completedAt);
    expect(reviews.length).toBe(1); // exactly one pending review, not many
  });

  it("reviewTopicNow advances the stage and reschedules", async () => {
    await reviewTopicNow("E11", 4); // first review, recall 4 -> stage 1 -> +3 days
    const topic = await db.topics.get("E11");
    expect(topic?.reviewStage).toBe(1);
    const done = (await db.reviews.toArray()).filter((r) => r.topicId === "E11" && r.completedAt);
    expect(done.length).toBe(1);
    const pending = (await db.reviews.toArray()).filter((r) => r.topicId === "E11" && !r.completedAt);
    expect(pending.length).toBe(1);
  });

  it("an active session survives and can be recovered or discarded", async () => {
    const t = task();
    await db.tasks.put(t);
    const sid = await startSession(t);
    const active = await getActiveSession();
    expect(active?.id).toBe(sid);
    await discardSession(sid);
    expect(await getActiveSession()).toBeUndefined();
    const reopened = await db.tasks.get(t.id);
    expect(reopened?.status).toBe("pendiente");
  });

  it("moveTask reschedules a task to another day and keeps it active", async () => {
    const t = task({ status: "aplazada" });
    await db.tasks.put(t);
    await moveTask(t.id, "2026-07-10");
    const moved = await db.tasks.get(t.id);
    expect(moved?.plannedDate).toBe("2026-07-10");
    expect(moved?.status).toBe("pendiente");
  });

  it("planRecovery returns realistic counts and leaves a minimal day", async () => {
    const r = await planRecovery();
    expect(r.daysPlanned).toBeGreaterThanOrEqual(1);
    const todaysTasks = await db.tasks.where("plannedDate").equals(todayISO()).toArray();
    // A minimal day stays small.
    const currentTopics = todaysTasks.filter(
      (t) => t.type === "primera-vuelta" || t.type === "materia-nueva",
    );
    expect(currentTopics.length).toBeLessThanOrEqual(1);
  });
});
