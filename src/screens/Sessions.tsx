import { useMemo } from "react";
import { formatShort } from "../domain/dates";
import { useSessions } from "../hooks/useData";
import { Card, Chip, Empty, Stat } from "../ui/components";

export function Sessions() {
  const sessions = useSessions();

  const finished = useMemo(
    () =>
      [...sessions]
        .filter((s) => s.endedAt)
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
    [sessions],
  );

  const totalMin = finished.reduce((s, x) => s + x.actualMinutes, 0);
  const avgFocus =
    finished.length > 0
      ? (finished.reduce((s, x) => s + (x.focusScore ?? 0), 0) / finished.length).toFixed(1)
      : "—";
  const abandoned = finished.filter((s) => (s.completedPercentage ?? 0) < 40).length;

  return (
    <div>
      <h1>Sesiones</h1>
      <p className="faint" style={{ marginTop: -6 }}>
        Para empezar una sesión, abre una tarea desde <strong>Hoy</strong> y pulsa «Empezar sesión».
      </p>

      <Card>
        <div className="grid grid-3">
          <Stat label="Sesiones" value={finished.length} small />
          <Stat label="Tiempo total" value={`${Math.round(totalMin / 60 * 10) / 10} h`} small />
          <Stat label="Foco medio" value={`${avgFocus}/5`} small />
        </div>
        {abandoned > 0 && (
          <div className="faint mt">{abandoned} sesión(es) con menos del 40% completado.</div>
        )}
      </Card>

      {finished.length === 0 ? (
        <Card>
          <Empty icon="⏱️" title="Aún no has registrado sesiones" hint="Cada sesión guarda minutos, dominio y siguiente acción automáticamente." />
        </Card>
      ) : (
        <Card>
          <div className="label" style={{ marginBottom: 8 }}>Historial</div>
          {finished.slice(0, 60).map((s) => (
            <div key={s.id} className="task">
              <div className="task-body">
                <div className="row wrap">
                  <span className={`dot t-${s.type}`} />
                  <strong>{s.title}</strong>
                </div>
                <div className="task-meta row wrap">
                  <span>{formatShort(s.startedAt.slice(0, 10))}</span>
                  <span>· {s.actualMinutes} min</span>
                  {s.completedPercentage != null && <span>· {s.completedPercentage}%</span>}
                  {s.recall != null && <span>· dominio {s.recall}/5</span>}
                </div>
                {s.notes && <div className="faint">{s.notes}</div>}
              </div>
              {s.topicId && <Chip>{s.topicId}</Chip>}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
