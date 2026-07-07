import { useRef } from "react";
import { saveSettings } from "../db/actions";
import { useSettings } from "../hooks/useData";
import { exportToXlsx } from "../db/excel";
import {
  downloadBackup,
  restoreBackup,
  triggerDownload,
  dateStamp,
  type BackupFile,
} from "../db/backup";
import { db } from "../db/db";
import { loadSeed } from "../db/seed";
import { requestNotificationPermission } from "../db/notifications";
import { Card } from "../ui/components";
import { useToast } from "../ui/toast";
import { ExcelImport } from "./ExcelImport";

export function Settings() {
  const settings = useSettings();
  const toast = useToast();
  const backupInput = useRef<HTMLInputElement>(null);

  async function onBackup(file: File) {
    try {
      const text = await file.text();
      const data = JSON.parse(text) as BackupFile;
      await restoreBackup(data);
      toast("Copia restaurada");
    } catch (err) {
      console.error(err);
      toast("Copia no válida");
    }
  }

  const daysSinceBackup = settings.lastBackupAt
    ? Math.floor((Date.now() - new Date(settings.lastBackupAt).getTime()) / 86400000)
    : null;

  return (
    <div>
      <h1>Ajustes</h1>

      <Card>
        <div className="label" style={{ marginBottom: 10 }}>Objetivo de estudio</div>
        <label className="field">
          <span className="label">Horas semanales objetivo ({settings.weeklyTargetHours} h)</span>
          <input
            type="range" min={4} max={50} step={1}
            value={settings.weeklyTargetHours}
            onChange={(e) => saveSettings({ weeklyTargetHours: Number(e.target.value) })}
          />
        </label>
        <div className="grid grid-3">
          <PctField label="Actual" value={settings.currentTopicPct} onChange={(v) => saveSettings({ currentTopicPct: v })} />
          <PctField label="Atraso" value={settings.backlogPct} onChange={(v) => saveSettings({ backlogPct: v })} />
          <PctField label="Repasos" value={settings.reviewPct} onChange={(v) => saveSettings({ reviewPct: v })} />
        </div>
        <div className="grid grid-2 mt">
          <label className="field">
            <span className="label">Máx. temas actuales</span>
            <input type="number" min={1} max={4} value={settings.maxCurrentTopics} onChange={(e) => saveSettings({ maxCurrentTopics: Number(e.target.value) })} />
          </label>
          <label className="field">
            <span className="label">Máx. temas atrasados</span>
            <input type="number" min={0} max={3} value={settings.maxBacklogTopics} onChange={(e) => saveSettings({ maxBacklogTopics: Number(e.target.value) })} />
          </label>
        </div>
      </Card>

      <Card>
        <div className="label" style={{ marginBottom: 10 }}>Pomodoro y penalización</div>
        <div className="grid grid-2">
          <label className="field">
            <span className="label">Foco (min)</span>
            <input type="number" min={10} max={90} value={settings.pomodoroPreset} onChange={(e) => saveSettings({ pomodoroPreset: Number(e.target.value) })} />
          </label>
          <label className="field">
            <span className="label">Descanso (min)</span>
            <input type="number" min={3} max={30} value={settings.pomodoroBreak} onChange={(e) => saveSettings({ pomodoroBreak: Number(e.target.value) })} />
          </label>
        </div>
        <div className="grid grid-3">
          <label className="field">
            <span className="label">Acierto</span>
            <input type="number" step={0.0001} value={settings.penaltyCorrect} onChange={(e) => saveSettings({ penaltyCorrect: Number(e.target.value) })} />
          </label>
          <label className="field">
            <span className="label">Error</span>
            <input type="number" step={0.0001} value={settings.penaltyIncorrect} onChange={(e) => saveSettings({ penaltyIncorrect: Number(e.target.value) })} />
          </label>
          <label className="field">
            <span className="label">Blanco</span>
            <input type="number" step={0.0001} value={settings.penaltyBlank} onChange={(e) => saveSettings({ penaltyBlank: Number(e.target.value) })} />
          </label>
        </div>
      </Card>

      <Card>
        <div className="label" style={{ marginBottom: 10 }}>Apariencia y avisos</div>
        <div className="seg">
          {(["auto", "claro", "oscuro"] as const).map((t) => (
            <button key={t} className={settings.theme === t ? "active" : ""} onClick={() => saveSettings({ theme: t })}>
              {t === "auto" ? "Automático" : t === "claro" ? "Claro" : "Oscuro"}
            </button>
          ))}
        </div>
        <label className="between mt" style={{ padding: "6px 0" }}>
          <span>Notificaciones del navegador</span>
          <input
            type="checkbox"
            style={{ width: "auto" }}
            checked={settings.notificationsEnabled}
            onChange={async (e) => {
              if (e.target.checked) {
                const ok = await requestNotificationPermission();
                await saveSettings({ notificationsEnabled: ok });
                toast(ok ? "Notificaciones activadas" : "Permiso denegado por el navegador");
              } else {
                await saveSettings({ notificationsEnabled: false });
              }
            }}
          />
        </label>
        <p className="faint">Recordatorios de sesión, repasos y cierre. La app funciona igual sin ellas.</p>
      </Card>

      <Card>
        <div className="label" style={{ marginBottom: 10 }}>Importar Excel</div>
        <p className="faint" style={{ marginTop: 0 }}>
          Importa una versión más reciente del Excel. Se compara con tus datos y nunca sobrescribe tu progreso (minutos, dominio, estados). Puedes deshacer.
        </p>
        <ExcelImport variant="block" onImported={() => toast("Importación aplicada")} />
      </Card>

      <Card>
        <div className="label" style={{ marginBottom: 10 }}>Copias de seguridad</div>
        {daysSinceBackup != null && daysSinceBackup >= 7 && (
          <div className="card flat" style={{ background: "var(--warn-soft)", margin: "0 0 10px" }}>
            ⚠ Última copia hace {daysSinceBackup} días. Conviene exportar una copia.
          </div>
        )}
        <p className="faint" style={{ marginTop: 0 }}>
          {settings.lastBackupAt
            ? `Última copia: ${new Date(settings.lastBackupAt).toLocaleString("es-ES")}`
            : "Todavía no has hecho ninguna copia."}
        </p>
        <div className="btn-row">
          <button className="btn btn-primary" onClick={() => downloadBackup().then(() => toast("Copia JSON descargada"))}>
            ⬇ Exportar copia (JSON)
          </button>
          <button className="btn" onClick={async () => {
            const blob = await exportToXlsx();
            triggerDownload(blob, `opokiller-${dateStamp()}.xlsx`);
            toast("Excel exportado");
          }}>
            ⬇ Exportar Excel
          </button>
          <input
            ref={backupInput}
            type="file"
            accept=".json"
            style={{ display: "none" }}
            onChange={(e) => e.target.files?.[0] && onBackup(e.target.files[0])}
          />
          <button className="btn" onClick={() => backupInput.current?.click()}>⬆ Restaurar copia</button>
        </div>
      </Card>

      <Card>
        <div className="label" style={{ marginBottom: 10 }}>Datos</div>
        <div className="btn-row">
          <button
            className="btn btn-danger"
            onClick={async () => {
              if (!confirm("¿Borrar TODOS los datos y recargar desde el Excel inicial? Se perderá tu progreso.")) return;
              await db.delete();
              await db.open();
              await loadSeed();
              toast("Datos reiniciados desde el Excel inicial");
              setTimeout(() => location.reload(), 800);
            }}
          >
            Reiniciar desde Excel inicial
          </button>
        </div>
        <p className="faint mt">
          Convocatoria 25/0077 · 93 plazas · Primer ejercicio: 100 test (+10 reserva), 2h, +1 / −0,3333 / blanco 0.
        </p>
      </Card>
    </div>
  );
}

function PctField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="field">
      <span className="label">{label} ({Math.round(value * 100)}%)</span>
      <input type="range" min={0} max={1} step={0.05} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}
