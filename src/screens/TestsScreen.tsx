import { useMemo, useState } from "react";
import type { Question, Test, TestType } from "../domain/types";
import { formatShort, todayISO } from "../domain/dates";
import { createTest } from "../db/actions";
import {
  useAttempts,
  useErrors,
  useQuestions,
  useTests,
} from "../hooks/useData";
import { Card, Chip, Empty, Sheet } from "../ui/components";
import { useToast } from "../ui/toast";
import { TestRunner } from "./TestRunner";

interface RunConfig {
  test: Test;
  questions: Question[];
  simulacro: boolean;
}

export function TestsScreen() {
  const tests = useTests();
  const questions = useQuestions();
  const attempts = useAttempts();
  const errors = useErrors();
  const toast = useToast();
  const [run, setRun] = useState<RunConfig | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const qById = useMemo(() => new Map(questions.map((q) => [q.id, q])), [questions]);
  const topicsInBank = useMemo(() => {
    const s = new Set(questions.map((q) => q.topicId));
    return Array.from(s).sort();
  }, [questions]);

  function startTest(test: Test) {
    const qs = test.questionIds.map((id) => qById.get(id)).filter(Boolean) as Question[];
    if (qs.length === 0) {
      toast("Este test no tiene preguntas cargadas todavía.");
      return;
    }
    setRun({ test, questions: qs, simulacro: false });
  }

  async function createCustom(cfg: {
    type: TestType;
    title: string;
    questionIds: string[];
    duration: number;
    simulacro: boolean;
  }) {
    if (cfg.questionIds.length === 0) {
      toast("No hay preguntas para ese filtro.");
      return;
    }
    const test: Test = {
      id: `test-custom-${Date.now()}`,
      date: todayISO(),
      title: cfg.title,
      type: cfg.type,
      questionIds: cfg.questionIds,
      status: "pendiente",
      durationMinutes: cfg.duration,
      source: "Generado",
      topicIds: Array.from(new Set(cfg.questionIds.map((id) => qById.get(id)?.topicId).filter(Boolean) as string[])),
    };
    await createTest(test);
    setShowCreate(false);
    const qs = cfg.questionIds.map((id) => qById.get(id)!).filter(Boolean);
    setRun({ test, questions: qs, simulacro: cfg.simulacro });
  }

  const errorQuestionIds = useMemo(
    () => errors.filter((e) => e.questionId && e.status !== "resuelto").map((e) => e.questionId!) ,
    [errors],
  );

  const attemptsByTest = useMemo(() => {
    const m = new Map<string, typeof attempts>();
    for (const a of attempts) {
      const arr = m.get(a.testId) ?? [];
      arr.push(a);
      m.set(a.testId, arr);
    }
    return m;
  }, [attempts]);

  if (run) {
    return (
      <TestRunner
        test={run.test}
        questions={run.questions}
        simulacro={run.simulacro}
        onExit={() => setRun(null)}
      />
    );
  }

  return (
    <div>
      <div className="between">
        <h1>Tests</h1>
        <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>+ Crear test</button>
      </div>

      <Card className="flat">
        <div className="label" style={{ marginBottom: 8 }}>Rápido</div>
        <div className="btn-row">
          <button
            className="btn btn-sm"
            disabled={errorQuestionIds.length === 0}
            onClick={() =>
              createCustom({
                type: "solo-fallos",
                title: "Test solo fallos",
                questionIds: errorQuestionIds,
                duration: Math.max(5, errorQuestionIds.length),
                simulacro: false,
              })
            }
          >
            🎯 Solo fallos ({errorQuestionIds.length})
          </button>
          <button
            className="btn btn-sm"
            disabled={questions.length === 0}
            onClick={() =>
              createCustom({
                type: "acumulativo",
                title: "Test rápido (10)",
                questionIds: shuffle(questions.map((q) => q.id)).slice(0, 10),
                duration: 12,
                simulacro: false,
              })
            }
          >
            ⚡ 10 al azar
          </button>
          <button
            className="btn btn-sm"
            disabled={questions.length < 1}
            onClick={() =>
              createCustom({
                type: "simulacro",
                title: `Simulacro (${Math.min(100, questions.length)})`,
                questionIds: shuffle(questions.map((q) => q.id)).slice(0, 100),
                duration: 120,
                simulacro: true,
              })
            }
          >
            🎓 Simulacro
          </button>
        </div>
      </Card>

      <Card>
        <div className="label" style={{ marginBottom: 8 }}>Tests registrados</div>
        {tests.length === 0 && <Empty title="Sin tests" />}
        {tests.map((t) => {
          const loaded = t.questionIds.filter((id) => qById.has(id)).length;
          const testAttempts = (attemptsByTest.get(t.id) ?? []).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
          const best = testAttempts[0];
          return (
            <div key={t.id} className="task">
              <div className="task-body">
                <div className="row wrap">
                  <strong>{t.title}</strong>
                  <Chip variant={t.status === "corregido" ? "ok" : "warn"}>{t.status}</Chip>
                  <Chip>{formatShort(t.date)}</Chip>
                </div>
                <div className="task-meta">
                  {loaded > 0 ? `${loaded} pregunta(s) cargadas` : "Sin preguntas cargadas (usa 'Crear test')"}
                  {t.topicIds.length > 0 && ` · ${t.topicIds.join(", ")}`}
                </div>
                {best && (
                  <div className="faint">
                    Último intento: nota {best.netScore} · {best.correct}✔ / {best.incorrect}✕ / {best.blank}○
                  </div>
                )}
                <div className="btn-row" style={{ marginTop: 8 }}>
                  <button className="btn btn-sm btn-primary" disabled={loaded === 0} onClick={() => startTest(t)}>
                    {testAttempts.length ? "Repetir" : "Hacer test"}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </Card>

      {showCreate && (
        <CreateTestSheet
          topics={topicsInBank}
          questions={questions}
          onClose={() => setShowCreate(false)}
          onCreate={createCustom}
        />
      )}
    </div>
  );
}

function CreateTestSheet({
  topics,
  questions,
  onClose,
  onCreate,
}: {
  topics: string[];
  questions: Question[];
  onClose: () => void;
  onCreate: (cfg: { type: TestType; title: string; questionIds: string[]; duration: number; simulacro: boolean }) => void;
}) {
  const [mode, setMode] = useState<"tema" | "cantidad">("cantidad");
  const [topic, setTopic] = useState(topics[0] ?? "");
  const [count, setCount] = useState(25);

  const pool = mode === "tema" ? questions.filter((q) => q.topicId === topic) : questions;
  const available = pool.length;

  function create() {
    const ids = shuffle(pool.map((q) => q.id)).slice(0, count);
    onCreate({
      type: mode === "tema" ? "por-tema" : "acumulativo",
      title: mode === "tema" ? `Test ${topic}` : `Test de ${ids.length} preguntas`,
      questionIds: ids,
      duration: Math.max(5, Math.round(ids.length * 1.2)),
      simulacro: false,
    });
  }

  return (
    <Sheet
      title="Crear test"
      onClose={onClose}
      footer={
        <button className="btn btn-primary" style={{ flex: 1 }} disabled={available === 0} onClick={create}>
          Crear y empezar
        </button>
      }
    >
      <div className="seg" style={{ marginBottom: 12 }}>
        <button className={mode === "cantidad" ? "active" : ""} onClick={() => setMode("cantidad")}>Por cantidad</button>
        <button className={mode === "tema" ? "active" : ""} onClick={() => setMode("tema")}>Por tema</button>
      </div>
      {mode === "tema" && (
        <label className="field">
          <span className="label">Tema</span>
          <select value={topic} onChange={(e) => setTopic(e.target.value)}>
            {topics.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
      )}
      <label className="field">
        <span className="label">Nº de preguntas ({count})</span>
        <input type="range" min={5} max={Math.max(5, available)} step={5} value={Math.min(count, Math.max(5, available))} onChange={(e) => setCount(Number(e.target.value))} />
      </label>
      <p className="faint">{available} preguntas disponibles en el banco{mode === "tema" ? ` para ${topic}` : ""}.</p>
    </Sheet>
  );
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
