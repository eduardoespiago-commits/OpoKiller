import { useEffect, useRef, useState } from "react";
import { readDocx } from "../db/docxReader";
import {
  detectTopic,
  parseTest,
  type ParsedTest,
  type TopicDetection,
} from "../domain/wordImport";
import {
  fuseCorrectionIntoTest,
  findMatchingTest,
  importTestDoc,
  importTopicDoc,
  type ImportUndo,
} from "../db/wordActions";
import { useTopics } from "../hooks/useData";
import { Chip, Sheet } from "../ui/components";
import { useToast } from "../ui/toast";

type Detected =
  | { kind: "topic"; detection: TopicDetection; fileName: string }
  | { kind: "test"; parsed: ParsedTest; fileName: string };

/** Decide whether a document is a test or a topic from its parsed content. */
function classify(doc: Parameters<typeof detectTopic>[0], fileName: string): Detected {
  const parsed = parseTest(doc, fileName);
  const optionsOk = parsed.questions.filter((q) => q.options.filter(Boolean).length >= 2).length;
  if (parsed.questions.length >= 4 && optionsOk >= parsed.questions.length * 0.6) {
    return { kind: "test", parsed, fileName };
  }
  return { kind: "topic", detection: detectTopic(doc, fileName), fileName };
}

export function WordImport({ onImported }: { onImported?: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [detected, setDetected] = useState<Detected | null>(null);
  const [undo, setUndo] = useState<ImportUndo | null>(null);

  async function read(file: File) {
    if (!file.name.toLowerCase().endsWith(".docx")) {
      toast("El archivo debe ser .docx");
      return;
    }
    setBusy(true);
    try {
      const doc = await readDocx(file);
      setDetected(classify(doc, file.name));
    } catch (err) {
      console.error(err);
      toast("No se pudo leer el Word");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <input
        ref={input}
        type="file"
        accept=".docx"
        style={{ display: "none" }}
        onChange={(e) => e.target.files?.[0] && read(e.target.files[0])}
      />
      <div
        className={`dropzone ${dragging ? "dragging" : ""}`}
        onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files[0]) read(e.dataTransfer.files[0]); }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && input.current?.click()}
      >
        <div style={{ fontSize: "1.8rem" }}>📝</div>
        <strong>{busy ? "Leyendo Word…" : "Arrastra un tema o test en Word (.docx)"}</strong>
        <div className="faint">Detecta si es tema o test y te deja confirmar antes de guardar.</div>
      </div>

      {undo && (
        <div className="between mt" style={{ background: "var(--surface-2)", borderRadius: 9, padding: "8px 12px" }}>
          <span className="faint">Importación aplicada.</span>
          <button
            className="btn btn-sm"
            onClick={async () => { await undo.undo(); setUndo(null); toast("Importación deshecha"); }}
          >
            Deshacer
          </button>
        </div>
      )}

      {detected?.kind === "topic" && (
        <TopicPreview
          detected={detected}
          onClose={() => setDetected(null)}
          onConfirm={async (result) => {
            setUndo(result);
            setDetected(null);
            toast("Tema importado y vinculado");
            onImported?.();
          }}
        />
      )}
      {detected?.kind === "test" && (
        <TestPreview
          parsed={detected.parsed}
          fileName={detected.fileName}
          onClose={() => setDetected(null)}
          onConfirm={async (result) => {
            setUndo(result);
            setDetected(null);
            toast("Test importado");
            onImported?.();
          }}
        />
      )}
    </>
  );
}

function TopicPreview({
  detected,
  onClose,
  onConfirm,
}: {
  detected: Extract<Detected, { kind: "topic" }>;
  onClose: () => void;
  onConfirm: (r: ImportUndo) => void;
}) {
  const topics = useTopics();
  const det = detected.detection;
  const [officialId, setOfficialId] = useState(det.officialId ?? "");
  const [title, setTitle] = useState(det.title);
  const [isPartial, setIsPartial] = useState(det.isPartial);
  const [createProducts, setCreateProducts] = useState(true);
  const valid = /^[CE]\d{2}$/.test(officialId) && topics.some((t) => t.officialId === officialId);

  return (
    <Sheet
      title="Importar tema (Word)"
      onClose={onClose}
      footer={
        <button
          className="btn btn-primary"
          style={{ flex: 1 }}
          disabled={!valid}
          onClick={async () => {
            const r = await importTopicDoc({
              officialId,
              title,
              isPartial,
              subtopicCode: det.subtopicCode,
              origin: "Semanal",
              createProducts,
              detection: det,
              fileName: detected.fileName,
            });
            onConfirm(r);
          }}
        >
          Vincular y guardar
        </button>
      }
    >
      <div className="row wrap" style={{ marginBottom: 10 }}>
        <Chip variant="primary">Confianza {Math.round(det.confidence * 100)}%</Chip>
        {det.subtopicCode && <Chip variant="warn">Subtema {det.subtopicCode}</Chip>}
        <Chip>{det.headings.length} apartados</Chip>
        <Chip>{det.tableCount} tablas</Chip>
      </div>

      <label className="field">
        <span className="label">Tema oficial</span>
        <select value={officialId} onChange={(e) => setOfficialId(e.target.value)}>
          <option value="">— elige tema —</option>
          {topics.map((t) => (
            <option key={t.officialId} value={t.officialId}>
              {t.officialId} · {t.title.slice(0, 50)}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="label">Título detectado</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className="between" style={{ padding: "6px 0" }}>
        <span>Es un subtema / tema parcial</span>
        <input type="checkbox" style={{ width: "auto" }} checked={isPartial} onChange={(e) => setIsPartial(e.target.checked)} />
      </label>
      <label className="between" style={{ padding: "6px 0" }}>
        <span>Crear productos de estudio sugeridos</span>
        <input type="checkbox" style={{ width: "auto" }} checked={createProducts} onChange={(e) => setCreateProducts(e.target.checked)} />
      </label>

      {det.normativa.length > 0 && (
        <Detail label={`Normativa detectada (${det.normativa.length})`} items={det.normativa.slice(0, 8)} />
      )}
      {det.figures.length > 0 && (
        <Detail label={`Cifras/plazos (${det.figures.length})`} items={det.figures.slice(0, 8)} />
      )}
      <div className="label mt" style={{ marginBottom: 4 }}>Productos sugeridos</div>
      <div className="row wrap">
        {det.suggestedProducts.map((p) => (
          <Chip key={p} variant="accent">{p}</Chip>
        ))}
      </div>
      <p className="faint mt">No se sobrescribe el tema: se añade como material y se marca {isPartial ? "Parcial" : "Recibido"}.</p>
    </Sheet>
  );
}

function TestPreview({
  parsed,
  fileName,
  onClose,
  onConfirm,
}: {
  parsed: ParsedTest;
  fileName: string;
  onClose: () => void;
  onConfirm: (r: ImportUndo) => void;
}) {
  const topics = useTopics();
  const [topicId, setTopicId] = useState("");
  const [mode, setMode] = useState<"nuevo" | "fusionar">("nuevo");
  const [matchId, setMatchId] = useState<string | null>(null);
  const withAnswer = parsed.questions.filter((q) => q.correct).length;

  // Look for a matching pending test to offer fusion.
  useEffect(() => {
    findMatchingTest(parsed).then((t) => {
      if (t) {
        setMatchId(t.id);
        if (withAnswer > 0) setMode("fusionar");
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Sheet
      title="Importar test (Word)"
      onClose={onClose}
      footer={
        <button
          className="btn btn-primary"
          style={{ flex: 1 }}
          disabled={parsed.questions.length === 0}
          onClick={async () => {
            if (mode === "fusionar" && matchId) {
              const res = await fuseCorrectionIntoTest(matchId, parsed);
              onConfirm({ undo: async () => {} });
              return void res;
            }
            const r = await importTestDoc({ parsed, topicId: topicId || null, fileName });
            onConfirm(r);
          }}
        >
          {mode === "fusionar" ? "Fusionar corrección" : "Guardar test"}
        </button>
      }
    >
      <div className="row wrap" style={{ marginBottom: 10 }}>
        <Chip variant="primary">{parsed.questions.length} preguntas</Chip>
        <Chip variant={withAnswer > 0 ? "ok" : "warn"}>{withAnswer} con respuesta</Chip>
        {parsed.date && <Chip>{parsed.date}</Chip>}
        <Chip>Confianza {Math.round(parsed.confidence * 100)}%</Chip>
      </div>

      {matchId && (
        <div className="seg" style={{ marginBottom: 12 }}>
          <button className={mode === "nuevo" ? "active" : ""} onClick={() => setMode("nuevo")}>Crear nuevo</button>
          <button className={mode === "fusionar" ? "active" : ""} onClick={() => setMode("fusionar")}>Fusionar con existente</button>
        </div>
      )}

      {mode === "nuevo" && (
        <label className="field">
          <span className="label">Tema principal (opcional)</span>
          <select value={topicId} onChange={(e) => setTopicId(e.target.value)}>
            <option value="">— sin asignar —</option>
            {topics.map((t) => (
              <option key={t.officialId} value={t.officialId}>{t.officialId} · {t.title.slice(0, 40)}</option>
            ))}
          </select>
        </label>
      )}
      {mode === "fusionar" && (
        <p className="muted">Se detectó un test existente que coincide. Se rellenarán las respuestas correctas en sus preguntas.</p>
      )}

      {parsed.warnings.length > 0 && (
        <div className="card flat" style={{ background: "var(--warn-soft)", margin: "10px 0" }}>
          {parsed.warnings.slice(0, 5).map((w, i) => (
            <div key={i} className="faint">⚠ {w}</div>
          ))}
        </div>
      )}

      <div className="label mt" style={{ marginBottom: 4 }}>Vista previa</div>
      {parsed.questions.slice(0, 4).map((q) => (
        <div key={q.index} className="card flat" style={{ background: "var(--surface-2)", margin: "0 0 8px" }}>
          <div style={{ fontWeight: 600 }}>{q.index}. {q.statement.slice(0, 120)}</div>
          <div className="faint">
            {q.options.filter(Boolean).length} opciones · {q.correct ? `correcta ${q.correct}` : "sin respuesta"}
          </div>
        </div>
      ))}
      {parsed.questions.length > 4 && <p className="faint">…y {parsed.questions.length - 4} más.</p>}
    </Sheet>
  );
}

function Detail({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="mt">
      <div className="label" style={{ marginBottom: 4 }}>{label}</div>
      <div className="row wrap">
        {items.map((it, i) => (
          <Chip key={i}>{it.slice(0, 40)}</Chip>
        ))}
      </div>
    </div>
  );
}
