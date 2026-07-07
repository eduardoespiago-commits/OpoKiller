// Read-only derived computations shared by screens.
import type {
  ErrorEntry,
  ISODate,
  Review,
  StudySession,
  StudyTask,
  Test,
  Topic,
} from "./types";
import { diffDays, todayISO } from "./dates";

export function minutesToday(sessions: StudySession[], date: ISODate): number {
  return sessions
    .filter((s) => s.startedAt.slice(0, 10) === date)
    .reduce((sum, s) => sum + s.actualMinutes, 0);
}

export function plannedMinutes(tasks: StudyTask[]): number {
  return tasks
    .filter((t) => t.status !== "aplazada")
    .reduce((s, t) => s + t.plannedMinutes, 0);
}

export function completedMinutes(tasks: StudyTask[]): number {
  return tasks.reduce((s, t) => s + t.actualMinutes, 0);
}

/** Consecutive days up to today with at least one session. */
export function contactStreak(sessions: StudySession[], today: ISODate = todayISO()): number {
  const days = new Set(sessions.map((s) => s.startedAt.slice(0, 10)));
  let streak = 0;
  let cursor = today;
  // Allow today to be empty without breaking a streak that ended yesterday.
  if (!days.has(cursor)) {
    cursor = shift(cursor, -1);
    if (!days.has(cursor)) return 0;
  }
  while (days.has(cursor)) {
    streak++;
    cursor = shift(cursor, -1);
  }
  return streak;
}

function shift(date: ISODate, days: number): ISODate {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function dueReviews(reviews: Review[], today: ISODate): Review[] {
  return reviews
    .filter((r) => !r.completedAt && diffDays(today, r.scheduledAt) >= 0)
    .sort((a, b) => diffDays(today, b.scheduledAt) - diffDays(today, a.scheduledAt));
}

export function openErrors(errors: ErrorEntry[]): ErrorEntry[] {
  return errors.filter((e) => e.status !== "resuelto");
}

export function dueErrors(errors: ErrorEntry[], today: ISODate): ErrorEntry[] {
  return errors.filter(
    (e) => e.status !== "resuelto" && e.nextReviewAt && diffDays(today, e.nextReviewAt) >= 0,
  );
}

export function pendingTests(tests: Test[]): Test[] {
  return tests.filter((t) => t.status !== "corregido");
}

export interface TopicCounts {
  total: number;
  withMaterial: number;
  started: number;
  consolidated: number;
  partial: number;
}

export function topicCounts(topics: Topic[]): TopicCounts {
  const withMat = topics.filter(
    (t) =>
      t.materialStatus === "Recibido" ||
      t.materialStatus === "Parcial" ||
      t.materialStatus === "Test disponible" ||
      t.materialStatus === "Actualizado",
  );
  return {
    total: topics.length,
    withMaterial: withMat.length,
    started: topics.filter((t) => t.status !== "No iniciado").length,
    consolidated: topics.filter((t) => t.status === "Consolidado").length,
    partial: topics.filter((t) => t.materialStatus === "Parcial").length,
  };
}

export interface DailyAlert {
  kind: "danger" | "warn" | "info";
  text: string;
  to?: string;
}

export function dailyAlerts(input: {
  today: ISODate;
  reviews: Review[];
  errors: ErrorEntry[];
  tests: Test[];
  materials: { processed: boolean }[];
  topics: Topic[];
}): DailyAlert[] {
  const alerts: DailyAlert[] = [];
  const dr = dueReviews(input.reviews, input.today);
  const critical = dr.filter((r) => diffDays(input.today, r.scheduledAt) > 7);
  if (critical.length) alerts.push({ kind: "danger", text: `${critical.length} repaso(s) crítico(s) muy vencidos`, to: "/repasos" });
  else if (dr.length) alerts.push({ kind: "warn", text: `${dr.length} repaso(s) vencido(s) hoy`, to: "/repasos" });

  const pt = pendingTests(input.tests);
  if (pt.length) alerts.push({ kind: "info", text: `${pt.length} test pendiente(s) por hacer`, to: "/tests" });

  const de = dueErrors(input.errors, input.today);
  if (de.length) alerts.push({ kind: "warn", text: `${de.length} error(es) por repetir`, to: "/errores" });

  const unprocessed = input.materials.filter((m) => !m.processed).length;
  if (unprocessed) alerts.push({ kind: "info", text: `${unprocessed} material(es) sin procesar`, to: "/materiales" });

  const partial = input.topics.filter((t) => t.materialStatus === "Parcial");
  if (partial.length) alerts.push({ kind: "info", text: `${partial.length} tema(s) parcial(es) por completar`, to: "/temario" });

  return alerts;
}
