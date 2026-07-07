// The planner: scores candidate work and assembles an ordered, budget-limited
// day plan. Every decision is explainable (priorityReasons) — no opaque formula.
import type {
  AppSettings,
  DayType,
  ErrorEntry,
  ISODate,
  PriorityWeights,
  Review,
  StudyTask,
  Subtopic,
  Test,
  Topic,
} from "./types";
import { diffDays } from "./dates";
import {
  BACKLOG_TEMPLATE,
  buildTask,
  CLOSE_TEMPLATE,
  ERRORS_TEMPLATE,
  FIRST_PASS_TEMPLATE,
  NEW_MATERIAL_TEMPLATE,
  RECOVERY_TEMPLATE,
  REVIEW_TEMPLATE,
} from "./tasks";

export const DEFAULT_WEIGHTS: PriorityWeights = {
  weeklyTopic: 40,
  reviewDue: 35,
  testDue: 30,
  lowMastery: 20,
  openErrors: 18,
  partialMaterial: 15,
  startedTopic: 10,
  classSoon: 12,
  overloadPenalty: 8,
  tooManyFrontsPenalty: 15,
};

export const DAY_TYPE_MINUTES: Record<DayType, number> = {
  minimo: 50,
  ligero: 120,
  medio: 210,
  normal: 270,
  intensivo: 330,
  descanso: 0,
  clase: 180,
  test: 180,
};

export const DAY_TYPE_LABEL: Record<DayType, string> = {
  minimo: "Día mínimo",
  ligero: "Día ligero",
  medio: "Día medio",
  normal: "Día normal",
  intensivo: "Día intensivo",
  descanso: "Descanso",
  clase: "Día de clase",
  test: "Día de test",
};

/** Material states that mean the topic can actually be studied. */
export function hasMaterial(t: Topic): boolean {
  return (
    t.materialStatus === "Recibido" ||
    t.materialStatus === "Parcial" ||
    t.materialStatus === "Test disponible" ||
    t.materialStatus === "Actualizado"
  );
}

export function isStarted(t: Topic): boolean {
  return t.status !== "No iniciado";
}

export function isConsolidated(t: Topic): boolean {
  return t.status === "Consolidado";
}

export interface ScoredTopic {
  topic: Topic;
  score: number;
  reasons: string[];
  isWeekly: boolean;
  isBacklog: boolean;
}

export interface PlanContext {
  today: ISODate;
  topics: Topic[];
  subtopics: Subtopic[];
  reviews: Review[];
  errors: ErrorEntry[];
  tests: Test[];
  settings: AppSettings;
  weeklyCurrentIds: string[];
  weeklyBacklogId: string | null;
  dayType: DayType;
}

/** Score a single topic as a study candidate. Returns points + human reasons. */
export function scoreTopic(t: Topic, ctx: PlanContext): ScoredTopic {
  const w = ctx.settings.weights;
  const reasons: string[] = [];
  let score = 0;

  const isWeekly =
    t.origin === "Semanal" ||
    ctx.weeklyCurrentIds.includes(t.officialId) ||
    t.priority === "Alta";
  if (isWeekly) {
    score += w.weeklyTopic;
    reasons.push("tema semanal / prioritario");
  }

  // Review due on the topic row itself.
  if (t.nextReviewAt && diffDays(ctx.today, t.nextReviewAt) >= 0) {
    const overdue = diffDays(ctx.today, t.nextReviewAt);
    score += w.reviewDue + Math.min(overdue, 10) * 2;
    reasons.push(overdue > 0 ? `repaso vencido (${overdue} d)` : "repaso hoy");
  }

  if (t.priority === "Media") {
    score += w.startedTopic;
  }

  if (t.mastery < 40 && hasMaterial(t)) {
    score += w.lowMastery;
    reasons.push("dominio bajo");
  }

  if (t.materialStatus === "Parcial") {
    score += w.partialMaterial;
    reasons.push("material parcial");
  }

  if (isStarted(t) && !isConsolidated(t)) {
    score += w.startedTopic;
    reasons.push("tema ya empezado");
  }

  if (t.pendingQuestions > 0) {
    score += Math.min(t.pendingQuestions, 10) * 1.5;
    reasons.push(`${t.pendingQuestions} preguntas pendientes`);
  }

  if (t.classDate) {
    const untilClass = diffDays(t.classDate, ctx.today);
    if (untilClass >= 0 && untilClass <= 2) {
      score += w.classSoon;
      reasons.push("clase próxima");
    }
  }

  const isBacklog = t.origin === "Matrícula" && !isWeekly;
  return { topic: t, score, reasons, isWeekly, isBacklog };
}

export function rankTopics(ctx: PlanContext): ScoredTopic[] {
  return ctx.topics
    .filter(hasMaterial)
    .filter((t) => !isConsolidated(t))
    .map((t) => scoreTopic(t, ctx))
    .sort((a, b) => b.score - a.score);
}

export interface PlannedDay {
  dayType: DayType;
  budgetMinutes: number;
  tasks: StudyTask[];
  plannedMinutes: number;
  overloadTrimmed: number; // tasks removed for budget
}

/**
 * Build the ordered task list for a day.
 * Rules: recovery first, then current topics (max N), one backlog topic,
 * due reviews, a pending test, errors, and a closing task — all capped to the
 * day-type minute budget.
 */
export function generateDayPlan(ctx: PlanContext): PlannedDay {
  const { settings, dayType, today } = ctx;
  const budget = DAY_TYPE_MINUTES[dayType];

  if (dayType === "descanso") {
    return {
      dayType,
      budgetMinutes: 0,
      tasks: [],
      plannedMinutes: 0,
      overloadTrimmed: 0,
    };
  }

  const ranked = rankTopics(ctx);
  const weekly = ranked.filter((r) => r.isWeekly || !r.isBacklog);
  const backlog = ranked.filter((r) => r.isBacklog);

  const tasks: StudyTask[] = [];
  let order = 0;

  // 1. Recovery (skipped on a minimal day only if budget is tiny).
  tasks.push(buildTask(RECOVERY_TEMPLATE, null, today, order++));

  // 2. Current topics (respect max fronts).
  const maxCurrent = dayType === "minimo" ? 1 : settings.maxCurrentTopics;
  const chosenCurrent = weekly.slice(0, maxCurrent);
  for (const sc of chosenCurrent) {
    const template =
      sc.topic.materialStatus === "Parcial" || sc.topic.status === "No iniciado"
        ? sc.topic.priority === "Alta"
          ? FIRST_PASS_TEMPLATE
          : NEW_MATERIAL_TEMPLATE
        : FIRST_PASS_TEMPLATE;
    const task = buildTask(template, sc.topic, today, order++);
    task.priority = sc.score;
    task.priorityReasons = sc.reasons;
    tasks.push(task);
  }

  // 3. One backlog topic (never more than the configured max).
  if (dayType !== "minimo" && settings.maxBacklogTopics > 0 && backlog[0]) {
    const sc = backlog[0];
    const task = buildTask(BACKLOG_TEMPLATE, sc.topic, today, order++);
    task.priority = sc.score;
    task.priorityReasons = sc.reasons.length ? sc.reasons : ["tema atrasado"];
    tasks.push(task);
  }

  // 4. Due reviews (topic-level), highest overdue first.
  const dueReviews = ctx.reviews
    .filter((r) => !r.completedAt && diffDays(today, r.scheduledAt) >= 0)
    .sort((a, b) => diffDays(today, b.scheduledAt) - diffDays(today, a.scheduledAt));
  if (dueReviews[0]) {
    const t = ctx.topics.find((x) => x.officialId === dueReviews[0].topicId) ?? null;
    const task = buildTask(REVIEW_TEMPLATE, t, today, order++);
    task.priorityReasons = ["repaso vencido"];
    tasks.push(task);
  }

  // 5. A pending test.
  const pendingTest = ctx.tests.find((t) => t.status === "pendiente");
  if (pendingTest && dayType !== "minimo") {
    tasks.push(
      buildTask(REVIEW_TEMPLATE, null, today, order++, {
        type: "test",
        title: `Hacer test: ${pendingTest.title}`,
        objective: "Realizar el test cronometrado y sin apuntes.",
        expectedOutput: "Test respondido, corregido y errores registrados.",
        plannedMinutes: Math.min(pendingTest.durationMinutes, 60),
        testId: pendingTest.id,
        priorityReasons: ["test pendiente"],
      }),
    );
  }

  // 6. Errors due.
  const errorsDue = ctx.errors.filter(
    (e) =>
      e.status !== "resuelto" &&
      e.nextReviewAt &&
      diffDays(today, e.nextReviewAt) >= 0,
  );
  if (errorsDue.length > 0) {
    tasks.push(
      buildTask(ERRORS_TEMPLATE, null, today, order++, {
        priorityReasons: [`${errorsDue.length} errores vencidos`],
      }),
    );
  }

  // 7. Close.
  tasks.push(buildTask(CLOSE_TEMPLATE, null, today, order++));

  // Trim to the minute budget, always keeping recovery + top current + close.
  const trimmed = trimToBudget(tasks, budget);
  const plannedMinutes = trimmed.kept.reduce((s, t) => s + t.plannedMinutes, 0);

  return {
    dayType,
    budgetMinutes: budget,
    tasks: trimmed.kept.map((t, i) => ({ ...t, order: i })),
    plannedMinutes,
    overloadTrimmed: trimmed.removed,
  };
}

function trimToBudget(
  tasks: StudyTask[],
  budget: number,
): { kept: StudyTask[]; removed: number } {
  if (budget <= 0) return { kept: [], removed: tasks.length };
  // Protected tasks are never trimmed.
  const protectedTypes = new Set(["recuperacion", "cierre"]);
  const close = tasks.find((t) => t.type === "cierre");
  const kept: StudyTask[] = [];
  let used = 0;
  let removed = 0;

  for (const t of tasks) {
    if (t.type === "cierre") continue; // add last
    const closeMinutes = close ? close.plannedMinutes : 0;
    if (
      protectedTypes.has(t.type) ||
      used + t.plannedMinutes + closeMinutes <= budget ||
      kept.length === 0
    ) {
      kept.push(t);
      used += t.plannedMinutes;
    } else {
      removed++;
    }
  }
  if (close) kept.push(close);
  return { kept, removed };
}

/** Weekly hours split into the three buckets (current / backlog / review). */
export interface WeeklySplit {
  currentHours: number;
  backlogHours: number;
  reviewHours: number;
}

export function weeklySplit(settings: AppSettings): WeeklySplit {
  const h = settings.weeklyTargetHours;
  return {
    currentHours: round1(h * settings.currentTopicPct),
    backlogHours: round1(h * settings.backlogPct),
    reviewHours: round1(h * settings.reviewPct),
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
