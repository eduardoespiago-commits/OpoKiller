import { useEffect, useRef, useState } from "react";
import type { ErrorCause, ErrorSeverity, Question, Test } from "../domain/types";
import { buildAttempt } from "../domain/scoring";
import { createError, saveAttempt } from "../db/actions";
import { getSettings } from "../db/actions";
import { Card, Chip } from "../ui/components";
import { useToast } from "../ui/toast";

interface Answer {
  selected: string | null;
  flaggedDoubt: boolean;
}

const LETTERS = ["A", "B", "C", "D"];

const CAUSES: { value: ErrorCause; label: string }[] = [
  { value: "no-lo-sabia", label: "No lo sabía" },
  { value: "confundi-conceptos", label: "Confundí conceptos" },
  { value: "falle-cifra", label: "Fallé una cifra" },
  { value: "confundi-norma", label: "Confundí una norma" },
  { value: "no-vi-excepcion", label: "No vi la excepción" },
  { value: "lei-mal", label: "Leí mal" },
  { value: "cambie-respuesta", label: "Cambié una correcta" },
  { value: "desactualizado", label: "Estaba desactualizado" },
];

export function TestRunner({
  test,
  questions,
  simulacro = false,
  onExit,
}: {
  test: Test;
  questions: Question[];
  simulacro?: boolean;
  onExit: () => void;
}) {
  const toast = useToast();
  const [answers, setAnswers] = useState<Answer[]>(
    () => questions.map(() => ({ selected: null, flaggedDoubt: false })),
  );
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<"run" | "review" | "result" | "correct">("run");
  const [seconds, setSeconds] = useState(0);
  const startRef = useRef(new Date().toISOString());
  const [attempt, setAttempt] = useState<ReturnType<typeof buildAttempt> | null>(null);
  const [correctIdx, setCorrectIdx] = useState(0);

  useEffect(() => {
    if (phase !== "run") return;
    const id = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [phase]);

  const q = questions[idx];

  function setSelected(letter: string | null) {
    setAnswers((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], selected: letter };
      return next;
    });
  }
  function toggleDoubt() {
    setAnswers((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], flaggedDoubt: !next[idx].flaggedDoubt };
      return next;
    });
  }

  async function submit() {
    const finishedAt = new Date().toISOString();
    const settings = await getSettings();
    const built = buildAttempt(
      test.id,
      questions,
      questions.map((qq, i) => ({
        questionId: qq.id,
        selected: answers[i].selected,
        flaggedDoubt: answers[i].flaggedDoubt,
      })),
      startRef.current,
      finishedAt,
      {
        correct: settings.penaltyCorrect,
        incorrect: settings.penaltyIncorrect,
        blank: settings.penaltyBlank,
      },
    );
    setAttempt(built);
    await saveAttempt(built, questions);
    setPhase("result");
  }

  // ----- RUN -----
  if (phase === "run" && q) {
    const a = answers[idx];
    return (
      <div className="focus-screen" style={{ justifyContent: "flex-start", paddingTop: 20, overflowY: "auto" }}>
        <div className="between" style={{ width: "100%", maxWidth: 620 }}>
          <button className="btn btn-sm btn-ghost" onClick={onExit}>✕ Salir</button>
          <Chip variant="primary">{fmtTime(seconds)}</Chip>
          <Chip>{idx + 1}/{questions.length}</Chip>
        </div>
        <Card>
          <div className="row wrap" style={{ marginBottom: 6 }}>
            {q.topicId && <Chip>{q.topicId}</Chip>}
            <Chip>{q.category}</Chip>
            {a.flaggedDoubt && <Chip variant="warn">Duda</Chip>}
          </div>
          <p style={{ fontWeight: 600 }}>{q.statement}</p>
          {q.options.map((opt, i) => {
            if (!opt) return null;
            const letter = LETTERS[i];
            return (
              <button
                key={letter}
                className={`q-option ${a.selected === letter ? "selected" : ""}`}
                onClick={() => setSelected(a.selected === letter ? null : letter)}
              >
                <strong>{letter}.</strong> {opt}
              </button>
            );
          })}
          <div className="btn-row mt">
            <button className="btn btn-sm" onClick={toggleDoubt}>
              {a.flaggedDoubt ? "Quitar duda" : "Marcar duda"}
            </button>
            <button className="btn btn-sm btn-ghost" onClick={() => setSelected(null)}>Dejar en blanco</button>
          </div>
        </Card>
        <div className="between" style={{ width: "100%", maxWidth: 620 }}>
          <button className="btn" disabled={idx === 0} onClick={() => setIdx((i) => i - 1)}>← Anterior</button>
          {idx < questions.length - 1 ? (
            <button className="btn btn-primary" onClick={() => setIdx((i) => i + 1)}>Siguiente →</button>
          ) : (
            <button className="btn btn-accent" onClick={() => setPhase("review")}>Revisar y entregar</button>
          )}
        </div>
        <div className="row wrap" style={{ maxWidth: 620, justifyContent: "center", marginTop: 12 }}>
          {questions.map((_, i) => (
            <button
              key={i}
              onClick={() => setIdx(i)}
              className="chip"
              style={{
                width: 32, justifyContent: "center",
                background: answers[i].selected ? "var(--primary-soft)" : answers[i].flaggedDoubt ? "var(--warn-soft)" : "var(--surface-2)",
                borderColor: i === idx ? "var(--primary)" : "transparent",
              }}
            >
              {i + 1}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ----- REVIEW -----
  if (phase === "review") {
    const answered = answers.filter((a) => a.selected).length;
    const doubts = answers.filter((a) => a.flaggedDoubt).length;
    return (
      <div className="focus-screen" style={{ justifyContent: "center" }}>
        <Card>
          <h2>Antes de entregar</h2>
          <div className="grid grid-3 mt">
            <div className="stat"><div className="label">Respondidas</div><div className="num sm">{answered}</div></div>
            <div className="stat"><div className="label">En blanco</div><div className="num sm">{questions.length - answered}</div></div>
            <div className="stat"><div className="label">Dudas</div><div className="num sm">{doubts}</div></div>
          </div>
          <p className="faint mt">Recuerda la penalización: cada error resta 0,3333. En blanco no penaliza.</p>
          <div className="btn-row mt">
            <button className="btn" onClick={() => setPhase("run")}>← Seguir revisando</button>
            <button className="btn btn-primary" onClick={submit}>Entregar y corregir</button>
          </div>
        </Card>
      </div>
    );
  }

  // ----- RESULT -----
  if (phase === "result" && attempt) {
    const wrong = attempt.answers.filter((a) => a.result === "Error");
    return (
      <div className="focus-screen" style={{ justifyContent: "flex-start", paddingTop: 24, overflowY: "auto" }}>
        <Card>
          <h2>Resultado{simulacro ? " · Simulacro" : ""}</h2>
          <div className="grid grid-3">
            <div className="stat"><div className="label">Nota neta</div><div className="num">{attempt.netScore}</div></div>
            <div className="stat"><div className="label">% neto</div><div className="num sm">{Math.round(attempt.netPercentage * 100)}%</div></div>
            <div className="stat"><div className="label">Tiempo</div><div className="num sm">{fmtTime(attempt.totalSeconds)}</div></div>
          </div>
          <div className="grid grid-3 mt">
            <Chip variant="ok">✔ {attempt.correct} aciertos</Chip>
            <Chip variant="danger">✕ {attempt.incorrect} errores</Chip>
            <Chip>○ {attempt.blank} blancas</Chip>
          </div>
          <p className="faint mt">
            {attempt.totalSeconds > 0 && `${Math.round(attempt.totalSeconds / Math.max(1, questions.length))}s por pregunta.`}
          </p>
          {wrong.length > 0 ? (
            <button className="btn btn-primary btn-lg mt" onClick={() => { setCorrectIdx(0); setPhase("correct"); }}>
              Corregir {wrong.length} error(es) →
            </button>
          ) : (
            <button className="btn btn-primary btn-lg mt" onClick={onExit}>Terminar</button>
          )}
          <button className="btn btn-ghost mt" onClick={onExit}>Salir sin corregir ahora</button>
        </Card>
      </div>
    );
  }

  // ----- ACTIVE CORRECTION -----
  if (phase === "correct" && attempt) {
    const wrong = attempt.answers.filter((a) => a.result === "Error");
    if (correctIdx >= wrong.length) {
      return (
        <div className="focus-screen">
          <Card>
            <h2>Corrección completada ✔</h2>
            <p className="muted">Los errores se han añadido al cuaderno con sus repeticiones programadas.</p>
            <button className="btn btn-primary btn-lg" onClick={onExit}>Terminar</button>
          </Card>
        </div>
      );
    }
    const wa = wrong[correctIdx];
    const question = questions.find((x) => x.id === wa.questionId)!;
    return (
      <CorrectionStep
        key={wa.questionId}
        question={question}
        selected={wa.selected ?? ""}
        index={correctIdx}
        total={wrong.length}
        onSave={async (cause, severity, rule) => {
          await createError({
            questionId: question.id,
            topicId: question.topicId,
            statement: question.statement,
            selectedAnswer: wa.selected ?? "",
            correctAnswer: question.correctAnswer,
            cause,
            severity,
            correctionRule: rule,
          });
          toast("Error registrado");
          setCorrectIdx((i) => i + 1);
        }}
        onSkip={() => setCorrectIdx((i) => i + 1)}
      />
    );
  }

  return null;
}

function CorrectionStep({
  question,
  selected,
  index,
  total,
  onSave,
  onSkip,
}: {
  question: Question;
  selected: string;
  index: number;
  total: number;
  onSave: (cause: ErrorCause, severity: ErrorSeverity, rule: string) => void;
  onSkip: () => void;
}) {
  const [cause, setCause] = useState<ErrorCause | null>(null);
  const [severity, setSeverity] = useState<ErrorSeverity>("Media");
  const [rule, setRule] = useState("");
  const correctText = question.options[["A", "B", "C", "D"].indexOf(question.correctAnswer)] ?? "";

  return (
    <div className="focus-screen" style={{ justifyContent: "flex-start", paddingTop: 24, overflowY: "auto" }}>
      <Card>
        <div className="between">
          <Chip variant="danger">Error {index + 1}/{total}</Chip>
          {question.topicId && <Chip>{question.topicId}</Chip>}
        </div>
        <p style={{ fontWeight: 600, marginTop: 8 }}>{question.statement}</p>
        <div className="card flat" style={{ background: "var(--surface-2)", margin: "0 0 12px" }}>
          <div className="between"><span className="muted">Elegiste</span><strong className="danger">{selected || "—"}</strong></div>
          <div className="between"><span className="muted">Correcta</span><strong>{question.correctAnswer}. {correctText}</strong></div>
        </div>
        <div className="field">
          <span className="label">¿Por qué fallaste?</span>
          <div className="row wrap" style={{ marginTop: 4 }}>
            {CAUSES.map((c) => (
              <button
                key={c.value}
                className={`btn btn-sm ${cause === c.value ? "btn-primary" : ""}`}
                onClick={() => setCause(c.value)}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
        <div className="field mt">
          <span className="label">Severidad (define cuándo se repite)</span>
          <div className="seg" style={{ marginTop: 4 }}>
            {(["Alta", "Media", "Baja"] as ErrorSeverity[]).map((s) => (
              <button key={s} className={severity === s ? "active" : ""} onClick={() => setSeverity(s)}>{s}</button>
            ))}
          </div>
          <div className="faint" style={{ marginTop: 4 }}>
            {severity === "Alta" ? "Repetir en 1 día" : severity === "Media" ? "Repetir en 3 días" : "Repetir en 7 días"}
          </div>
        </div>
        <label className="field mt">
          <span className="label">Regla para no repetirlo (opcional)</span>
          <textarea value={rule} onChange={(e) => setRule(e.target.value)} placeholder="Ej.: plazo de conservación de registros = 3 años (RD 348/00)." />
        </label>
        <div className="btn-row">
          <button className="btn btn-primary" style={{ flex: 1 }} disabled={!cause} onClick={() => onSave(cause!, severity, rule)}>
            Guardar en cuaderno
          </button>
          <button className="btn btn-ghost" onClick={onSkip}>Omitir</button>
        </div>
      </Card>
    </div>
  );
}

function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}
