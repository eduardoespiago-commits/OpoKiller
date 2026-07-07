import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/db";
import { loadSeed } from "../../db/seed";
import { parseDocumentXml } from "../docx";
import { detectTopic, parseTest } from "../wordImport";
import {
  fuseCorrectionIntoTest,
  importTestDoc,
  importTopicDoc,
} from "../../db/wordActions";

function para(text: string, opts: { heading?: number; bold?: boolean } = {}): string {
  const pStyle = opts.heading ? `<w:pPr><w:pStyle w:val="Heading${opts.heading}"/></w:pPr>` : "";
  const rPr = opts.bold ? "<w:b/>" : "";
  return `<w:p>${pStyle}<w:r><w:rPr>${rPr}</w:rPr><w:t>${text}</w:t></w:r></w:p>`;
}
const doc = (b: string) => `<w:document><w:body>${b}</w:body></w:document>`;

describe("word import → database", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    await loadSeed();
  });

  it("imports a topic Word: material + products + marks topic Recibido, and undoes cleanly", async () => {
    const d = parseDocumentXml(
      doc(
        para("Rabia", { heading: 1 }) +
          para("Epidemiología y control según el Real Decreto 1938/2004. Procedimiento de actuación.") +
          para("Periodo de 21 días y 3 dosis."),
      ),
    );
    const det = detectTopic(d, "Tema 35 - Rabia.docx");
    const before = await db.topics.get("E35");
    expect(before?.materialStatus).toBe("Recibido"); // seed already has it

    const res = await importTopicDoc({
      officialId: "E35",
      title: det.title,
      isPartial: false,
      subtopicCode: null,
      origin: "Semanal",
      createProducts: true,
      detection: det,
      fileName: "Tema 35 - Rabia.docx",
    });
    expect(res.productsCreated).toBeGreaterThan(0);
    expect(await db.materials.get(res.materialId)).toBeTruthy();
    expect((await db.products.where("topicId").equals("E35").toArray()).length).toBe(res.productsCreated);

    await res.undo();
    expect(await db.materials.get(res.materialId)).toBeUndefined();
    expect((await db.products.where("topicId").equals("E35").toArray()).length).toBe(0);
  });

  it("creates a subtopic for a partial topic import", async () => {
    const d = parseDocumentXml(doc(para("Anisakis", { heading: 1 }) + para("Biología y control.")));
    const det = detectTopic(d, "A 36.2 Anisakis.docx");
    expect(det.subtopicCode).toBe("36.2");
    const res = await importTopicDoc({
      officialId: "E36",
      title: "Anisakis",
      isPartial: true,
      subtopicCode: "36.2",
      origin: "Semanal",
      createProducts: false,
      detection: det,
      fileName: "A 36.2 Anisakis.docx",
    });
    expect(res.subtopicId).toBe("E36.2");
    expect(await db.subtopics.get("E36.2")).toBeTruthy();
  });

  it("imports a test Word and can fuse a corrected version into it", async () => {
    const uncorrected = parseTest(
      parseDocumentXml(
        doc(
          para("1. Pregunta sobre bienestar animal en transporte") + para("A) opcion alfa") + para("B) opcion beta") +
          para("2. Pregunta sobre plazos de conservacion registros") + para("A) un anyo") + para("B) tres anyos"),
        ),
      ),
      "test 17-6-26.docx",
    );
    const imp = await importTestDoc({ parsed: uncorrected, topicId: "E53", fileName: "test 17-6-26.docx" });
    expect(imp.questionsCreated).toBe(2);
    const test = await db.tests.get(imp.testId);
    expect(test?.questionIds.length).toBe(2);

    const corrected = parseTest(
      parseDocumentXml(
        doc(
          para("1. Pregunta sobre bienestar animal en transporte") + para("A) opcion alfa") + para("B) opcion beta", { bold: true }) +
          para("2. Pregunta sobre plazos de conservacion registros") + para("A) un anyo") + para("B) tres anyos", { bold: true }),
        ),
      ),
      "test corregido 17-6-26.docx",
    );
    const { merged } = await fuseCorrectionIntoTest(imp.testId, corrected);
    expect(merged).toBe(2);
    const qs = await db.questions.bulkGet(test!.questionIds);
    expect(qs[0]?.correctAnswer).toBe("B");
    expect(qs[1]?.correctAnswer).toBe("B");
  });
});
