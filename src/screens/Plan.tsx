import { useMemo, useState } from "react";
import type { WeeklyPlan } from "../domain/types";
import { startOfWeek, todayISO, formatShort } from "../domain/dates";
import { rankTopics, weeklySplit, type PlanContext } from "../domain/planner";
import { answer, ASSISTANT_QUESTIONS } from "../domain/assistant";
import { saveWeeklyPlan } from "../db/actions";
import {
  useErrors,
  useMaterials,
  useReviews,
  useSettings,
  useTests,
  useTopics,
  useWeeklyPlans,
  useSubtopics,
} from "../hooks/useData";
import { Card, Chip, Stat } from "../ui/components";
import { useToast } from "../ui/toast";

export function Plan() {
  const today = todayISO();
  const settings = useSettings();
  const topics = useTopics();
  const subtopics = useSubtopics();
  const reviews = useReviews();
  const errors = useErrors();
  const tests = useTests();
  const materials = useMaterials();
  const plans = useWeeklyPlans();
  const toast = useToast();
  const [q, setQ] = useState<string>(ASSISTANT_QUESTIONS[0]);

  const split = weeklySplit(settings);
  const activePlan = plans
    .filter((p) => p.status === "activa")
    .sort((a, b) => b.startDate.localeCompare(a.startDate))[0];

  const ctx: PlanContext = useMemo(
    () => ({
      today,
      topics,
      subtopics,
      reviews,
      errors,
      tests,
      settings,
      weeklyCurrentIds: activePlan?.currentTopicIds ?? [],
      weeklyBacklogId: activePlan?.backlogTopicId ?? null,
      dayType: "normal",
    }),
    [today, topics, subtopics, reviews, errors, tests, settings, activePlan],
  );

  const ranked = useMemo(() => rankTopics(ctx), [ctx]);
  const suggestion = useMemo(
    () => answer(q, { today, topics, reviews, errors, materials }),
    [q, today, topics, reviews, errors, materials],
  );

  async function generateWeek() {
    const weekly = ranked.filter((r) => r.isWeekly || !r.isBacklog).slice(0, settings.maxCurrentTopics);
    const backlog = ranked.find((r) => r.isBacklog);
    const start = startOfWeek(today);
    const plan: WeeklyPlan = {
      id: start,
      startDate: start,
      targetHours: settings.weeklyTargetHours,
      currentTopicPct: settings.currentTopicPct,
      backlogPct: settings.backlogPct,
      reviewPct: settings.reviewPct,
      currentTopicIds: weekly.map((w) => w.topic.officialId),
      backlogTopicId: backlog?.topic.officialId ?? null,
      status: "activa",
      createdAt: new Date().toISOString(),
    };
    await saveWeeklyPlan(plan);
    toast("Semana generada");
  }

  return (
    <div>
      <h1>Plan</h1>

      <Card>
        <div className="label" style={{ marginBottom: 6 }}>Asistente de planificación</div>
        <div className="scroll-x" style={{ marginBottom: 10 }}>
          {ASSISTANT_QUESTIONS.map((question) => (
            <button
              key={question}
              className={`btn btn-sm nowrap ${q === question ? "btn-primary" : ""}`}
              onClick={() => setQ(question)}
            >
              {question}
            </button>
          ))}
        </div>
        <div className="card flat" style={{ margin: 0, background: "var(--surface-2)" }}>
          <strong>{suggestion.answer}</strong>
          <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
            {suggestion.bullets.map((b, i) => (
              <li key={i} className="muted" style={{ marginBottom: 3 }}>{b}</li>
            ))}
          </ul>
        </div>
      </Card>

      <Card>
        <div className="between">
          <div className="label">Semana actual</div>
          {activePlan && <Chip variant="ok">Activa desde {formatShort(activePlan.startDate)}</Chip>}
        </div>
        <div className="grid grid-3 mt">
          <Stat label="Objetivo" value={`${settings.weeklyTargetHours} h`} small />
          <Stat label="Actual" value={`${split.currentHours} h`} sub="temas actuales" small />
          <Stat label="Atraso" value={`${split.backlogHours} h`} sub="matrícula" small />
        </div>
        <div className="faint mt">
          Reparto: {Math.round(settings.currentTopicPct * 100)}% actual ·{" "}
          {Math.round(settings.backlogPct * 100)}% atraso ·{" "}
          {Math.round(settings.reviewPct * 100)}% repasos/tests
        </div>
        {activePlan && (
          <div className="row wrap mt">
            {activePlan.currentTopicIds.map((id) => (
              <Chip key={id} variant="primary">{id} actual</Chip>
            ))}
            {activePlan.backlogTopicId && <Chip variant="warn">{activePlan.backlogTopicId} atrasado</Chip>}
          </div>
        )}
        <button className="btn btn-primary mt" onClick={generateWeek}>
          {activePlan ? "Regenerar semana con datos actuales" : "Generar semana"}
        </button>
      </Card>

      <Card>
        <div className="label" style={{ marginBottom: 8 }}>
          Temas candidatos (por prioridad)
        </div>
        <p className="faint" style={{ marginTop: 0 }}>
          El planificador elige máximo {settings.maxCurrentTopics} actuales + {settings.maxBacklogTopics} atrasado.
          Cada uno muestra por qué sube.
        </p>
        {ranked.slice(0, 10).map((r) => (
          <div key={r.topic.officialId} className="task">
            <div className="task-body">
              <div className="row wrap">
                <strong>{r.topic.officialId}</strong>
                <span className="muted" style={{ flex: 1 }}>{shortTitle(r.topic.title)}</span>
                <Chip variant="primary">{Math.round(r.score)} pts</Chip>
              </div>
              <div className="task-meta">
                {r.reasons.length ? r.reasons.join(" · ") : "material disponible"}
              </div>
            </div>
          </div>
        ))}
        {ranked.length === 0 && <p className="faint">No hay temas con material aún.</p>}
      </Card>
    </div>
  );
}

function shortTitle(s: string, n = 60): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
