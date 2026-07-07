import { describe, expect, it } from "vitest";
import { generateDayPlan, rankTopics, scoreTopic, type PlanContext } from "../planner";
import { DEFAULT_SETTINGS } from "../../db/defaults";
import type { Topic } from "../types";

function topic(over: Partial<Topic>): Topic {
  return {
    officialId: "E36",
    block: "Específico",
    number: 36,
    title: "Triquina",
    materialStatus: "Parcial",
    origin: "Semanal",
    priority: "Alta",
    status: "No iniciado",
    classDate: null,
    lastStudyAt: null,
    reviewStage: 0,
    mastery: 0,
    accumulatedMinutes: 0,
    pendingQuestions: 0,
    nextReviewAt: null,
    academyWeek: "",
    notes: "",
    ...over,
  };
}

function ctx(topics: Topic[], over: Partial<PlanContext> = {}): PlanContext {
  return {
    today: "2026-07-07",
    topics,
    subtopics: [],
    reviews: [],
    errors: [],
    tests: [],
    settings: DEFAULT_SETTINGS,
    weeklyCurrentIds: [],
    weeklyBacklogId: null,
    dayType: "normal",
    ...over,
  };
}

describe("priority scoring", () => {
  it("scores a weekly, partial, low-mastery topic highly with reasons", () => {
    const t = topic({});
    const scored = scoreTopic(t, ctx([t]));
    expect(scored.score).toBeGreaterThan(0);
    expect(scored.reasons).toContain("tema semanal / prioritario");
    expect(scored.reasons).toContain("material parcial");
    expect(scored.isWeekly).toBe(true);
  });

  it("ranks only topics with material and not consolidated", () => {
    const a = topic({ officialId: "E36" });
    const b = topic({ officialId: "E01", materialStatus: "No recibido", priority: "Baja" });
    const c = topic({ officialId: "E09", materialStatus: "Recibido", status: "Consolidado", priority: "Media" });
    const ranked = rankTopics(ctx([a, b, c]));
    const ids = ranked.map((r) => r.topic.officialId);
    expect(ids).toContain("E36");
    expect(ids).not.toContain("E01"); // no material
    expect(ids).not.toContain("E09"); // consolidated
  });
});

describe("day plan generation", () => {
  it("respects the max-current-topics limit and always closes the day", () => {
    const topics = [
      topic({ officialId: "E36", priority: "Alta" }),
      topic({ officialId: "E12", priority: "Alta" }),
      topic({ officialId: "E53", priority: "Alta", materialStatus: "Recibido" }),
      topic({ officialId: "E62", priority: "Alta", materialStatus: "Recibido" }),
    ];
    const plan = generateDayPlan(ctx(topics));
    const currentTasks = plan.tasks.filter(
      (t) => t.type === "primera-vuelta" || t.type === "materia-nueva",
    );
    expect(currentTasks.length).toBeLessThanOrEqual(DEFAULT_SETTINGS.maxCurrentTopics);
    expect(plan.tasks.some((t) => t.type === "recuperacion")).toBe(true);
    expect(plan.tasks[plan.tasks.length - 1].type).toBe("cierre");
  });

  it("produces an empty plan on a rest day", () => {
    const plan = generateDayPlan(ctx([topic({})], { dayType: "descanso" }));
    expect(plan.tasks.length).toBe(0);
    expect(plan.budgetMinutes).toBe(0);
  });

  it("limits a minimal day to one current topic and stays within budget", () => {
    const topics = [
      topic({ officialId: "E36" }),
      topic({ officialId: "E12" }),
    ];
    const plan = generateDayPlan(ctx(topics, { dayType: "minimo" }));
    const current = plan.tasks.filter(
      (t) => t.type === "primera-vuelta" || t.type === "materia-nueva",
    );
    expect(current.length).toBeLessThanOrEqual(1);
    expect(plan.plannedMinutes).toBeLessThanOrEqual(plan.budgetMinutes + 15);
  });
});
