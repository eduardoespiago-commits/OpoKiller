import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { DayType, StudySession, StudyTask } from "../domain/types";
import { formatHuman, startOfWeek, todayISO } from "../domain/dates";
import { DAY_TYPE_LABEL } from "../domain/planner";
import {
  completedMinutes,
  contactStreak,
  dailyAlerts,
  minutesToday,
  plannedMinutes,
} from "../domain/selectors";
import {
  generatePlanForDay,
  setTaskStatus,
  deferTask,
  discardSession,
  planRecovery,
} from "../db/actions";
import {
  useCheckin,
  useErrors,
  useMaterials,
  useReviews,
  useSessions,
  useTasksForDay,
  useTests,
  useTopics,
} from "../hooks/useData";
import { Bar, Card, Chip, Empty, Sheet, Stat } from "../ui/components";
import { useToast } from "../ui/toast";
import { SessionRunner } from "./SessionRunner";
import { CheckinForm } from "./CheckinForm";

/** Rebuild a minimal task shell so a recovered session can render its runner. */
function taskFromSession(s: StudySession): StudyTask {
  return {
    id: s.taskId ?? `recovered-${s.id}`,
    topicId: s.topicId,
    subtopicId: s.subtopicId,
    type: s.type,
    title: s.title,
    objective: "Continúa la sesión donde la dejaste.",
    expectedOutput: "Completa el objetivo y registra tu progreso.",
    plannedDate: s.startedAt.slice(0, 10),
    plannedMinutes: s.plannedMinutes,
    actualMinutes: s.actualMinutes,
    priority: 0,
    priorityReasons: [],
    status: "en-curso",
    source: "auto",
    locked: false,
    order: 0,
    createdAt: s.startedAt,
  };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const TASK_GROUP_LABEL: Record<string, string> = {
  "materia-nueva": "Materia nueva",
  "primera-vuelta": "Tema actual",
  atrasado: "Tema atrasado",
  repaso: "Repaso",
  test: "Test",
  errores: "Errores",
  cierre: "Cierre",
  recuperacion: "Recuperación",
};

export function Today() {
  const today = todayISO();
  const topics = useTopics();
  const tasks = useTasksForDay(today);
  const sessions = useSessions();
  const reviews = useReviews();
  const errors = useErrors();
  const tests = useTests();
  const materials = useMaterials();
  const checkin = useCheckin(today);
  const toast = useToast();

  const [activeTask, setActiveTask] = useState<StudyTask | null>(null);
  const [resumeSession, setResumeSession] = useState<StudySession | null>(null);
  const [showCheckin, setShowCheckin] = useState(false);
  const [busy, setBusy] = useState(false);

  const openSession = useMemo(
    () => sessions.find((s) => !s.endedAt) ?? null,
    [sessions],
  );

  const sorted = useMemo(
    () => [...tasks].sort((a, b) => a.order - b.order),
    [tasks],
  );
  const activeTasks = sorted.filter((t) => t.status !== "aplazada");
  const priority = activeTasks.find(
    (t) => t.status !== "completada" && t.type !== "recuperacion" && t.type !== "cierre",
  ) ?? activeTasks.find((t) => t.status !== "completada");
  const rest = activeTasks.filter((t) => t.id !== priority?.id);

  const planned = plannedMinutes(activeTasks);
  const doneMin = Math.max(completedMinutes(activeTasks), minutesToday(sessions, today));
  const pct = planned ? Math.min(100, Math.round((doneMin / planned) * 100)) : 0;
  const streak = contactStreak(sessions, today);
  const week = startOfWeek(today);
  const alerts = dailyAlerts({ today, reviews, errors, tests, materials, topics });

  const dayType: DayType = checkin?.preferredDayType ?? "normal";

  async function generate(type: DayType) {
    setBusy(true);
    await generatePlanForDay(today, type);
    setBusy(false);
    toast(`Plan de hoy generado (${DAY_TYPE_LABEL[type]})`);
  }

  async function complete(t: StudyTask) {
    await setTaskStatus(t.id, t.status === "completada" ? "pendiente" : "completada");
  }

  async function defer(t: StudyTask) {
    const tomorrow = todayISO(new Date(Date.now() + 86400000));
    await deferTask(t.id, tomorrow);
    toast("Tarea aplazada a mañana");
  }

  return (
    <div>
      <header className="between" style={{ marginBottom: 14 }}>
        <div>
          <div className="label">{DAY_TYPE_LABEL[dayType]}</div>
          <h1 style={{ margin: 0 }}>{capitalize(formatHuman(today))}</h1>
          <div className="faint">Semana del {formatHuman(week).replace(/^\w+, /, "")}</div>
        </div>
        <Link to="/estadisticas" className="chip primary" style={{ textDecoration: "none" }}>
          🔥 {streak} d
        </Link>
      </header>

      <Card hero>
        <div className="grid grid-3">
          <Stat label="Planificado" value={`${Math.round(planned / 60 * 10) / 10} h`} small />
          <Stat label="Completado" value={`${Math.round(doneMin / 60 * 10) / 10} h`} small />
          <Stat label="Progreso" value={`${pct}%`} small />
        </div>
        <div style={{ marginTop: 12 }}>
          <Bar value={pct} />
        </div>
      </Card>

      {openSession && !activeTask && (
        <Card>
          <div className="between">
            <div>
              <div className="label">Sesión en curso</div>
              <strong>{openSession.title}</strong>
              <div className="faint">Se quedó abierta. Puedes reanudarla o descartarla.</div>
            </div>
          </div>
          <div className="btn-row mt">
            <button
              className="btn btn-primary"
              onClick={() => {
                setResumeSession(openSession);
                setActiveTask(taskFromSession(openSession));
              }}
            >
              ▶ Reanudar
            </button>
            <button
              className="btn btn-ghost"
              onClick={async () => {
                await discardSession(openSession.id);
                toast("Sesión descartada");
              }}
            >
              Descartar
            </button>
          </div>
        </Card>
      )}

      {alerts.length > 0 && (
        <Card className="flat">
          <div className="label" style={{ marginBottom: 8 }}>Avisos</div>
          <div className="stack">
            {alerts.map((a, i) => (
              <Link
                key={i}
                to={a.to ?? "/hoy"}
                style={{ textDecoration: "none" }}
              >
                <Chip variant={a.kind === "danger" ? "danger" : a.kind === "warn" ? "warn" : "primary"}>
                  {a.text} →
                </Chip>
              </Link>
            ))}
          </div>
        </Card>
      )}

      {activeTasks.length === 0 ? (
        <Card>
          <Empty
            icon="🧭"
            title="No hay plan para hoy"
            hint="Genera tu plan del día en un toque."
          />
          <div className="btn-row">
            <button className="btn btn-primary" onClick={() => generate("normal")} disabled={busy}>
              Generar día normal
            </button>
            <button className="btn" onClick={() => generate("minimo")} disabled={busy}>
              Solo lo mínimo
            </button>
          </div>
        </Card>
      ) : (
        <>
          {priority && (
            <Card className="card-priority">
              <span className="label" style={{ color: "var(--accent)" }}>Prioridad principal</span>
              <h2 style={{ margin: "6px 0" }}>{priority.title}</h2>
              {priority.priorityReasons.length > 0 && (
                <div className="faint" style={{ marginTop: -2, marginBottom: 4 }}>
                  Se prioriza porque: {priority.priorityReasons.join(", ")}.
                </div>
              )}
              <p className="muted" style={{ margin: "2px 0" }}>{priority.objective}</p>
              <p className="faint">
                <strong>Resultado:</strong> {priority.expectedOutput}
              </p>
              <div className="row wrap" style={{ margin: "8px 0" }}>
                <Chip variant="primary">⏱️ {priority.plannedMinutes} min</Chip>
                {priority.topicId && <Chip>{priority.topicId}</Chip>}
                <Chip>{TASK_GROUP_LABEL[priority.type] ?? priority.type}</Chip>
              </div>
              <button
                className="btn btn-primary btn-lg"
                onClick={() => { setResumeSession(null); setActiveTask(priority); }}
              >
                ▶ Empezar sesión
              </button>
            </Card>
          )}

          <Card>
            <div className="label" style={{ marginBottom: 8 }}>Resto del día</div>
            {rest.length === 0 && <p className="faint">Nada más por hoy. 👏</p>}
            {rest.map((t) => (
              <div key={t.id} className={`task ${t.status === "completada" ? "done" : ""}`}>
                <button
                  className={`checkbtn ${t.status === "completada" ? "checked" : ""}`}
                  aria-label="Completar tarea"
                  onClick={() => complete(t)}
                >
                  {t.status === "completada" ? "✔" : ""}
                </button>
                <div className="task-body">
                  <div className="row">
                    <span className={`dot t-${t.type}`} />
                    <span className="task-title">{t.title}</span>
                  </div>
                  <div className="task-meta">
                    {t.plannedMinutes} min · {t.expectedOutput}
                  </div>
                  <div className="btn-row" style={{ marginTop: 8 }}>
                    <button className="btn btn-sm" onClick={() => { setResumeSession(null); setActiveTask(t); }}>▶ Iniciar</button>
                    <button className="btn btn-sm btn-ghost" onClick={() => defer(t)}>Aplazar</button>
                  </div>
                </div>
              </div>
            ))}
          </Card>
        </>
      )}

      <Card className="flat">
        <div className="label" style={{ marginBottom: 8 }}>Acciones rápidas</div>
        <div className="btn-row">
          <button className="btn btn-sm" onClick={() => setShowCheckin(true)}>🗓️ Check-in del día</button>
          <button className="btn btn-sm" onClick={() => generate("minimo")} disabled={busy}>🌙 Solo lo mínimo</button>
          <button className="btn btn-sm" onClick={() => generate("normal")} disabled={busy}>🔄 Regenerar plan</button>
          <button className="btn btn-sm" onClick={() => generate("intensivo")} disabled={busy}>⚡ Día intensivo</button>
          <button
            className="btn btn-sm"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const r = await planRecovery();
              setBusy(false);
              toast(
                `Recuperación: ${r.overdueReviews} repasos repartidos en ${r.daysPlanned} día(s). Hoy queda mínimo.`,
              );
            }}
          >
            🆘 Me he quedado atrás
          </button>
          <Link className="btn btn-sm" to="/tests">📝 Test rápido</Link>
          <Link className="btn btn-sm" to="/errores">⚠️ Revisar errores</Link>
        </div>
      </Card>

      {activeTask && (
        <SessionRunner
          task={activeTask}
          resume={resumeSession ?? undefined}
          onDone={() => {
            setActiveTask(null);
            setResumeSession(null);
          }}
        />
      )}
      {showCheckin && (
        <Sheet title="Check-in del día" onClose={() => setShowCheckin(false)}>
          <CheckinForm
            date={today}
            onSaved={(type) => {
              setShowCheckin(false);
              generate(type);
            }}
          />
        </Sheet>
      )}
    </div>
  );
}
