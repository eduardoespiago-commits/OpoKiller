import { describe, expect, it, beforeAll } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { db } from "../../db/db";
import { loadSeed } from "../../db/seed";
import { buildImportPreview, applyImport } from "../../db/excel";

const XLSX_PATH = join(
  homedir(),
  "Downloads",
  "Sistema_estudio_oposiciones_DGA_Eduardo_actualizado_06-07-2026.xlsx",
);

// Minimal File-like wrapper so the browser importer runs under Node.
function fileFrom(path: string): File {
  const buf = readFileSync(path);
  return {
    name: path.split("/").pop()!,
    arrayBuffer: async () =>
      buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  } as unknown as File;
}

const available = existsSync(XLSX_PATH);

describe.skipIf(!available)("re-importing the real study Excel", () => {
  beforeAll(async () => {
    await db.delete();
    await db.open();
    await loadSeed();
  });

  it("detects all workbook sheets", async () => {
    const preview = await buildImportPreview(fileFrom(XLSX_PATH));
    expect(preview.sheetsFound).toContain("Temario");
    expect(preview.sheetsFound).toContain("Banco_preguntas");
    expect(preview.sheetsFound).toContain("Materiales");
  });

  it("recognises the already-seeded questions as duplicates (no history loss)", async () => {
    const preview = await buildImportPreview(fileFrom(XLSX_PATH));
    // All 50 seeded questions should be flagged duplicated, none new.
    expect(preview.questionsDuplicated.length).toBe(50);
    expect(preview.questionsNew.length).toBe(0);
  });

  it("does not overwrite study progress when applying updates", async () => {
    // Simulate prior progress on E09.
    await db.topics.update("E09", { mastery: 55, accumulatedMinutes: 120, status: "1.ª vuelta" });
    const preview = await buildImportPreview(fileFrom(XLSX_PATH));
    await applyImport(preview, {
      applyTopicUpdates: true,
      applyNewTopics: true,
      applyNewQuestions: true,
    });
    const e09 = await db.topics.get("E09");
    expect(e09?.mastery).toBe(55); // preserved
    expect(e09?.accumulatedMinutes).toBe(120); // preserved
  });
});
