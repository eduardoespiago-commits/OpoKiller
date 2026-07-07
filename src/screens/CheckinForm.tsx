import { useState } from "react";
import type { DayType } from "../domain/types";
import { weekdayIndex } from "../domain/dates";
import { DAY_TYPE_LABEL, DAY_TYPE_MINUTES } from "../domain/planner";
import { saveCheckin } from "../db/actions";
import { useCheckin, useSettings } from "../hooks/useData";
import { Rating } from "../ui/components";
import { useToast } from "../ui/toast";

const DAY_TYPES: DayType[] = [
  "minimo",
  "ligero",
  "medio",
  "normal",
  "intensivo",
  "clase",
  "test",
  "descanso",
];

export function CheckinForm({
  date,
  onSaved,
}: {
  date: string;
  onSaved: (dayType: DayType) => void;
}) {
  const settings = useSettings();
  const existing = useCheckin(date);
  const toast = useToast();

  const defaultAvail = settings.availabilityByWeekday[weekdayIndex(date)] ?? 240;
  const [availability, setAvailability] = useState(existing?.availabilityMinutes ?? defaultAvail);
  const [energy, setEnergy] = useState<number>(existing?.energy ?? 3);
  const [fatigue, setFatigue] = useState<number>(existing?.fatigue ?? 2);
  const [focus, setFocus] = useState<number>(existing?.focus ?? 3);
  const [constraints, setConstraints] = useState(existing?.constraints ?? "");
  const [dayType, setDayType] = useState<DayType>(
    existing?.preferredDayType ?? guessDayType(defaultAvail, 2),
  );

  async function save() {
    await saveCheckin({
      date,
      availabilityMinutes: availability,
      energy,
      fatigue,
      focus,
      constraints,
      preferredDayType: dayType,
    });
    toast("Check-in guardado");
    onSaved(dayType);
  }

  return (
    <div>
      <label className="field">
        <span className="label">Tiempo disponible hoy (min)</span>
        <input
          type="number"
          min={0}
          step={10}
          value={availability}
          onChange={(e) => setAvailability(Number(e.target.value))}
        />
      </label>

      <div className="grid grid-3">
        <div>
          <span className="label">Energía</span>
          <Rating value={energy} onChange={setEnergy} max={5} />
        </div>
      </div>
      <div className="grid grid-2 mt">
        <div>
          <span className="label">Fatiga</span>
          <Rating value={fatigue} onChange={setFatigue} max={5} />
        </div>
        <div>
          <span className="label">Concentración prevista</span>
          <Rating value={focus} onChange={setFocus} max={5} />
        </div>
      </div>

      <div className="field mt">
        <span className="label">Tipo de día</span>
        <div className="seg" style={{ marginTop: 4 }}>
          {DAY_TYPES.map((d) => (
            <button
              key={d}
              className={dayType === d ? "active" : ""}
              onClick={() => setDayType(d)}
            >
              {DAY_TYPE_LABEL[d]}
            </button>
          ))}
        </div>
        <div className="faint" style={{ marginTop: 6 }}>
          Presupuesto: {DAY_TYPE_MINUTES[dayType]} min
          {fatigue >= 4 && dayType !== "minimo" && dayType !== "descanso" && (
            <> · Con fatiga alta, considera un día mínimo.</>
          )}
        </div>
      </div>

      <label className="field mt">
        <span className="label">Restricciones / notas (opcional)</span>
        <textarea
          value={constraints}
          onChange={(e) => setConstraints(e.target.value)}
          placeholder="Trabajo por la mañana, clase a las 18:00…"
        />
      </label>

      <button className="btn btn-primary btn-lg" onClick={save}>
        Guardar y generar plan
      </button>
    </div>
  );
}

function guessDayType(minutes: number, fatigue: number): DayType {
  if (fatigue >= 4) return "minimo";
  if (minutes <= 60) return "minimo";
  if (minutes <= 130) return "ligero";
  if (minutes <= 220) return "medio";
  if (minutes <= 290) return "normal";
  return "intensivo";
}
