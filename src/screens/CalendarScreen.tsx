import { useMemo, useState } from "react";
import {
  addDays,
  formatShort,
  startOfWeek,
  todayISO,
  weekDates,
  weekdayName,
} from "../domain/dates";
import type { StudyTask } from "../domain/types";
import { projectFirstPass } from "../domain/projection";
import {
  deleteTask,
  generatePlanForDay,
  moveTask,
  setTaskStatus,
} from "../db/actions";
import {
  useAllTasks,
  useSessions,
  useTopics,
} from "../hooks/useData";
import { Card, Chip, Segmented, Sheet, Stat } from "../ui/components";
import { useToast } from "../ui/toast";

export function CalendarScreen() {
  const today = todayISO();
  const tasks = useAllTasks();
  const sessions = useSessions();
  const topics = useTopics();
  const toast = useToast();
  const [view, setView] = useState<"semana" | "mes">("semana");
  const [weekStart, setWeekStart] = useState(startOfWeek(today));
  const [monthOffset, setMonthOffset] = useState(0);
  const [taskSheet, setTaskSheet] = useState<StudyTask | null>(null);

  const projection = useMemo(
    () => projectFirstPass(topics, sessions, today),
    [topics, sessions, today],
  );

  const days = weekDates(weekStart);
  const tasksByDay = useMemo(() => {
    const map = new Map<string, typeof tasks>();
    for (const t of tasks) {
      const arr = map.get(t.plannedDate) ?? [];
      arr.push(t);
      map.set(t.plannedDate, arr);
    }
    return map;
  }, [tasks]);

  const minutesByDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of sessions) {
      const d = s.startedAt.slice(0, 10);
      map.set(d, (map.get(d) ?? 0) + s.actualMinutes);
    }
    return map;
  }, [sessions]);

  return (
    <div>
      <div className="between">
        <h1>Calendario</h1>
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: "semana", label: "Semana" },
            { value: "mes", label: "Mes" },
          ]}
        />
      </div>

      <Card>
        <div className="between">
          <Stat
            label="Proyección primera vuelta"
            value={
              projection.weeksToFinishFirstPass != null
                ? `${projection.weeksToFinishFirstPass} sem`
                : "—"
            }
            small
          />
          <Stat label="Ritmo" value={`${projection.avgTopicsPerWeek}/sem`} small />
          <Stat
            label="Avance"
            value={`${projection.firstPassDone}/${projection.topicsWithMaterial}`}
            small
          />
        </div>
        <p className="faint mt">{projection.message}</p>
      </Card>

      {view === "semana" ? (
        <Card>
          <div className="between" style={{ marginBottom: 10 }}>
            <button className="btn btn-sm" onClick={() => setWeekStart(addDays(weekStart, -7))}>
              ← Anterior
            </button>
            <strong>
              {formatShort(weekStart)} – {formatShort(addDays(weekStart, 6))}
            </strong>
            <button className="btn btn-sm" onClick={() => setWeekStart(addDays(weekStart, 7))}>
              Siguiente →
            </button>
          </div>
          <div className="stack">
            {days.map((d) => {
              const dayTasks = (tasksByDay.get(d) ?? []).filter((t) => t.status !== "aplazada");
              const planned = dayTasks.reduce((s, t) => s + t.plannedMinutes, 0);
              const real = minutesByDay.get(d) ?? 0;
              const isToday = d === today;
              return (
                <div
                  key={d}
                  className="card flat"
                  style={{
                    margin: 0,
                    background: isToday ? "var(--primary-soft)" : "var(--surface-2)",
                  }}
                >
                  <div className="between">
                    <strong>
                      {weekdayName(d)} {formatShort(d)}
                    </strong>
                    <span className="faint">
                      plan {Math.round(planned / 6) / 10}h · real {Math.round(real / 6) / 10}h
                    </span>
                  </div>
                  <div className="row wrap" style={{ marginTop: 6 }}>
                    {dayTasks.length === 0 && <span className="faint">Sin tareas</span>}
                    {dayTasks.map((t) => (
                      <button
                        key={t.id}
                        className="chip"
                        title={t.title}
                        onClick={() => setTaskSheet(t)}
                        style={{ opacity: t.status === "completada" ? 0.55 : 1, cursor: "pointer" }}
                      >
                        <span className={`dot t-${t.type}`} /> {t.topicId ?? label(t.type)}
                        {t.status === "completada" ? " ✓" : ""}
                      </button>
                    ))}
                  </div>
                  {dayTasks.length === 0 && (
                    <button
                      className="btn btn-sm mt"
                      onClick={async () => {
                        await generatePlanForDay(d, "normal");
                        toast(`Plan generado para ${weekdayName(d)}`);
                      }}
                    >
                      Generar plan
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      ) : (
        <MonthView
          monthOffset={monthOffset}
          setMonthOffset={setMonthOffset}
          tasksByDay={tasksByDay}
          minutesByDay={minutesByDay}
          today={today}
        />
      )}

      {taskSheet && (
        <TaskActionSheet
          task={taskSheet}
          weekStart={weekStart}
          onClose={() => setTaskSheet(null)}
          onMove={async (date) => {
            await moveTask(taskSheet.id, date);
            toast("Tarea movida");
            setTaskSheet(null);
          }}
          onToggle={async () => {
            await setTaskStatus(taskSheet.id, taskSheet.status === "completada" ? "pendiente" : "completada");
            setTaskSheet(null);
          }}
          onDelete={async () => {
            await deleteTask(taskSheet.id);
            toast("Tarea eliminada");
            setTaskSheet(null);
          }}
        />
      )}
    </div>
  );
}

function TaskActionSheet({
  task,
  weekStart,
  onClose,
  onMove,
  onToggle,
  onDelete,
}: {
  task: StudyTask;
  weekStart: string;
  onClose: () => void;
  onMove: (date: string) => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const week = weekDates(weekStart);
  return (
    <Sheet title={task.title} onClose={onClose}>
      <div className="row wrap" style={{ marginBottom: 8 }}>
        {task.topicId && <Chip>{task.topicId}</Chip>}
        <Chip variant="primary">{task.plannedMinutes} min</Chip>
        <Chip variant={task.status === "completada" ? "ok" : "baja"}>{task.status}</Chip>
      </div>
      <p className="faint">{task.expectedOutput}</p>
      <div className="label mt" style={{ marginBottom: 6 }}>Mover a</div>
      <div className="row wrap">
        {week.map((d) => (
          <button
            key={d}
            className={`btn btn-sm ${d === task.plannedDate ? "btn-primary" : ""}`}
            onClick={() => onMove(d)}
          >
            {weekdayName(d).slice(0, 3)} {formatShort(d)}
          </button>
        ))}
      </div>
      <div className="btn-row mt">
        <button className="btn btn-primary" style={{ flex: 1 }} onClick={onToggle}>
          {task.status === "completada" ? "Marcar pendiente" : "✓ Completar"}
        </button>
        <button className="btn btn-danger" onClick={onDelete}>Eliminar</button>
      </div>
    </Sheet>
  );
}

function label(type: string): string {
  const m: Record<string, string> = {
    repaso: "Repaso",
    test: "Test",
    errores: "Errores",
    cierre: "Cierre",
    recuperacion: "Recup.",
  };
  return m[type] ?? type;
}

function MonthView({
  monthOffset,
  setMonthOffset,
  tasksByDay,
  minutesByDay,
  today,
}: {
  monthOffset: number;
  setMonthOffset: (n: number) => void;
  tasksByDay: Map<string, { status: string }[]>;
  minutesByDay: Map<string, number>;
  today: string;
}) {
  const base = new Date();
  base.setMonth(base.getMonth() + monthOffset, 1);
  const year = base.getFullYear();
  const month = base.getMonth();
  const monthName = base.toLocaleDateString("es-ES", { month: "long", year: "numeric" });
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }

  return (
    <Card>
      <div className="between" style={{ marginBottom: 10 }}>
        <button className="btn btn-sm" onClick={() => setMonthOffset(monthOffset - 1)}>←</button>
        <strong style={{ textTransform: "capitalize" }}>{monthName}</strong>
        <button className="btn btn-sm" onClick={() => setMonthOffset(monthOffset + 1)}>→</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
        {["L", "M", "X", "J", "V", "S", "D"].map((d) => (
          <div key={d} className="faint center" style={{ fontSize: "0.72rem" }}>{d}</div>
        ))}
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const dayNum = Number(d.slice(-2));
          const dayTasks = (tasksByDay.get(d) ?? []).filter((t) => t.status !== "aplazada");
          const real = minutesByDay.get(d) ?? 0;
          const isToday = d === today;
          return (
            <div
              key={i}
              style={{
                minHeight: 46,
                borderRadius: 8,
                border: "1px solid var(--border)",
                padding: 4,
                background: isToday ? "var(--primary-soft)" : "var(--surface)",
                fontSize: "0.72rem",
              }}
            >
              <div style={{ fontWeight: 700 }}>{dayNum}</div>
              {dayTasks.length > 0 && (
                <div style={{ color: "var(--primary)" }}>{dayTasks.length}t</div>
              )}
              {real > 0 && <div className="faint">{Math.round(real / 6) / 10}h</div>}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
