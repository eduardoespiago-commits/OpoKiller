import { useMemo, useState } from "react";
import type { ReviewType } from "../domain/types";
import { formatShort, todayISO } from "../domain/dates";
import {
  dueBucket,
  DUE_BUCKET_LABEL,
  pickReviewType,
  REVIEW_TYPE_LABEL,
  type DueBucket,
} from "../domain/review";
import { hasMaterial, isConsolidated } from "../domain/planner";
import { completeReview, reviewTopicNow } from "../db/actions";
import { useReviews, useTopics } from "../hooks/useData";
import { Card, Chip, Empty, Rating, Sheet } from "../ui/components";
import { useToast } from "../ui/toast";

const BUCKET_ORDER: DueBucket[] = ["critico", "mas-semana", "1-3-dias", "hoy"];

interface ActiveReview {
  reviewId: string | null; // null => on-demand topic review
  topicId: string;
  title: string;
  reviewType: ReviewType;
}

export function Reviews() {
  const today = todayISO();
  const reviews = useReviews();
  const topics = useTopics();
  const toast = useToast();
  const [active, setActive] = useState<ActiveReview | null>(null);

  const topicById = useMemo(
    () => new Map(topics.map((t) => [t.officialId, t])),
    [topics],
  );

  const due = reviews.filter(
    (r) => !r.completedAt && dueBucket(r.scheduledAt, today) !== "futuro",
  );
  const byBucket = useMemo(() => {
    const m = new Map<DueBucket, typeof due>();
    for (const r of due) {
      const b = dueBucket(r.scheduledAt, today);
      const arr = m.get(b) ?? [];
      arr.push(r);
      m.set(b, arr);
    }
    return m;
  }, [due, today]);

  const upcoming = reviews
    .filter((r) => !r.completedAt && dueBucket(r.scheduledAt, today) === "futuro")
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));

  // Any topic with material can be reviewed on demand, even before it's due.
  const reviewable = topics
    .filter((t) => hasMaterial(t) && !isConsolidated(t) && t.status !== "No iniciado")
    .sort((a, b) => (a.nextReviewAt ?? "9999").localeCompare(b.nextReviewAt ?? "9999"));

  async function handleDone(recall: number) {
    if (!active) return;
    if (active.reviewId) await completeReview(active.reviewId, recall);
    else await reviewTopicNow(active.topicId, recall);
    toast("Repaso registrado, próxima fecha ajustada");
    setActive(null);
  }

  return (
    <div>
      <h1>Repasos</h1>
      <p className="faint" style={{ marginTop: -6 }}>
        Prioriza recuperar sin mirar; no releer. Puntúa 0-5 y la próxima fecha se ajusta sola.
      </p>

      {BUCKET_ORDER.map((bucket) => {
        const list = byBucket.get(bucket);
        if (!list || list.length === 0) return null;
        return (
          <Card key={bucket}>
            <div className="between" style={{ marginBottom: 8 }}>
              <div className="label">{DUE_BUCKET_LABEL[bucket]}</div>
              <Chip variant={bucket === "critico" ? "danger" : bucket === "hoy" ? "primary" : "warn"}>
                {list.length}
              </Chip>
            </div>
            {list.map((r) => {
              const topic = topicById.get(r.topicId);
              const overdue = Math.max(0, daysBetween(today, r.scheduledAt));
              return (
                <div
                  key={r.id}
                  className="task"
                  style={{ cursor: "pointer" }}
                  onClick={() =>
                    setActive({ reviewId: r.id, topicId: r.topicId, title: topic?.title ?? r.topicId, reviewType: r.reviewType })
                  }
                >
                  <div className="task-body">
                    <div className="row wrap">
                      <strong>{r.topicId}</strong>
                      {topic && <span className="muted">{short(topic.title)}</span>}
                    </div>
                    <div className="task-meta">
                      {REVIEW_TYPE_LABEL[r.reviewType]} · programado {formatShort(r.scheduledAt)}
                      {overdue > 0 ? ` · vencido ${overdue} d` : " · hoy"}
                    </div>
                  </div>
                  <button className="btn btn-sm btn-primary">Hacer</button>
                </div>
              );
            })}
          </Card>
        );
      })}

      <Card>
        <div className="label" style={{ marginBottom: 8 }}>Repasar un tema</div>
        {reviewable.length === 0 ? (
          <Empty icon="🌱" title="Aún no hay temas para repasar" hint="Estudia un tema en Hoy y aparecerá aquí para repasarlo." />
        ) : (
          reviewable.slice(0, 20).map((t) => (
            <div
              key={t.officialId}
              className="task"
              style={{ cursor: "pointer" }}
              onClick={() =>
                setActive({ reviewId: null, topicId: t.officialId, title: t.title, reviewType: pickReviewType(t.reviewStage) })
              }
            >
              <div className="task-body">
                <div className="row wrap">
                  <strong>{t.officialId}</strong>
                  <span className="muted">{short(t.title)}</span>
                </div>
                <div className="task-meta">
                  fase {t.reviewStage} · dominio {t.mastery}%
                  {t.nextReviewAt && ` · próximo ${formatShort(t.nextReviewAt)}`}
                </div>
              </div>
              <button className="btn btn-sm">Repasar</button>
            </div>
          ))
        )}
      </Card>

      {upcoming.length > 0 && (
        <Card className="flat">
          <div className="label" style={{ marginBottom: 6 }}>Próximos</div>
          <div className="row wrap">
            {upcoming.slice(0, 12).map((r) => (
              <Chip key={r.id}>{r.topicId} · {formatShort(r.scheduledAt)}</Chip>
            ))}
          </div>
        </Card>
      )}

      {active && (
        <ReviewSheet active={active} onClose={() => setActive(null)} onDone={handleDone} />
      )}
    </div>
  );
}

function ReviewSheet({
  active,
  onClose,
  onDone,
}: {
  active: ActiveReview;
  onClose: () => void;
  onDone: (recall: number) => void;
}) {
  const [recall, setRecall] = useState<number | null>(null);
  return (
    <Sheet
      title={`Repaso ${active.topicId}`}
      onClose={onClose}
      footer={
        <button
          className="btn btn-primary"
          style={{ flex: 1 }}
          disabled={recall == null}
          onClick={() => onDone(recall!)}
        >
          Registrar y reprogramar
        </button>
      }
    >
      <p className="muted">{active.title}</p>
      <Chip variant="accent">{REVIEW_TYPE_LABEL[active.reviewType]}</Chip>
      <ol style={{ paddingLeft: 18, marginTop: 10 }} className="muted">
        <li>Cierra el material.</li>
        <li>{recallInstruction(active.reviewType)}</li>
        <li>Corrige y anota lo que falló.</li>
      </ol>
      <div className="field mt">
        <span className="label">¿Cuánto has recuperado? (0-5)</span>
        <Rating value={recall} onChange={setRecall} labels={["No recuerdo nada", "Dominio sólido"]} />
      </div>
    </Sheet>
  );
}

function recallInstruction(type: ReviewType): string {
  switch (type) {
    case "esquema":
      return "Reconstruye el esquema del tema en una hoja en blanco.";
    case "preguntas-cortas":
      return "Responde 8-10 preguntas cortas de memoria.";
    case "flashcards":
      return "Pasa las flashcards del tema sin mirar la respuesta.";
    case "mini-test":
      return "Haz un mini test de 10 preguntas del tema.";
    case "explicacion-oral":
      return "Explica el tema en voz alta como si dieras clase.";
    case "tabla-datos":
      return "Reproduce de memoria la tabla de cifras/plazos.";
    case "procedimiento":
      return "Explica el procedimiento paso a paso sin mirar.";
    case "errores":
      return "Repite los errores registrados del tema.";
    case "test-acumulativo":
      return "Haz un test acumulativo que incluya este tema.";
  }
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(a).getTime() - new Date(b).getTime()) / 86400000);
}
function short(s: string, n = 46): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
