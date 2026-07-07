import { useMemo } from "react";
import { startOfWeek, todayISO } from "../domain/dates";
import { projectFirstPass } from "../domain/projection";
import {
  contactStreak,
  dueReviews,
  openErrors,
  pendingTests,
  topicCounts,
} from "../domain/selectors";
import {
  useAttempts,
  useErrors,
  useReviews,
  useSessions,
  useTests,
  useTopics,
} from "../hooks/useData";
import { Bar, Card, Chip, Stat } from "../ui/components";

export function Stats() {
  const today = todayISO();
  const topics = useTopics();
  const sessions = useSessions();
  const attempts = useAttempts();
  const reviews = useReviews();
  const errors = useErrors();
  const tests = useTests();

  const weekStart = startOfWeek(today);
  const monthStart = today.slice(0, 7);

  const weekMinutes = sessions
    .filter((s) => s.startedAt.slice(0, 10) >= weekStart)
    .reduce((a, s) => a + s.actualMinutes, 0);
  const monthMinutes = sessions
    .filter((s) => s.startedAt.slice(0, 7) === monthStart)
    .reduce((a, s) => a + s.actualMinutes, 0);

  const counts = topicCounts(topics);
  const projection = useMemo(() => projectFirstPass(topics, sessions, today), [topics, sessions, today]);
  const streak = contactStreak(sessions, today);

  const avgNet =
    attempts.length > 0
      ? (attempts.reduce((a, x) => a + x.netScore, 0) / attempts.length).toFixed(2)
      : "—";

  const bestBlock = useMemo(() => productiveHour(sessions), [sessions]);

  // simple weekly minutes for last 6 weeks
  const weekly = useMemo(() => weeklyMinutes(sessions, today), [sessions, today]);
  const maxWeek = Math.max(1, ...weekly.map((w) => w.minutes));

  return (
    <div>
      <h1>Estadísticas</h1>

      <Card>
        <div className="grid grid-3">
          <Stat label="Esta semana" value={`${round1(weekMinutes / 60)} h`} small />
          <Stat label="Este mes" value={`${round1(monthMinutes / 60)} h`} small />
          <Stat label="Racha" value={`${streak} d`} small />
        </div>
      </Card>

      <Card>
        <div className="label" style={{ marginBottom: 10 }}>Temario</div>
        <div className="grid grid-3">
          <Stat label="Con material" value={counts.withMaterial} sub={`de ${counts.total}`} small />
          <Stat label="Empezados" value={counts.started} small />
          <Stat label="Consolidados" value={counts.consolidated} small />
        </div>
        <div className="mt">
          <div className="between faint" style={{ marginBottom: 4 }}>
            <span>Avance primera vuelta</span>
            <span>{projection.firstPassDone}/{projection.topicsWithMaterial}</span>
          </div>
          <Bar value={projection.topicsWithMaterial ? (projection.firstPassDone / projection.topicsWithMaterial) * 100 : 0} />
        </div>
      </Card>

      <Card>
        <div className="label" style={{ marginBottom: 8 }}>Proyección</div>
        <p className="muted" style={{ marginTop: 0 }}>{projection.message}</p>
        <div className="row wrap">
          <Chip variant="primary">{projection.avgTopicsPerWeek} temas/semana</Chip>
          {projection.weeksToFinishFirstPass != null && (
            <Chip variant="accent">~{projection.weeksToFinishFirstPass} semanas restantes</Chip>
          )}
        </div>
      </Card>

      <Card>
        <div className="label" style={{ marginBottom: 8 }}>Tests</div>
        <div className="grid grid-3">
          <Stat label="Intentos" value={attempts.length} small />
          <Stat label="Nota media" value={avgNet} small />
          <Stat label="Pendientes" value={pendingTests(tests).length} small />
        </div>
        {attempts.length > 0 && (
          <div className="table-wrap mt">
            <table>
              <thead>
                <tr><th>Fecha</th><th>Nota</th><th>✔</th><th>✕</th><th>○</th></tr>
              </thead>
              <tbody>
                {[...attempts].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 8).map((a) => (
                  <tr key={a.id}>
                    <td>{a.startedAt.slice(0, 10)}</td>
                    <td><strong>{a.netScore}</strong></td>
                    <td>{a.correct}</td>
                    <td>{a.incorrect}</td>
                    <td>{a.blank}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <div className="label" style={{ marginBottom: 8 }}>Constancia</div>
        <div className="row" style={{ alignItems: "flex-end", gap: 6, height: 90 }}>
          {weekly.map((w) => (
            <div key={w.label} style={{ flex: 1, textAlign: "center" }}>
              <div
                style={{
                  height: `${(w.minutes / maxWeek) * 70}px`,
                  background: "var(--primary)",
                  borderRadius: 4,
                  minHeight: 2,
                }}
                title={`${round1(w.minutes / 60)} h`}
              />
              <div className="faint" style={{ fontSize: "0.65rem", marginTop: 4 }}>{w.label}</div>
            </div>
          ))}
        </div>
        <div className="row wrap mt">
          <Chip>Franja más productiva: {bestBlock}</Chip>
          <Chip>{dueReviews(reviews, today).length} repasos vencidos</Chip>
          <Chip>{openErrors(errors).length} errores abiertos</Chip>
        </div>
      </Card>
    </div>
  );
}

function weeklyMinutes(sessions: { startedAt: string; actualMinutes: number }[], today: string) {
  const out: { label: string; minutes: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const ws = startOfWeek(shift(today, -i * 7));
    const we = shift(ws, 7);
    const minutes = sessions
      .filter((s) => s.startedAt.slice(0, 10) >= ws && s.startedAt.slice(0, 10) < we)
      .reduce((a, s) => a + s.actualMinutes, 0);
    out.push({ label: ws.slice(5).replace("-", "/"), minutes });
  }
  return out;
}

function productiveHour(sessions: { startedAt: string; actualMinutes: number }[]): string {
  if (sessions.length === 0) return "—";
  const buckets = new Map<number, number>();
  for (const s of sessions) {
    const h = new Date(s.startedAt).getHours();
    buckets.set(h, (buckets.get(h) ?? 0) + s.actualMinutes);
  }
  let best = -1;
  let bestMin = 0;
  for (const [h, m] of buckets) if (m > bestMin) { best = h; bestMin = m; }
  return best >= 0 ? `${best}:00-${best + 1}:00` : "—";
}

function shift(date: string, days: number): string {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
