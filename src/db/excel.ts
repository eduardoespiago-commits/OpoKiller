// Re-import a future version of the study Excel without losing study history,
// and export the current state back to .xlsx as a portable backup.
import * as XLSX from "xlsx";
import { db } from "./db";
import type { Question, Topic } from "../domain/types";

export interface ImportPreview {
  fileName: string;
  sheetsFound: string[];
  topicsNew: Topic[];
  topicsUpdated: { current: Topic; incoming: Partial<Topic> }[];
  questionsNew: Question[];
  questionsDuplicated: string[];
  materialsNew: number;
  warnings: string[];
}

interface ParsedRow {
  [k: string]: unknown;
}

function sheetToRows(wb: XLSX.WorkBook, name: string, headerRow: number): ParsedRow[] {
  const ws = wb.Sheets[name];
  if (!ws) return [];
  const all = XLSX.utils.sheet_to_json<ParsedRow>(ws, {
    header: 1,
    raw: true,
    defval: null,
  }) as unknown as unknown[][];
  const headers = (all[headerRow] ?? []).map((h) => String(h ?? "").trim());
  const rows: ParsedRow[] = [];
  for (let i = headerRow + 1; i < all.length; i++) {
    const arr = all[i] ?? [];
    const obj: ParsedRow = {};
    headers.forEach((h, c) => (obj[h] = arr[c] ?? null));
    rows.push(obj);
  }
  return rows;
}

export async function buildImportPreview(file: File): Promise<ImportPreview> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const warnings: string[] = [];

  const existingTopics = await db.topics.toArray();
  const topicById = new Map(existingTopics.map((t) => [t.officialId, t]));
  const existingQ = new Set((await db.questions.toArray()).map((q) => q.id));

  const topicsNew: Topic[] = [];
  const topicsUpdated: ImportPreview["topicsUpdated"] = [];

  // Temario: header on row index 2 (3rd row).
  const temario = sheetToRows(wb, "Temario", 2);
  for (const row of temario) {
    const officialId = str(row["ID"]);
    if (!officialId || !/^[CE]\d/.test(officialId)) continue;
    const incoming: Partial<Topic> = {
      officialId,
      title: str(row["Título / epígrafe"]),
      materialStatus: str(row["Material"]) as Topic["materialStatus"],
      origin: str(row["Origen"]),
      priority: (str(row["Prioridad"]) || "Baja") as Topic["priority"],
    };
    const current = topicById.get(officialId);
    if (!current) {
      warnings.push(`Tema ${officialId} no existe en la base actual (se creará).`);
      topicsNew.push({
        ...incoming,
        block: /^C/.test(officialId) ? "Común" : "Específico",
        number: Number(row["N.º"]) || 0,
        status: "No iniciado",
        classDate: null,
        lastStudyAt: null,
        reviewStage: 0,
        mastery: 0,
        accumulatedMinutes: 0,
        pendingQuestions: 0,
        nextReviewAt: null,
        academyWeek: str(row["Semana academia"]),
        notes: str(row["Notas"]),
      } as Topic);
    } else if (
      current.materialStatus !== incoming.materialStatus ||
      current.priority !== incoming.priority ||
      current.title !== incoming.title
    ) {
      topicsUpdated.push({ current, incoming });
    }
  }

  // Banco_preguntas: header on row index 7 (8th row).
  const banco = sheetToRows(wb, "Banco_preguntas", 7);
  const questionsNew: Question[] = [];
  const questionsDuplicated: string[] = [];
  for (const row of banco) {
    const id = str(row["ID"]);
    if (!id || !/^T\d/.test(id)) continue;
    if (existingQ.has(id)) {
      questionsDuplicated.push(id);
      continue;
    }
    questionsNew.push({
      id,
      topicId: str(row["Tema ID"]),
      subtopicId: null,
      type: "test",
      category: str(row["Bloque"]),
      statement: str(row["Pregunta"]),
      options: [row["A"], row["B"], row["C"], row["D"]].map((x) => str(x)),
      correctAnswer: str(row["Correcta"]).toUpperCase(),
      explanation: str(row["Respuesta correcta"]) ? `Respuesta correcta: ${str(row["Respuesta correcta"])}` : "",
      source: "Importado",
      difficulty: (str(row["Dificultad"]) || "Media") as Question["difficulty"],
      timesAnswered: 0,
      timesCorrect: 0,
      timesIncorrect: 0,
      lastAnsweredAt: null,
      nextRepeatAt: null,
    });
  }

  // Materiales: header on row index 3 (4th row).
  const materiales = sheetToRows(wb, "Materiales", 3);
  const existingMatNames = new Set((await db.materials.toArray()).map((m) => m.name));
  const materialsNew = materiales.filter(
    (r) => str(r["Material / archivo"]) && !existingMatNames.has(str(r["Material / archivo"])),
  ).length;

  return {
    fileName: file.name,
    sheetsFound: wb.SheetNames,
    topicsNew,
    topicsUpdated,
    questionsNew,
    questionsDuplicated,
    materialsNew,
    warnings,
  };
}

export interface ApplyOptions {
  applyTopicUpdates: boolean;
  applyNewTopics: boolean;
  applyNewQuestions: boolean;
}

/** Apply a previewed import, preserving all study-progress fields. */
export async function applyImport(
  preview: ImportPreview,
  opts: ApplyOptions,
): Promise<void> {
  await db.transaction("rw", [db.topics, db.questions], async () => {
    if (opts.applyNewTopics) {
      for (const t of preview.topicsNew) await db.topics.put(t);
    }
    if (opts.applyTopicUpdates) {
      for (const u of preview.topicsUpdated) {
        // Only overwrite catalogue fields; keep progress intact.
        await db.topics.update(u.current.officialId, {
          title: u.incoming.title ?? u.current.title,
          materialStatus: u.incoming.materialStatus ?? u.current.materialStatus,
          origin: u.incoming.origin ?? u.current.origin,
          priority: u.incoming.priority ?? u.current.priority,
        });
      }
    }
    if (opts.applyNewQuestions) {
      for (const q of preview.questionsNew) await db.questions.put(q);
    }
  });
}

/** Export the current state to a multi-sheet .xlsx backup. */
export async function exportToXlsx(): Promise<Blob> {
  const wb = XLSX.utils.book_new();

  const topics = await db.topics.toArray();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(
      topics.map((t) => ({
        ID: t.officialId,
        Bloque: t.block,
        "N.º": t.number,
        Título: t.title,
        Material: t.materialStatus,
        Origen: t.origin,
        Prioridad: t.priority,
        Estado: t.status,
        "Dominio %": t.mastery,
        "Minutos": t.accumulatedMinutes,
        "Último estudio": t.lastStudyAt ?? "",
        "Próximo repaso": t.nextReviewAt ?? "",
      })),
    ),
    "Temario",
  );

  const questions = await db.questions.toArray();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(
      questions.map((q) => ({
        ID: q.id,
        "Tema ID": q.topicId,
        Categoría: q.category,
        Pregunta: q.statement,
        A: q.options[0],
        B: q.options[1],
        C: q.options[2],
        D: q.options[3],
        Correcta: q.correctAnswer,
        Respondidas: q.timesAnswered,
        Aciertos: q.timesCorrect,
      })),
    ),
    "Banco_preguntas",
  );

  const errors = await db.errors.toArray();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(
      errors.map((e) => ({
        Fecha: e.createdAt,
        Tema: e.topicId ?? "",
        Pregunta: e.statement,
        Causa: e.cause ?? "",
        Severidad: e.severity,
        Estado: e.status,
        "Repetir el": e.nextReviewAt ?? "",
      })),
    ),
    "Tests_errores",
  );

  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return new Blob([out], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

function str(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
}
