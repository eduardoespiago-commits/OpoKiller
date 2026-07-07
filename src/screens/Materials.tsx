import { useMemo, useState } from "react";
import { formatShort } from "../domain/dates";
import { addMaterial, setMaterialProcessed } from "../db/actions";
import { useMaterials, useTopics } from "../hooks/useData";
import { Card, Chip, Empty, Sheet } from "../ui/components";
import { useToast } from "../ui/toast";
import { WordImport } from "./WordImport";

export function Materials() {
  const materials = useMaterials();
  const topics = useTopics();
  const toast = useToast();
  const [tab, setTab] = useState<"bandeja" | "todos">("bandeja");
  const [showAdd, setShowAdd] = useState(false);
  const [showWord, setShowWord] = useState(false);

  const inbox = useMemo(() => materials.filter((m) => !m.processed), [materials]);
  const list = tab === "bandeja" ? inbox : materials;

  return (
    <div>
      <div className="between">
        <h1>Materiales</h1>
        <div className="btn-row">
          <button className="btn btn-sm" onClick={() => setShowWord((v) => !v)}>📝 Importar Word</button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>+ Añadir</button>
        </div>
      </div>

      {showWord && (
        <Card>
          <div className="label" style={{ marginBottom: 8 }}>Importar tema o test en Word (.docx)</div>
          <WordImport onImported={() => setTab("todos")} />
        </Card>
      )}

      <div className="scroll-x" style={{ marginBottom: 12 }}>
        <button className={`btn btn-sm ${tab === "bandeja" ? "btn-primary" : ""}`} onClick={() => setTab("bandeja")}>
          Bandeja de entrada ({inbox.length})
        </button>
        <button className={`btn btn-sm ${tab === "todos" ? "btn-primary" : ""}`} onClick={() => setTab("todos")}>
          Todos ({materials.length})
        </button>
      </div>

      {list.length === 0 ? (
        <Card>
          <Empty icon="📥" title={tab === "bandeja" ? "Bandeja vacía" : "Sin materiales"} hint="Cuando llegue material nuevo, regístralo aquí antes de estudiarlo." />
        </Card>
      ) : (
        list.map((m) => (
          <div key={m.id} className="task">
            <div className="task-body">
              <div className="row wrap">
                <strong>{m.name}</strong>
                <Chip>{m.type}</Chip>
                {m.origin && <Chip variant={m.origin === "Semanal" ? "accent" : ""}>{m.origin}</Chip>}
                {m.processed ? <Chip variant="ok">Procesado</Chip> : <Chip variant="warn">Pendiente</Chip>}
              </div>
              <div className="task-meta">
                {m.date && <>Recibido {formatShort(m.date)} · </>}
                {m.topicsRaw && <>Temas: {m.topicsRaw}</>}
              </div>
              {m.nextAction && <div className="faint">→ {m.nextAction}</div>}
              <div className="btn-row" style={{ marginTop: 8 }}>
                <button
                  className="btn btn-sm"
                  onClick={async () => {
                    await setMaterialProcessed(m.id, !m.processed);
                    toast(m.processed ? "Marcado como pendiente" : "Marcado como procesado");
                  }}
                >
                  {m.processed ? "Marcar pendiente" : "Marcar procesado"}
                </button>
              </div>
            </div>
          </div>
        ))
      )}

      {showAdd && (
        <AddMaterial
          topics={topics.map((t) => t.officialId)}
          onClose={() => setShowAdd(false)}
          onSave={async (name, type, topicId) => {
            await addMaterial(name, type, topicId);
            toast("Material registrado en la bandeja");
            setShowAdd(false);
          }}
        />
      )}
    </div>
  );
}

function AddMaterial({
  topics,
  onClose,
  onSave,
}: {
  topics: string[];
  onClose: () => void;
  onSave: (name: string, type: string, topicId: string | null) => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState("Tema Word");
  const [topicId, setTopicId] = useState("");
  return (
    <Sheet
      title="Añadir material"
      onClose={onClose}
      footer={
        <button
          className="btn btn-primary"
          style={{ flex: 1 }}
          disabled={!name.trim()}
          onClick={() => onSave(name.trim(), type, topicId || null)}
        >
          Guardar en bandeja
        </button>
      }
    >
      <label className="field">
        <span className="label">Nombre del archivo / material</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tema 37 - 2026.docx" />
      </label>
      <label className="field">
        <span className="label">Tipo</span>
        <select value={type} onChange={(e) => setType(e.target.value)}>
          {["Tema Word", "Tema Word / clase", "Test semanal", "Plantilla corregida", "Vídeo / clase", "PDF", "Esquema", "Resumen", "Enlace", "Documento propio", "Otro"].map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="label">Tema oficial (opcional)</span>
        <select value={topicId} onChange={(e) => setTopicId(e.target.value)}>
          <option value="">— sin asignar —</option>
          {topics.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </label>
    </Sheet>
  );
}
