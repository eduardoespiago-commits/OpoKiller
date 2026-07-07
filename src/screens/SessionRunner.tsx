import { useEffect, useRef, useState } from "react";
import type { StudySession, StudyTask } from "../domain/types";
import { closeSession, startSession, type SessionClose } from "../db/actions";
import { useSettings } from "../hooks/useData";
import { notify } from "../db/notifications";
import { Rating, Sheet } from "../ui/components";
import { useToast } from "../ui/toast";

type Phase = "prep" | "running" | "closing";

export function SessionRunner({
  task,
  resume,
  onDone,
}: {
  task: StudyTask;
  resume?: StudySession;
  onDone: () => void;
}) {
  const settings = useSettings();
  const toast = useToast();
  const [phase, setPhase] = useState<Phase>(resume ? "running" : "prep");
  const [sessionId, setSessionId] = useState<string | null>(resume?.id ?? null);
  const [focusMinutes, setFocusMinutes] = useState(
    Math.min((resume?.plannedMinutes || task.plannedMinutes) || settings.pomodoroPreset, 60),
  );
  const [secondsLeft, setSecondsLeft] = useState(focusMinutes * 60);
  const [paused, setPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number>(0);
  const rangRef = useRef(false);

  // Resume a session that survived a reload: restore elapsed time from startedAt.
  useEffect(() => {
    if (!resume) return;
    const started = new Date(resume.startedAt).getTime();
    startRef.current = started;
    const elapsedSec = Math.round((Date.now() - started) / 1000);
    setElapsed(elapsedSec);
    setSecondsLeft(Math.max(0, focusMinutes * 60 - elapsedSec));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close-form state
  const [pct, setPct] = useState(70);
  const [recall, setRecall] = useState<number | null>(3);
  const [difficulty, setDifficulty] = useState<number | null>(3);
  const [focus, setFocus] = useState<number | null>(4);
  const [energy, setEnergy] = useState<number | null>(3);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (phase !== "running" || paused) return;
    const id = window.setInterval(() => {
      setSecondsLeft((s) => {
        const next = Math.max(0, s - 1);
        if (next === 0 && !rangRef.current) {
          rangRef.current = true;
          notify("Tiempo cumplido", `${task.title}. Termina y registra tu sesión.`);
        }
        return next;
      });
      setElapsed(() => Math.round((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, [phase, paused, task.title]);

  async function begin() {
    const id = await startSession(task);
    setSessionId(id);
    setSecondsLeft(focusMinutes * 60);
    startRef.current = Date.now();
    setPhase("running");
  }

  function goClose() {
    const actual = Math.max(1, Math.round(elapsed / 60) || focusMinutes);
    setPct(70);
    setPhase("closing");
    // seed actual minutes into the field
    actualRef.current = actual;
    setActualMinutes(actual);
  }

  const actualRef = useRef(focusMinutes);
  const [actualMinutes, setActualMinutes] = useState(focusMinutes);

  async function finish() {
    if (!sessionId) return;
    const payload: SessionClose = {
      actualMinutes,
      completedPercentage: pct,
      focusScore: focus ?? 3,
      energy: energy ?? 3,
      difficulty: difficulty ?? 3,
      recall: recall ?? 3,
      notes,
    };
    await closeSession(sessionId, payload);
    toast(pct >= 80 ? "Sesión completada ✔" : "Sesión registrada");
    onDone();
  }

  if (phase === "prep") {
    return (
      <Sheet title="Preparar sesión" onClose={onDone}>
        <div className="task-title" style={{ fontSize: "1.1rem", fontWeight: 700 }}>
          {task.title}
        </div>
        <p className="muted" style={{ marginTop: 6 }}>
          <strong>Objetivo:</strong> {task.objective}
        </p>
        <p className="muted">
          <strong>Resultado esperado:</strong> {task.expectedOutput}
        </p>
        <label className="field">
          <span className="label">Duración de foco (min)</span>
          <div className="seg" style={{ marginTop: 4 }}>
            {[25, 40, 45, 50, 60].map((m) => (
              <button
                key={m}
                className={focusMinutes === m ? "active" : ""}
                onClick={() => setFocusMinutes(m)}
              >
                {m}
              </button>
            ))}
          </div>
        </label>
        <button className="btn btn-primary btn-lg mt" onClick={begin}>
          ▶ Empezar {focusMinutes} min
        </button>
      </Sheet>
    );
  }

  if (phase === "running") {
    const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
    const ss = String(secondsLeft % 60).padStart(2, "0");
    const rang = secondsLeft === 0;
    return (
      <div className="focus-screen">
        <div className="label" style={{ marginBottom: 4 }}>
          {rang ? "Tiempo cumplido" : paused ? "En pausa" : "En concentración"}
        </div>
        <div className="focus-timer" style={{ color: rang ? "var(--accent)" : undefined }}>
          {mm}:{ss}
        </div>
        <div className="focus-task mt">{task.title}</div>
        <div className="focus-obj">{task.expectedOutput}</div>
        <div className="btn-row mt" style={{ justifyContent: "center" }}>
          <button className="btn" onClick={() => setPaused((p) => !p)}>
            {paused ? "▶ Reanudar" : "⏸ Pausa"}
          </button>
          <button className="btn btn-primary" onClick={goClose}>
            ✔ Terminar
          </button>
        </div>
        <div className="faint mt">Tiempo real: {Math.round(elapsed / 60)} min</div>
      </div>
    );
  }

  return (
    <Sheet
      title="Cerrar sesión"
      onClose={goClose}
      footer={
        <button className="btn btn-primary" style={{ flex: 1 }} onClick={finish}>
          Guardar y actualizar progreso
        </button>
      }
    >
      <label className="field">
        <span className="label">Minutos reales</span>
        <input
          type="number"
          min={1}
          value={actualMinutes}
          onChange={(e) => setActualMinutes(Number(e.target.value))}
        />
      </label>
      <label className="field">
        <span className="label">¿Qué porcentaje completaste? ({pct}%)</span>
        <input
          type="range"
          min={0}
          max={100}
          step={10}
          value={pct}
          onChange={(e) => setPct(Number(e.target.value))}
        />
      </label>
      <div className="field">
        <span className="label">Dominio (¿cuánto recordabas sin mirar?)</span>
        <Rating value={recall} onChange={setRecall} labels={["Nada", "Todo"]} />
      </div>
      <div className="grid grid-3 mt">
        <div>
          <span className="label">Dificultad</span>
          <Rating value={difficulty} onChange={setDifficulty} max={5} />
        </div>
      </div>
      <div className="grid grid-2 mt">
        <div>
          <span className="label">Concentración</span>
          <Rating value={focus} onChange={setFocus} max={5} />
        </div>
        <div>
          <span className="label">Energía</span>
          <Rating value={energy} onChange={setEnergy} max={5} />
        </div>
      </div>
      <label className="field mt">
        <span className="label">¿Qué quedó pendiente? / notas</span>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
    </Sheet>
  );
}
