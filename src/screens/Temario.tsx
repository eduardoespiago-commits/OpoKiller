import { useMemo, useState } from "react";
import type { Topic, TopicStatus } from "../domain/types";
import { formatShort } from "../domain/dates";
import { cycleProductStatus, updateTopic } from "../db/actions";
import { useProducts, useSubtopics, useTopics } from "../hooks/useData";
import { Bar, Chip, Sheet } from "../ui/components";
import { useToast } from "../ui/toast";

type FilterKey = "todos" | "material" | "parcial" | "empezado" | "consolidado" | "sin-tocar";

const STATUS_OPTIONS: TopicStatus[] = [
  "No iniciado",
  "Clase pendiente",
  "Clase vista",
  "Lectura inicial",
  "1.ª vuelta",
  "En repaso",
  "Preparado para test",
  "Consolidado",
  "Necesita actualización",
];

function hasMaterial(t: Topic): boolean {
  return ["Recibido", "Parcial", "Test disponible", "Actualizado"].includes(t.materialStatus);
}

export function Temario() {
  const topics = useTopics();
  const subtopics = useSubtopics();
  const toast = useToast();
  const [filter, setFilter] = useState<FilterKey>("material");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Topic | null>(null);

  const filtered = useMemo(() => {
    let list = [...topics].sort((a, b) => {
      if (a.block !== b.block) return a.block === "Común" ? -1 : 1;
      return a.number - b.number;
    });
    if (filter === "material") list = list.filter(hasMaterial);
    else if (filter === "parcial") list = list.filter((t) => t.materialStatus === "Parcial");
    else if (filter === "empezado") list = list.filter((t) => t.status !== "No iniciado");
    else if (filter === "consolidado") list = list.filter((t) => t.status === "Consolidado");
    else if (filter === "sin-tocar") list = list.filter((t) => hasMaterial(t) && t.status === "No iniciado");
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (t) =>
          t.officialId.toLowerCase().includes(q) ||
          t.title.toLowerCase().includes(q) ||
          String(t.number) === q,
      );
    }
    return list;
  }, [topics, filter, search]);

  const filters: { key: FilterKey; label: string }[] = [
    { key: "material", label: "Con material" },
    { key: "todos", label: "Todos (90)" },
    { key: "parcial", label: "Parciales" },
    { key: "empezado", label: "Empezados" },
    { key: "consolidado", label: "Consolidados" },
    { key: "sin-tocar", label: "Sin tocar" },
  ];

  return (
    <div>
      <h1>Temario</h1>
      <input
        placeholder="Buscar por número, ID o título…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ marginBottom: 10 }}
      />
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

      <div className="faint" style={{ marginBottom: 8 }}>{filtered.length} tema(s)</div>

      {filtered.map((t) => {
        const subs = subtopics.filter((s) => s.topicId === t.officialId);
        return (
          <div key={t.officialId} className="task" onClick={() => setSelected(t)} style={{ cursor: "pointer" }}>
            <div className="task-body">
              <div className="row wrap">
                <strong>{t.officialId}</strong>
                <Chip variant={t.block === "Común" ? "" : "primary"}>{t.block}</Chip>
                {t.materialStatus === "Parcial" && <Chip variant="warn">Parcial</Chip>}
                {hasMaterial(t) && t.materialStatus !== "Parcial" && <Chip variant="ok">Material</Chip>}
                {t.priority === "Alta" && <Chip variant="alta">Alta</Chip>}
              </div>
              <div className="task-title" style={{ fontWeight: 500, marginTop: 3 }}>
                {short(t.title)}
              </div>
              <div className="task-meta row wrap">
                <span>{t.status}</span>
                <span>· dominio {t.mastery}%</span>
                {t.accumulatedMinutes > 0 && <span>· {t.accumulatedMinutes} min</span>}
                {subs.length > 0 && <span>· {subs.length} subtema(s)</span>}
              </div>
              <div style={{ marginTop: 6, maxWidth: 260 }}>
                <Bar value={t.mastery} />
              </div>
            </div>
          </div>
        );
      })}

      {selected && (
        <TopicSheet
          topic={selected}
          onClose={() => setSelected(null)}
          onSave={async (patch) => {
            await updateTopic(selected.officialId, patch);
            toast("Tema actualizado");
            setSelected(null);
          }}
        />
      )}
    </div>
  );

  function short(s: string, n = 90): string {
    return s.length > n ? s.slice(0, n - 1) + "…" : s;
  }
}

function TopicSheet({
  topic,
  onClose,
  onSave,
}: {
  topic: Topic;
  onClose: () => void;
  onSave: (patch: Partial<Topic>) => void;
}) {
  const subtopics = useSubtopics().filter((s) => s.topicId === topic.officialId);
  const [status, setStatus] = useState<TopicStatus>(topic.status);
  const [mastery, setMastery] = useState(topic.mastery);
  const [priority, setPriority] = useState(topic.priority);
  const [notes, setNotes] = useState(topic.notes);

  return (
    <Sheet
      title={`${topic.officialId} · Tema ${topic.number}`}
      onClose={onClose}
      footer={
        <button
          className="btn btn-primary"
          style={{ flex: 1 }}
          onClick={() => onSave({ status, mastery, priority, notes })}
        >
          Guardar cambios
        </button>
      }
    >
      <p className="muted">{topic.title}</p>
      <div className="row wrap" style={{ marginBottom: 10 }}>
        <Chip>{topic.block}</Chip>
        <Chip variant="primary">{topic.materialStatus}</Chip>
        {topic.origin && <Chip>{topic.origin}</Chip>}
        {topic.lastStudyAt && <Chip>Últ. {formatShort(topic.lastStudyAt)}</Chip>}
        {topic.nextReviewAt && <Chip variant="accent">Repaso {formatShort(topic.nextReviewAt)}</Chip>}
      </div>

      {subtopics.length > 0 && (
        <div className="card flat" style={{ margin: "0 0 12px", background: "var(--surface-2)" }}>
          <div className="label" style={{ marginBottom: 6 }}>Subtemas</div>
          {subtopics.map((s) => (
            <div key={s.id} className="between" style={{ padding: "4px 0" }}>
              <span>{s.code} · {s.title}</span>
              <Chip variant={s.status === "No iniciado" ? "baja" : "ok"}>{s.status}</Chip>
            </div>
          ))}
        </div>
      )}

      <ProductsBlock topicId={topic.officialId} />

      <label className="field">
        <span className="label">Estado</span>
        <select value={status} onChange={(e) => setStatus(e.target.value as TopicStatus)}>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="label">Dominio ({mastery}%)</span>
        <input type="range" min={0} max={100} step={5} value={mastery} onChange={(e) => setMastery(Number(e.target.value))} />
      </label>
      <label className="field">
        <span className="label">Prioridad</span>
        <select value={priority} onChange={(e) => setPriority(e.target.value as Topic["priority"])}>
          <option value="Alta">Alta</option>
          <option value="Media">Media</option>
          <option value="Baja">Baja</option>
        </select>
      </label>
      <label className="field">
        <span className="label">Notas</span>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      {topic.notes && (
        <p className="faint">{topic.notes}</p>
      )}
    </Sheet>
  );
}

const PRODUCT_STATUS_VARIANT: Record<string, string> = {
  pendiente: "baja",
  iniciado: "warn",
  completado: "ok",
  "necesita-revision": "danger",
};
const PRODUCT_STATUS_LABEL: Record<string, string> = {
  pendiente: "Pendiente",
  iniciado: "Iniciado",
  completado: "Completado",
  "necesita-revision": "Revisar",
};

function ProductsBlock({ topicId }: { topicId: string }) {
  const products = useProducts(topicId);
  if (products.length === 0) return null;
  const done = products.filter((p) => p.status === "completado").length;
  return (
    <div className="card flat" style={{ margin: "0 0 12px", background: "var(--surface-2)" }}>
      <div className="between" style={{ marginBottom: 6 }}>
        <div className="label">Productos de estudio</div>
        <span className="faint">{done}/{products.length}</span>
      </div>
      {products.map((p) => (
        <div key={p.id} className="between" style={{ padding: "5px 0" }}>
          <span>{p.label}</span>
          <button
            className={`chip ${PRODUCT_STATUS_VARIANT[p.status]}`}
            style={{ cursor: "pointer" }}
            onClick={() => cycleProductStatus(p.id)}
            title="Tocar para cambiar estado"
          >
            {PRODUCT_STATUS_LABEL[p.status]}
          </button>
        </div>
      ))}
      <p className="faint" style={{ marginTop: 6 }}>Toca el estado para avanzarlo.</p>
    </div>
  );
}
