// JSON backup (full snapshot) + restore. The primary, lossless safety net.
import { db } from "./db";

export interface BackupFile {
  app: "opokiller";
  version: 1;
  exportedAt: string;
  data: Record<string, unknown[]>;
}

const TABLES = [
  "topics",
  "subtopics",
  "materials",
  "tasks",
  "sessions",
  "reviews",
  "questions",
  "tests",
  "attempts",
  "errors",
  "weeklyPlans",
  "checkins",
  "settings",
  "products",
] as const;

export async function exportBackup(): Promise<BackupFile> {
  const data: Record<string, unknown[]> = {};
  for (const t of TABLES) {
    data[t] = await (db as any)[t].toArray();
  }
  return {
    app: "opokiller",
    version: 1,
    exportedAt: new Date().toISOString(),
    data,
  };
}

export async function downloadBackup(): Promise<void> {
  const backup = await exportBackup();
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json",
  });
  triggerDownload(blob, `opokiller-backup-${dateStamp()}.json`);
  await markBackupDone();
}

/** Record that a backup was made (updates settings.lastBackupAt). */
export async function markBackupDone(): Promise<void> {
  const s = await db.settings.get("default");
  if (s) await db.settings.update("default", { lastBackupAt: new Date().toISOString() });
}

export async function restoreBackup(file: BackupFile): Promise<void> {
  if (file.app !== "opokiller") throw new Error("Archivo de copia no válido.");
  await db.transaction("rw", TABLES.map((t) => (db as any)[t]), async () => {
    for (const t of TABLES) {
      const rows = file.data[t];
      if (!rows) continue;
      await (db as any)[t].clear();
      await (db as any)[t].bulkPut(rows);
    }
  });
}

export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function dateStamp(): string {
  return new Date().toISOString().slice(0, 10);
}
