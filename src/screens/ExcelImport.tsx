import { useRef, useState } from "react";
import {
  applyImport,
  buildImportPreview,
  type ImportPreview,
} from "../db/excel";
import { db } from "../db/db";
import { Chip, Sheet } from "../ui/components";
import { useToast } from "../ui/toast";

interface UndoSnapshot {
  topics: unknown[];
  questions: unknown[];
}

/**
 * Self-contained Excel import flow: pick file → drag&drop → preview → per-set
 * merge choice → auto-backup → apply, with single-step undo. Reused by the
 * onboarding and Settings screens.
 */
export function ExcelImport({
  variant = "button",
  onImported,
}: {
  variant?: "button" | "block";
  onImported?: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [undo, setUndo] = useState<UndoSnapshot | null>(null);

  async function readFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      toast("El archivo debe ser .xlsx");
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      toast("Archivo demasiado grande (máx. 25 MB)");
      return;
    }
    setBusy(true);
    try {
      setPreview(await buildImportPreview(file));
    } catch (err) {
      console.error(err);
      toast("No se pudo leer el Excel");
    } finally {
      setBusy(false);
    }
  }

  async function apply(
    p: ImportPreview,
    opts: { applyTopicUpdates: boolean; applyNewTopics: boolean; applyNewQuestions: boolean },
  ) {
    // Auto-backup of the affected tables before writing, so we can undo.
    const snap: UndoSnapshot = {
      topics: await db.topics.toArray(),
      questions: await db.questions.toArray(),
    };
    await applyImport(p, opts);
    setUndo(snap);
    setPreview(null);
    toast("Importación aplicada · progreso conservado");
    onImported?.();
  }

  async function doUndo() {
    if (!undo) return;
    await db.transaction("rw", [db.topics, db.questions], async () => {
      await db.topics.clear();
      await db.topics.bulkPut(undo.topics as never[]);
      await db.questions.clear();
      await db.questions.bulkPut(undo.questions as never[]);
    });
    setUndo(null);
    toast("Última importación deshecha");
  }

  const trigger = (
    <>
      <input
        ref={input}
        type="file"
        accept=".xlsx"
        style={{ display: "none" }}
        onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])}
      />
      {variant === "block" ? (
        <div
          className={`dropzone ${dragging ? "dragging" : ""}`}
          onClick={() => input.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (e.dataTransfer.files[0]) readFile(e.dataTransfer.files[0]);
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && input.current?.click()}
        >
          <div style={{ fontSize: "1.8rem" }}>📄</div>
          <strong>{busy ? "Leyendo…" : "Arrastra tu Excel aquí o toca para elegir"}</strong>
          <div className="faint">Sistema_estudio_oposiciones_DGA_...xlsx</div>
        </div>
      ) : (
        <button className="btn btn-primary" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? "Leyendo…" : "Seleccionar .xlsx"}
        </button>
      )}
      {undo && (
        <div className="between mt" style={{ background: "var(--surface-2)", borderRadius: 9, padding: "8px 12px" }}>
          <span className="faint">Importación aplicada.</span>
          <button className="btn btn-sm" onClick={doUndo}>Deshacer</button>
        </div>
      )}
    </>
  );

  return (
    <>
      {trigger}
      {preview && (
        <ImportSheet preview={preview} onClose={() => setPreview(null)} onApply={(opts) => apply(preview, opts)} />
      )}
    </>
  );
}

function ImportSheet({
  preview,
  onClose,
  onApply,
}: {
  preview: ImportPreview;
  onClose: () => void;
  onApply: (opts: { applyTopicUpdates: boolean; applyNewTopics: boolean; applyNewQuestions: boolean }) => void;
}) {
  const [updates, setUpdates] = useState(true);
  const [newTopics, setNewTopics] = useState(true);
  const [newQuestions, setNewQuestions] = useState(true);
  return (
    <Sheet
      title="Vista previa de importación"
      onClose={onClose}
      footer={
        <button
          className="btn btn-primary"
          style={{ flex: 1 }}
          onClick={() => onApply({ applyTopicUpdates: updates, applyNewTopics: newTopics, applyNewQuestions: newQuestions })}
        >
          Crear copia y aplicar
        </button>
      }
    >
      <p className="faint">{preview.fileName}</p>
      <div className="row wrap" style={{ marginBottom: 10 }}>
        {preview.sheetsFound.map((s) => (
          <Chip key={s}>{s}</Chip>
        ))}
      </div>
      <Row label="Temas actualizados" value={preview.topicsUpdated.length} checked={updates} onChange={setUpdates} />
      <Row label="Temas nuevos" value={preview.topicsNew.length} checked={newTopics} onChange={setNewTopics} />
      <Row label="Preguntas nuevas" value={preview.questionsNew.length} checked={newQuestions} onChange={setNewQuestions} />
      <div className="faint mt">
        Duplicadas (se ignoran): {preview.questionsDuplicated.length} · Materiales nuevos detectados: {preview.materialsNew}
      </div>
      {preview.warnings.length > 0 && (
        <div className="card flat" style={{ background: "var(--warn-soft)", marginTop: 10 }}>
          {preview.warnings.slice(0, 6).map((w, i) => (
            <div key={i} className="faint">⚠ {w}</div>
          ))}
        </div>
      )}
      <p className="faint mt">Se crea una copia previa automática (puedes deshacer). Tu progreso de estudio no se toca.</p>
    </Sheet>
  );
}

function Row({
  label,
  value,
  checked,
  onChange,
}: {
  label: string;
  value: number;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="between" style={{ padding: "8px 0" }}>
      <span>{label}: <strong>{value}</strong></span>
      <input type="checkbox" style={{ width: "auto" }} checked={checked} disabled={value === 0} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}
