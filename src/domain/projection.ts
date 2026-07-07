// Progress projections based on real recorded data (never static estimates).
import type { ISODate, StudySession, Topic } from "./types";
import { diffDays } from "./dates";
import { hasMaterial, isConsolidated } from "./planner";

export interface Projection {
  topicsWithMaterial: number;
  firstPassDone: number; // started at least first pass
  consolidated: number;
  remainingFirstPass: number;
  avgTopicsPerWeek: number;
  weeksToFinishFirstPass: number | null;
  message: string;
}

/**
 * Estimate weeks to finish the first pass of all available topics, using the
 * observed rate of topics advanced per week over the sessions recorded.
 */
export function projectFirstPass(
  topics: Topic[],
  sessions: StudySession[],
  today: ISODate,
): Projection {
  const available = topics.filter(hasMaterial);
  const firstPassDone = available.filter(
    (t) => t.status !== "No iniciado" && t.status !== "Clase pendiente",
  ).length;
  const consolidated = available.filter(isConsolidated).length;
  const remaining = available.length - firstPassDone;

  // Observed rate: distinct topics touched per active week.
  const firstSession = sessions
    .map((s) => s.startedAt.slice(0, 10))
    .sort()[0];
  let weeks = 1;
  if (firstSession) {
    const days = Math.max(1, diffDays(today, firstSession));
    weeks = Math.max(1, days / 7);
  }
  const distinctTopics = new Set(
    sessions.filter((s) => s.topicId).map((s) => s.topicId),
  ).size;
  const avgTopicsPerWeek = round1(distinctTopics / weeks);

  const weeksToFinish =
    avgTopicsPerWeek > 0 ? Math.ceil(remaining / avgTopicsPerWeek) : null;

  const message =
    weeksToFinish == null
      ? "Aún no hay datos suficientes para proyectar. Registra sesiones para estimar tu ritmo."
      : `Con el ritmo actual (${avgTopicsPerWeek} temas/semana), completarás la primera vuelta del material disponible en aproximadamente ${weeksToFinish} semana${weeksToFinish === 1 ? "" : "s"}.`;

  return {
    topicsWithMaterial: available.length,
    firstPassDone,
    consolidated,
    remainingFirstPass: remaining,
    avgTopicsPerWeek,
    weeksToFinishFirstPass: weeksToFinish,
    message,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
