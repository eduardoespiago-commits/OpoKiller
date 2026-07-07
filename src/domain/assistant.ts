// A rule-based study assistant. Answers only from recorded data and always
// explains the reason behind each recommendation.
import type { ErrorEntry, ISODate, Material, Review, Topic } from "./types";
import { diffDays } from "./dates";
import { hasMaterial, isConsolidated } from "./planner";

export interface AssistantAnswer {
  question: string;
  answer: string;
  bullets: string[];
}

export interface AssistantContext {
  today: ISODate;
  topics: Topic[];
  reviews: Review[];
  errors: ErrorEntry[];
  materials: Material[];
}

export const ASSISTANT_QUESTIONS = [
  "¿Qué estudio hoy?",
  "¿Estoy atrasado?",
  "¿Qué temas tengo sin tocar?",
  "¿Qué repasos se están acumulando?",
  "¿Qué material recibí y no he procesado?",
  "¿Qué puedo hacer si solo tengo una hora?",
] as const;

export function answer(q: string, ctx: AssistantContext): AssistantAnswer {
  switch (q) {
    case "¿Qué estudio hoy?":
      return whatToday(ctx);
    case "¿Estoy atrasado?":
      return amIBehind(ctx);
    case "¿Qué temas tengo sin tocar?":
      return untouched(ctx);
    case "¿Qué repasos se están acumulando?":
      return dueReviews(ctx);
    case "¿Qué material recibí y no he procesado?":
      return unprocessed(ctx);
    case "¿Qué puedo hacer si solo tengo una hora?":
      return oneHour(ctx);
    default:
      return { question: q, answer: "No tengo datos para responder a eso.", bullets: [] };
  }
}

function whatToday(ctx: AssistantContext): AssistantAnswer {
  const candidates = ctx.topics
    .filter(hasMaterial)
    .filter((t) => !isConsolidated(t))
    .sort((a, b) => rank(b) - rank(a))
    .slice(0, 3);
  const bullets = candidates.map(
    (t) =>
      `${t.officialId} — ${short(t.title)} · ${reasonFor(t)}`,
  );
  return {
    question: "¿Qué estudio hoy?",
    answer: candidates.length
      ? "Estas son tus prioridades de hoy, en orden:"
      : "No hay temas con material disponible por trabajar hoy.",
    bullets,
  };
}

function amIBehind(ctx: AssistantContext): AssistantAnswer {
  const overdueReviews = ctx.reviews.filter(
    (r) => !r.completedAt && diffDays(ctx.today, r.scheduledAt) > 0,
  ).length;
  const openErrors = ctx.errors.filter((e) => e.status !== "resuelto").length;
  const partial = ctx.topics.filter((t) => t.materialStatus === "Parcial").length;
  const behind = overdueReviews > 2 || openErrors > 10;
  return {
    question: "¿Estoy atrasado?",
    answer: behind
      ? "Vas algo justo: prioriza recuperar antes de abrir temas nuevos."
      : "Vas al día. Mantén el ritmo y no abras demasiados frentes.",
    bullets: [
      `${overdueReviews} repaso(s) vencido(s).`,
      `${openErrors} error(es) sin resolver.`,
      `${partial} tema(s) parcial(es) por completar.`,
    ],
  };
}

function untouched(ctx: AssistantContext): AssistantAnswer {
  const list = ctx.topics.filter(
    (t) => hasMaterial(t) && t.status === "No iniciado",
  );
  return {
    question: "¿Qué temas tengo sin tocar?",
    answer: list.length
      ? `Tienes ${list.length} tema(s) con material y sin empezar:`
      : "No hay temas con material sin empezar.",
    bullets: list.slice(0, 12).map((t) => `${t.officialId} — ${short(t.title)}`),
  };
}

function dueReviews(ctx: AssistantContext): AssistantAnswer {
  const due = ctx.reviews
    .filter((r) => !r.completedAt && diffDays(ctx.today, r.scheduledAt) >= 0)
    .sort((a, b) => diffDays(ctx.today, b.scheduledAt) - diffDays(ctx.today, a.scheduledAt));
  return {
    question: "¿Qué repasos se están acumulando?",
    answer: due.length
      ? `${due.length} repaso(s) vencido(s), del más urgente al menos:`
      : "No tienes repasos vencidos ahora mismo.",
    bullets: due.slice(0, 10).map((r) => {
      const overdue = diffDays(ctx.today, r.scheduledAt);
      return `${r.topicId} · ${overdue === 0 ? "vence hoy" : `vencido ${overdue} d`}`;
    }),
  };
}

function unprocessed(ctx: AssistantContext): AssistantAnswer {
  const list = ctx.materials.filter((m) => !m.processed);
  return {
    question: "¿Qué material recibí y no he procesado?",
    answer: list.length
      ? `${list.length} material(es) por procesar:`
      : "Todo el material está procesado.",
    bullets: list.slice(0, 12).map((m) => `${m.name} — ${m.nextAction || "revisar"}`),
  };
}

function oneHour(ctx: AssistantContext): AssistantAnswer {
  const top = ctx.topics
    .filter(hasMaterial)
    .filter((t) => !isConsolidated(t))
    .sort((a, b) => rank(b) - rank(a))[0];
  const overdueErrors = ctx.errors.filter(
    (e) => e.status !== "resuelto" && e.nextReviewAt && diffDays(ctx.today, e.nextReviewAt) >= 0,
  ).length;
  return {
    question: "¿Qué puedo hacer si solo tengo una hora?",
    answer: "Plan de 60 minutos de máximo impacto:",
    bullets: [
      "10 min · recuperación en hoja en blanco.",
      top ? `35 min · ${top.officialId} (${reasonFor(top)}).` : "35 min · tema prioritario.",
      overdueErrors > 0 ? `10 min · repetir ${overdueErrors} error(es) vencido(s).` : "10 min · 10 preguntas de repaso.",
      "5 min · cierre y primer paso de mañana.",
    ],
  };
}

function rank(t: Topic): number {
  let s = 0;
  if (t.priority === "Alta") s += 40;
  else if (t.priority === "Media") s += 15;
  if (t.materialStatus === "Parcial") s += 15;
  if (t.status !== "No iniciado") s += 10;
  if (t.mastery < 40) s += 15;
  return s;
}

function reasonFor(t: Topic): string {
  const r: string[] = [];
  if (t.priority === "Alta") r.push("prioridad alta");
  if (t.materialStatus === "Parcial") r.push("parcial");
  if (t.status !== "No iniciado" && t.status !== "Consolidado") r.push("ya empezado");
  if (t.mastery < 40) r.push("dominio bajo");
  return r.length ? r.join(", ") : "material disponible";
}

function short(s: string, n = 70): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
