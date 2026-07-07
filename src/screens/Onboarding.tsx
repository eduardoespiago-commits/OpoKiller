import { useState } from "react";
import type { DayType } from "../domain/types";
import { startOfWeek, todayISO } from "../domain/dates";
import { generatePlanForDay, saveSettings, saveWeeklyPlan } from "../db/actions";
import { rankTopics } from "../domain/planner";
import { db } from "../db/db";
import { getSettings } from "../db/actions";
import { useSettings, useTopics } from "../hooks/useData";
import { Card } from "../ui/components";
import { useToast } from "../ui/toast";
import { ExcelImport } from "./ExcelImport";

export function Onboarding() {
  const settings = useSettings();
  const toast = useToast();
  const topics = useTopics();
  const [step, setStep] = useState(0);
  const [hours, setHours] = useState(settings.weeklyTargetHours);
  const [pomodoro, setPomodoro] = useState(settings.pomodoroPreset);
  const [busy, setBusy] = useState(false);

  const withMaterial = topics.filter((t) =>
    ["Recibido", "Parcial", "Test disponible", "Actualizado"].includes(t.materialStatus),
  );
  const partial = topics.filter((t) => t.materialStatus === "Parcial");

  async function finish() {
    setBusy(true);
    await saveSettings({ weeklyTargetHours: hours, pomodoroPreset: pomodoro, onboarded: true });

    // Generate the first weekly plan + today's plan.
    const s = await getSettings();
    const ctx = {
      today: todayISO(),
      topics: await db.topics.toArray(),
      subtopics: await db.subtopics.toArray(),
      reviews: [],
      errors: [],
      tests: await db.tests.toArray(),
      settings: s,
      weeklyCurrentIds: [],
      weeklyBacklogId: null,
      dayType: "normal" as DayType,
    };
    const ranked = rankTopics(ctx);
    const weekly = ranked.filter((r) => r.isWeekly || !r.isBacklog).slice(0, s.maxCurrentTopics);
    const backlog = ranked.find((r) => r.isBacklog);
    const start = startOfWeek(todayISO());
    await saveWeeklyPlan({
      id: start,
      startDate: start,
      targetHours: s.weeklyTargetHours,
      currentTopicPct: s.currentTopicPct,
      backlogPct: s.backlogPct,
      reviewPct: s.reviewPct,
      currentTopicIds: weekly.map((w) => w.topic.officialId),
      backlogTopicId: backlog?.topic.officialId ?? null,
      status: "activa",
      createdAt: new Date().toISOString(),
    });
    await generatePlanForDay(todayISO(), "normal");
    // No setBusy(false): the app will re-render into the main shell.
  }

  const steps = [
    <Card key="0">
      <h1>OpoKiller</h1>
      <p className="muted">
        Tu sistema de estudio para las oposiciones de <strong>Veterinarios de Administración Sanitaria de la DGA (A1)</strong> — convocatoria 25/0077.
      </p>
      <p className="muted">
        Cada día abrirás la app y verás <strong>qué estudiar, cuánto tiempo y qué resultado conseguir</strong>. Sin decidir desde cero.
      </p>
      <button className="btn btn-primary btn-lg" onClick={() => setStep(1)}>Empezar</button>
    </Card>,

    <Card key="1">
      <div className="label">Paso 2 · Tu material</div>
      <h2>Tu temario ya está cargado</h2>
      <p className="muted">
        Tienes tu sistema actual listo: <strong>90 temas</strong> oficiales, <strong>{withMaterial.length}</strong> con material,
        {" "}<strong>{partial.length}</strong> parciales (E12.2 DDD y E36.1 Triquina), las <strong>50 preguntas</strong> del test del 17/06 y tu inventario de materiales.
      </p>
      <p className="faint">
        ¿Quieres importar ahora una versión más reciente de tu Excel? (Opcional — puedes hacerlo luego en Ajustes; nunca pierdes tu progreso.)
      </p>
      <div className="mt">
        <ExcelImport variant="block" onImported={() => toast("Excel importado")} />
      </div>
      <div className="btn-row mt">
        <button className="btn" onClick={() => setStep(0)}>← Atrás</button>
        <button className="btn btn-primary" onClick={() => setStep(2)}>Siguiente →</button>
      </div>
    </Card>,

    <Card key="2">
      <div className="label">Paso 3 · Tu ritmo</div>
      <h2>¿Cuántas horas por semana?</h2>
      <label className="field">
        <span className="label">Objetivo semanal ({hours} h)</span>
        <input type="range" min={6} max={45} value={hours} onChange={(e) => setHours(Number(e.target.value))} />
      </label>
      <p className="faint">Podrás ajustarlo cada domingo. El plan reparte 55% temas actuales, 25% atraso y 20% repasos/tests.</p>
      <div className="btn-row">
        <button className="btn" onClick={() => setStep(1)}>← Atrás</button>
        <button className="btn btn-primary" onClick={() => setStep(3)}>Siguiente →</button>
      </div>
    </Card>,

    <Card key="3">
      <div className="label">Paso 4 · Concentración</div>
      <h2>Tu Pomodoro por defecto</h2>
      <div className="seg" style={{ marginBottom: 12 }}>
        {[25, 40, 45, 50, 60].map((m) => (
          <button key={m} className={pomodoro === m ? "active" : ""} onClick={() => setPomodoro(m)}>{m} min</button>
        ))}
      </div>
      <p className="faint">Podrás cambiarlo en cada sesión. Al terminar, la app registra minutos y actualiza tu progreso sola.</p>
      <div className="btn-row">
        <button className="btn" onClick={() => setStep(2)}>← Atrás</button>
        <button className="btn btn-primary btn-lg" disabled={busy} onClick={finish}>
          {busy ? "Generando tu semana…" : "Generar mi primera semana →"}
        </button>
      </div>
    </Card>,
  ];

  return <div className="onboard">{steps[step]}</div>;
}
