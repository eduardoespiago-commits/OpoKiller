// Application-level mutations: everything the UI does to change stored state.
import { db } from "./db";
import { DEFAULT_SETTINGS } from "./defaults";
import type {
  AppSettings,
  DayType,
  ErrorCause,
  ErrorEntry,
  ErrorSeverity,
  ISODate,
  Question,
  Review,
  StudySession,
  StudyTask,
  Test,
  TestAttempt,
  Topic,
  WeeklyPlan,
} from "../domain/types";
import { todayISO } from "../domain/dates";
import {
  generateDayPlan,
  type PlanContext,
} from "../domain/planner";
import {
  pickReviewType,
  scheduleAfterReview,
  scheduleFirstReview,
} from "../domain/review";
import { nextErrorReview } from "../domain/scoring";

export async function getSettings(): Promise<AppSettings> {
  const stored = await db.settings.get("default");
  // Merge with defaults so settings saved by older versions gain new fields.
  return stored
    ? { ...DEFAULT_SETTINGS, ...stored, weights: { ...DEFAULT_SETTINGS.weights, ...stored.weights } }
    : DEFAULT_SETTINGS;
}

export async function saveSettings(patch: Partial<AppSettings>): Promise<void> {
  const current = await getSettings();
  await db.settings.put({ ...current, ...patch, id: "default" });
}

/** Build a plan context from the current DB state. */
export async function buildPlanContext(
  date: ISODate,
  dayType: DayType,
): Promise<PlanContext> {
  const [topics, subtopics, reviews, errors, tests, settings] =
    await Promise.all([
      db.topics.toArray(),
      db.subtopics.toArray(),
      db.reviews.toArray(),
      db.errors.toArray(),
      db.tests.toArray(),
      getSettings(),
    ]);
  const week = await getActiveWeeklyPlan();
  return {
    today: date,
    topics,
    subtopics,
    reviews,
    errors,
    tests,
    settings,
    weeklyCurrentIds: week?.currentTopicIds ?? [],
    weeklyBacklogId: week?.backlogTopicId ?? null,
    dayType,
  };
}

/** Generate (or regenerate) auto tasks for a day, keeping locked/manual ones. */
export async function generatePlanForDay(
  date: ISODate,
  dayType: DayType,
): Promise<StudyTask[]> {
  const ctx = await buildPlanContext(date, dayType);
  const plan = generateDayPlan(ctx);

  const existing = await db.tasks.where("plannedDate").equals(date).toArray();
  const keep = existing.filter(
    (t) => t.locked || t.source === "manual" || t.status === "completada",
  );
  const removable = existing.filter(
    (t) => !t.locked && t.source === "auto" && t.status !== "completada",
  );
  await db.tasks.bulkDelete(removable.map((t) => t.id));

  const startOrder = keep.length;
  const newTasks = plan.tasks.map((t, i) => ({ ...t, order: startOrder + i }));
  await db.tasks.bulkPut(newTasks);
  return [...keep, ...newTasks].sort((a, b) => a.order - b.order);
}

export async function setTaskStatus(
  id: string,
  status: StudyTask["status"],
): Promise<void> {
  await db.tasks.update(id, { status });
}

export async function deferTask(id: string, toDate: ISODate): Promise<void> {
  await db.tasks.update(id, { status: "aplazada", plannedDate: toDate });
}

export async function toggleTaskLock(id: string, locked: boolean): Promise<void> {
  await db.tasks.update(id, { locked });
}

/** Move a task to another day, keeping it active (used from the calendar). */
export async function moveTask(id: string, toDate: ISODate): Promise<void> {
  await db.tasks.update(id, { plannedDate: toDate, status: "pendiente" });
}

export async function deleteTask(id: string): Promise<void> {
  await db.tasks.delete(id);
}

/**
 * "Me he quedado atrás": build a distributed recovery plan instead of piling
 * everything on one day. Protects current topics, spreads overdue reviews over
 * several days, and never exceeds a light daily budget.
 */
export interface RecoveryResult {
  overdueReviews: number;
  openErrors: number;
  untouched: number;
  daysPlanned: number;
}

export async function planRecovery(): Promise<RecoveryResult> {
  const today = todayISO();
  const [reviews, errors, topics] = await Promise.all([
    db.reviews.toArray(),
    db.errors.toArray(),
    db.topics.toArray(),
  ]);
  const overdue = reviews.filter(
    (r) => !r.completedAt && r.scheduledAt < today,
  );
  const openErrors = errors.filter((e) => e.status !== "resuelto");
  const untouched = topics.filter(
    (t) =>
      ["Recibido", "Parcial", "Test disponible", "Actualizado"].includes(t.materialStatus) &&
      t.status === "No iniciado",
  );

  // Spread overdue reviews across the next few days (max ~3 per day), so the
  // catch-up is realistic instead of an impossible single-day load.
  const perDay = 3;
  const days = Math.max(1, Math.ceil(overdue.length / perDay));
  overdue
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
    .forEach((r, i) => {
      const dayOffset = Math.floor(i / perDay);
      const to = todayISO(new Date(Date.now() + dayOffset * 86400000));
      // Reschedule so the bandeja shows a spread, not a wall of "vencido".
      void db.reviews.update(r.id, { scheduledAt: to });
    });

  // Today itself becomes a minimal, protected day.
  await generatePlanForDay(today, "minimo");

  return {
    overdueReviews: overdue.length,
    openErrors: openErrors.length,
    untouched: untouched.length,
    daysPlanned: days,
  };
}

// ---- Sessions ----
export interface SessionClose {
  actualMinutes: number;
  completedPercentage: number;
  focusScore: number;
  energy: number;
  difficulty: number;
  recall: number;
  notes: string;
}

export async function startSession(task: StudyTask): Promise<string> {
  const id = `session-${Date.now()}`;
  const session: StudySession = {
    id,
    taskId: task.id,
    topicId: task.topicId,
    subtopicId: task.subtopicId,
    type: task.type,
    title: task.title,
    startedAt: new Date().toISOString(),
    endedAt: null,
    plannedMinutes: task.plannedMinutes,
    actualMinutes: 0,
    focusScore: null,
    energy: null,
    difficulty: null,
    completedPercentage: null,
    recall: null,
    notes: "",
  };
  await db.sessions.put(session);
  await db.tasks.update(task.id, { status: "en-curso" });
  return id;
}

/** The most recent session that was started but never closed (survives reload). */
export async function getActiveSession(): Promise<StudySession | undefined> {
  const open = (await db.sessions.toArray()).filter((s) => !s.endedAt);
  return open.sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
}

/** Abandon an in-progress session without recording progress. */
export async function discardSession(sessionId: string): Promise<void> {
  const session = await db.sessions.get(sessionId);
  if (!session) return;
  await db.sessions.delete(sessionId);
  if (session.taskId) {
    const task = await db.tasks.get(session.taskId);
    if (task && task.status === "en-curso") {
      await db.tasks.update(task.id, { status: "pendiente" });
    }
  }
}

/** Close a session, record minutes and update the topic's progress + review. */
export async function closeSession(
  sessionId: string,
  close: SessionClose,
): Promise<void> {
  const session = await db.sessions.get(sessionId);
  if (!session) return;
  const today = todayISO();

  await db.sessions.update(sessionId, {
    endedAt: new Date().toISOString(),
    actualMinutes: close.actualMinutes,
    completedPercentage: close.completedPercentage,
    focusScore: close.focusScore,
    energy: close.energy,
    difficulty: close.difficulty,
    recall: close.recall,
    notes: close.notes,
  });

  if (session.taskId) {
    const task = await db.tasks.get(session.taskId);
    if (task) {
      const done = close.completedPercentage >= 80;
      await db.tasks.update(task.id, {
        actualMinutes: task.actualMinutes + close.actualMinutes,
        status: done ? "completada" : "en-curso",
      });
    }
  }

  if (session.topicId) {
    await updateTopicProgress(session.topicId, close, today);
  }
}

async function updateTopicProgress(
  topicId: string,
  close: SessionClose,
  today: ISODate,
): Promise<void> {
  const topic = await db.topics.get(topicId);
  if (!topic) return;
  const settings = await getSettings();
  const newMastery = Math.round(
    Math.max(topic.mastery, Math.min(100, close.recall * 20)),
  );

  // Schedule / advance the topic-level review.
  const outcome = topic.nextReviewAt
    ? scheduleAfterReview(topic.reviewStage, close.recall, today, settings.reviewIntervals)
    : scheduleFirstReview(today, settings.reviewIntervals);

  const patch: Partial<Topic> = {
    accumulatedMinutes: topic.accumulatedMinutes + close.actualMinutes,
    lastStudyAt: today,
    mastery: newMastery,
    reviewStage: outcome.stageAfter,
    nextReviewAt: outcome.nextReviewAt,
  };
  if (topic.status === "No iniciado") patch.status = "1.ª vuelta";
  else if (newMastery >= 80 && topic.status !== "Consolidado")
    patch.status = "En repaso";
  await db.topics.update(topicId, patch);

  // Maintain a single pending review row so it surfaces in the bandeja.
  await upsertPendingReview(topicId, outcome.stageAfter, outcome.nextReviewAt);
}

/** Ensure exactly one pending Review row exists for a topic, at the given date. */
async function upsertPendingReview(
  topicId: string,
  stageBefore: number,
  scheduledAt: ISODate,
): Promise<void> {
  const existing = await db.reviews.where("topicId").equals(topicId).toArray();
  const stalePending = existing.filter((r) => !r.completedAt);
  await db.reviews.bulkDelete(stalePending.map((r) => r.id));
  const review: Review = {
    id: `review-${topicId}-${Date.now()}`,
    topicId,
    subtopicId: null,
    scheduledAt,
    completedAt: null,
    reviewType: pickReviewType(stageBefore),
    recallScore: null,
    stageBefore,
    stageAfter: null,
    nextReviewAt: null,
  };
  await db.reviews.put(review);
}

/**
 * Review a topic on demand (from the Reviews screen), grading recall 0..5.
 * Works whether or not a pending review row already exists.
 */
export async function reviewTopicNow(
  topicId: string,
  recall: number,
): Promise<void> {
  const topic = await db.topics.get(topicId);
  if (!topic) return;
  const settings = await getSettings();
  const today = todayISO();
  const outcome = scheduleAfterReview(
    topic.reviewStage,
    recall,
    today,
    settings.reviewIntervals,
  );
  // Close any pending review row for this topic as completed today.
  const pending = (await db.reviews.where("topicId").equals(topicId).toArray())
    .filter((r) => !r.completedAt)
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))[0];
  if (pending) {
    await db.reviews.update(pending.id, {
      completedAt: today,
      recallScore: recall,
      stageAfter: outcome.stageAfter,
      nextReviewAt: outcome.nextReviewAt,
    });
  } else {
    await db.reviews.put({
      id: `review-${topicId}-${Date.now()}-done`,
      topicId,
      subtopicId: null,
      scheduledAt: today,
      completedAt: today,
      reviewType: pickReviewType(topic.reviewStage),
      recallScore: recall,
      stageBefore: topic.reviewStage,
      stageAfter: outcome.stageAfter,
      nextReviewAt: outcome.nextReviewAt,
    });
  }
  await upsertPendingReview(topicId, outcome.stageAfter, outcome.nextReviewAt);
  const mastery = Math.max(topic.mastery >= 80 ? 60 : 0, Math.min(100, recall * 20));
  await db.topics.update(topicId, {
    reviewStage: outcome.stageAfter,
    nextReviewAt: outcome.nextReviewAt,
    lastStudyAt: today,
    mastery: Math.max(topic.mastery, mastery),
    status:
      outcome.stageAfter >= 4 && topic.status !== "Consolidado"
        ? "Consolidado"
        : topic.status === "No iniciado"
          ? "En repaso"
          : topic.status,
  });
}

// ---- Reviews ----
export async function completeReview(
  reviewId: string,
  recall: number,
): Promise<void> {
  const review = await db.reviews.get(reviewId);
  if (!review) return;
  const settings = await getSettings();
  const today = todayISO();
  const outcome = scheduleAfterReview(
    review.stageBefore,
    recall,
    today,
    settings.reviewIntervals,
  );
  await db.reviews.update(reviewId, {
    completedAt: today,
    recallScore: recall,
    stageAfter: outcome.stageAfter,
    nextReviewAt: outcome.nextReviewAt,
  });
  // Chain the next review with a rotated review type.
  await db.reviews.put({
    id: `review-${review.topicId}-${Date.now()}`,
    topicId: review.topicId,
    subtopicId: review.subtopicId,
    scheduledAt: outcome.nextReviewAt,
    completedAt: null,
    reviewType: pickReviewType(outcome.stageAfter),
    recallScore: null,
    stageBefore: outcome.stageAfter,
    stageAfter: null,
    nextReviewAt: null,
  });
  const topic = await db.topics.get(review.topicId);
  await db.topics.update(review.topicId, {
    reviewStage: outcome.stageAfter,
    nextReviewAt: outcome.nextReviewAt,
    lastStudyAt: today,
    mastery: Math.max(topic?.mastery ?? 0, Math.min(100, recall * 20)),
    status:
      outcome.stageAfter >= 4 && topic && topic.status !== "Consolidado"
        ? "Consolidado"
        : topic?.status ?? "En repaso",
  });
}

// ---- Test attempts ----
export async function saveAttempt(
  attempt: TestAttempt,
  questions: Question[],
): Promise<void> {
  await db.transaction("rw", [db.attempts, db.tests, db.questions], async () => {
    await db.attempts.put(attempt);
    await db.tests.update(attempt.testId, { status: "corregido" });
    const byId = new Map(questions.map((q) => [q.id, q]));
    for (const a of attempt.answers) {
      const q = byId.get(a.questionId);
      if (!q) continue;
      await db.questions.update(q.id, {
        timesAnswered: q.timesAnswered + 1,
        timesCorrect: q.timesCorrect + (a.result === "Correcta" ? 1 : 0),
        timesIncorrect: q.timesIncorrect + (a.result === "Error" ? 1 : 0),
        lastAnsweredAt: todayISO(),
      });
    }
  });
}

// ---- Errors ----
export async function createError(input: {
  questionId: string | null;
  topicId: string | null;
  statement: string;
  selectedAnswer: string;
  correctAnswer: string;
  cause: ErrorCause | null;
  severity: ErrorSeverity;
  correctionRule?: string;
}): Promise<void> {
  const today = todayISO();
  // Detect recurrence: same topic + same cause already logged.
  const prior = await db.errors
    .where("topicId")
    .equals(input.topicId ?? "")
    .toArray();
  const recurrent =
    input.cause != null &&
    prior.filter((e) => e.cause === input.cause).length >= 2;

  const entry: ErrorEntry = {
    id: `error-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    questionId: input.questionId,
    topicId: input.topicId,
    subtopicId: null,
    statement: input.statement,
    selectedAnswer: input.selectedAnswer,
    correctAnswer: input.correctAnswer,
    cause: input.cause,
    correctionRule: input.correctionRule ?? "",
    severity: input.severity,
    status: recurrent ? "recurrente" : "nuevo",
    repetitions: 0,
    createdAt: today,
    nextReviewAt: nextErrorReview(input.severity, today),
    notes: "",
  };
  await db.errors.put(entry);
}

export async function markErrorRepeated(
  id: string,
  correct: boolean,
): Promise<void> {
  const e = await db.errors.get(id);
  if (!e) return;
  const today = todayISO();
  if (correct) {
    const status = e.repetitions + 1 >= 2 ? "resuelto" : "comprendido";
    await db.errors.update(id, {
      repetitions: e.repetitions + 1,
      status,
      nextReviewAt: status === "resuelto" ? null : nextErrorReview(e.severity, today),
    });
  } else {
    await db.errors.update(id, {
      repetitions: e.repetitions + 1,
      status: "repetido",
      nextReviewAt: nextErrorReview(e.severity, today),
    });
  }
}

export async function updateErrorStatus(
  id: string,
  status: ErrorEntry["status"],
): Promise<void> {
  await db.errors.update(id, { status });
}

// ---- Weekly plan ----
export async function getActiveWeeklyPlan(): Promise<WeeklyPlan | undefined> {
  const plans = await db.weeklyPlans.where("status").equals("activa").toArray();
  return plans.sort((a, b) => b.startDate.localeCompare(a.startDate))[0];
}

export async function saveWeeklyPlan(plan: WeeklyPlan): Promise<void> {
  // Close previous active plans.
  const active = await db.weeklyPlans.where("status").equals("activa").toArray();
  for (const p of active) {
    if (p.id !== plan.id) await db.weeklyPlans.update(p.id, { status: "cerrada" });
  }
  await db.weeklyPlans.put(plan);
}

// ---- Check-in ----
export async function saveCheckin(input: {
  date: ISODate;
  availabilityMinutes: number;
  energy: number;
  fatigue: number;
  focus: number;
  constraints: string;
  preferredDayType: DayType;
  eveningNote?: string;
  tomorrowFirstStep?: string;
}): Promise<void> {
  const existing = await db.checkins.get(input.date);
  await db.checkins.put({
    date: input.date,
    availabilityMinutes: input.availabilityMinutes,
    energy: input.energy,
    fatigue: input.fatigue,
    focus: input.focus,
    constraints: input.constraints,
    preferredDayType: input.preferredDayType,
    eveningNote: input.eveningNote ?? existing?.eveningNote ?? "",
    tomorrowFirstStep: input.tomorrowFirstStep ?? existing?.tomorrowFirstStep ?? "",
  });
}

// ---- Manual material / topic edits ----
export async function addMaterial(name: string, type: string, topicId: string | null): Promise<void> {
  await db.materials.put({
    id: `mat-${Date.now()}`,
    name,
    type,
    date: todayISO(),
    topicId,
    subtopicId: null,
    topicsRaw: topicId ?? "",
    status: "Nuevo",
    origin: "Semanal",
    howTo: "",
    nextAction: "Registrar y decidir cuándo estudiarlo",
    processed: false,
    createdAt: new Date().toISOString(),
  });
}

export async function setMaterialProcessed(id: string, processed: boolean): Promise<void> {
  await db.materials.update(id, { processed });
}

export async function updateTopic(id: string, patch: Partial<Topic>): Promise<void> {
  await db.topics.update(id, patch);
}

export async function createTest(test: Test): Promise<void> {
  await db.tests.put(test);
}

// ---- Study products ----
export async function cycleProductStatus(id: string): Promise<void> {
  const p = await db.products.get(id);
  if (!p) return;
  const order: import("../domain/types").StudyProductStatus[] = [
    "pendiente",
    "iniciado",
    "completado",
    "necesita-revision",
  ];
  const next = order[(order.indexOf(p.status) + 1) % order.length];
  await db.products.update(id, { status: next });
}

export async function addProduct(
  topicId: string,
  type: import("../domain/types").StudyProductType,
  label: string,
): Promise<void> {
  await db.products.put({
    id: `prod-${topicId}-${type}-${Date.now()}`,
    topicId,
    subtopicId: null,
    type,
    label,
    status: "pendiente",
    createdAt: new Date().toISOString(),
  });
}
