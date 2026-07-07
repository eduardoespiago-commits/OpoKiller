import { useMemo, useState } from "react";
import type { ErrorEntry } from "../domain/types";
import { formatShort, todayISO } from "../domain/dates";
import { markErrorRepeated, updateErrorStatus } from "../db/actions";
import { useErrors } from "../hooks/useData";
import { Card, Chip, Empty, Sheet } from "../ui/components";
import { useToast } from "../ui/toast";

const CAUSE_LABEL: Record<string, string> = {
  "no-lo-sabia": "No lo sabía",
  "confundi-conceptos": "Confundí conceptos",
  "falle-cifra": "Fallé una cifra",
  "confundi-norma": "Confundí una norma",
  "no-vi-excepcion": "No vi la excepción",
  "lei-mal": "Leí mal",
  "cambie-respuesta": "Cambié una correcta",
  desactualizado: "Estaba desactualizado",
};

export function Errors() {
  const today = todayISO();
  const errors = useErrors();
  const toast = useToast();
  const [filter, setFilter] = useState<"vencidos" | "abiertos" | "recurrentes" | "resueltos">("vencidos");
  const [active, setActive] = useState<ErrorEntry | null>(null);

  const recurrentInsight = useMemo(() => detectRecurrent(errors), [errors]);

  const list = useMemo(() => {
    let l = [...errors].sort((a, b) => (b.createdAt).localeCompare(a.createdAt));
    if (filter === "vencidos")
      l = l.filter((e) => e.status !== "resuelto" && e.nextReviewAt && e.nextReviewAt <= today);
    else if (filter === "abiertos") l = l.filter((e) => e.status !== "resuelto");
    else if (filter === "recurrentes") l = l.filter((e) => e.status === "recurrente");
    else l = l.filter((e) => e.status === "resuelto");
    return l;
  }, [errors, filter, today]);

  const filters = [
    { key: "vencidos", label: "Por repetir" },
    { key: "abiertos", label: "Abiertos" },
    { key: "recurrentes", label: "Recurrentes" },
    { key: "resueltos", label: "Resueltos" },
  ] as const;

  return (
    <div>
      <h1>Cuaderno de errores</h1>

      {recurrentInsight && (
        <Card>
          <Chip variant="danger">Patrón detectado</Chip>
          <p style={{ marginTop: 8, marginBottom: 0 }}>{recurrentInsight}</p>
        </Card>
      )}

      <div className="scroll-x" style={{ marginBottom: 12 }}>
        {filters.map((f) => (
          <button
            key={f.key}
            className={`btn btn-sm nowrap ${filter === f.key ? "btn-primary" : ""}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <Card>
          <Empty
            icon="🎯"
            title="Sin errores en esta vista"
            hint="Los errores se crean al corregir un test. Cada error genera repeticiones automáticas."
          />
        </Card>
      ) : (
        list.map((e) => (
          <div key={e.id} className="task" style={{ cursor: "pointer" }} onClick={() => setActive(e)}>
            <div className="task-body">
              <div className="row wrap">
                {e.topicId && <strong>{e.topicId}</strong>}
                <Chip variant={sevVariant(e.severity)}>{e.severity}</Chip>
                <Chip variant={e.status === "resuelto" ? "ok" : e.status === "recurrente" ? "danger" : "baja"}>
                  {e.status}
                </Chip>
                {e.cause && <Chip>{CAUSE_LABEL[e.cause] ?? e.cause}</Chip>}
              </div>
              <div className="task-title" style={{ fontWeight: 500, marginTop: 4 }}>
                {short(e.statement)}
              </div>
              <div className="task-meta">
                Correcta: {e.correctAnswer} · repeticiones {e.repetitions}
                {e.nextReviewAt && ` · repetir ${formatShort(e.nextReviewAt)}`}
              </div>
            </div>
          </div>
        ))
      )}

      {active && (
        <ErrorSheet
          entry={active}
          onClose={() => setActive(null)}
          onRepeat={async (correct) => {
            await markErrorRepeated(active.id, correct);
            toast(correct ? "¡Acertado! Error avanzando" : "Registrado, se repetirá pronto");
            setActive(null);
          }}
          onResolve={async () => {
            await updateErrorStatus(active.id, "resuelto");
            toast("Error resuelto");
            setActive(null);
          }}
        />
      )}
    </div>
  );
}

function ErrorSheet({
  entry,
  onClose,
  onRepeat,
  onResolve,
}: {
  entry: ErrorEntry;
  onClose: () => void;
  onRepeat: (correct: boolean) => void;
  onResolve: () => void;
}) {
  return (
    <Sheet title="Repetir error" onClose={onClose}>
      <p style={{ fontWeight: 600 }}>{entry.statement}</p>
      <div className="card flat" style={{ background: "var(--surface-2)", margin: "0 0 12px" }}>
        <div className="between"><span className="muted">Tu respuesta</span><strong>{entry.selectedAnswer || "—"}</strong></div>
        <div className="between"><span className="muted">Correcta</span><strong className="ok">{entry.correctAnswer}</strong></div>
        {entry.cause && <div className="between"><span className="muted">Causa</span><span>{CAUSE_LABEL[entry.cause] ?? entry.cause}</span></div>}
      </div>
      {entry.correctionRule && (
        <p className="muted"><strong>Regla:</strong> {entry.correctionRule}</p>
      )}
      <p className="faint">Responde de memoria antes de comprobar. ¿Lo has acertado esta vez?</p>
      <div className="btn-row">
        <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => onRepeat(true)}>✔ Acertado</button>
        <button className="btn btn-danger" style={{ flex: 1 }} onClick={() => onRepeat(false)}>✕ Fallado</button>
      </div>
      <button className="btn btn-ghost mt" onClick={onResolve}>Marcar como resuelto</button>
    </Sheet>
  );
}

function detectRecurrent(errors: ErrorEntry[]): string | null {
  const byCause = new Map<string, number>();
  for (const e of errors) {
    if (e.status === "resuelto" || !e.cause) continue;
    byCause.set(e.cause, (byCause.get(e.cause) ?? 0) + 1);
  }
  let top: [string, number] | null = null;
  for (const entry of byCause) if (!top || entry[1] > top[1]) top = entry;
  if (top && top[1] >= 3) {
    const label = CAUSE_LABEL[top[0]] ?? top[0];
    return `Has repetido ${top[1]} veces el error "${label}". Crea una tabla/ficha única para ese patrón.`;
  }
  return null;
}

function sevVariant(s: string): string {
  return s === "Alta" ? "danger" : s === "Media" ? "warn" : "baja";
}
function short(s: string, n = 110): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
