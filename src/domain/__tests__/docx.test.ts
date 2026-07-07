import { describe, expect, it } from "vitest";
import { parseDocumentXml } from "../docx";
import {
  detectTopic,
  detectTestDate,
  fuseTests,
  isSameTest,
  parseTest,
} from "../wordImport";

// Minimal WordprocessingML fixtures.
function para(text: string, opts: { heading?: number; bold?: boolean; underline?: boolean } = {}): string {
  const pStyle = opts.heading ? `<w:pPr><w:pStyle w:val="Heading${opts.heading}"/></w:pPr>` : "";
  const rPr = `${opts.bold ? "<w:b/>" : ""}${opts.underline ? '<w:u w:val="single"/>' : ""}`;
  return `<w:p>${pStyle}<w:r><w:rPr>${rPr}</w:rPr><w:t>${text}</w:t></w:r></w:p>`;
}
function table(rows: string[][]): string {
  const trs = rows
    .map((r) => `<w:tr>${r.map((c) => `<w:tc><w:p><w:r><w:t>${c}</w:t></w:r></w:p></w:tc>`).join("")}</w:tr>`)
    .join("");
  return `<w:tbl>${trs}</w:tbl>`;
}
function doc(body: string): string {
  return `<?xml version="1.0"?><w:document><w:body>${body}</w:body></w:document>`;
}

describe("docx XML parser", () => {
  it("extracts headings, paragraphs and tables in order", () => {
    const xml = doc(
      para("Tema 36. Triquina", { heading: 1 }) +
        para("Concepto y agente.") +
        table([["Especie", "Método"], ["Cerdo", "Digestión"]]),
    );
    const d = parseDocumentXml(xml);
    expect(d.headings[0]).toEqual({ level: 1, text: "Tema 36. Triquina" });
    expect(d.tables).toHaveLength(1);
    expect(d.tables[0].rows[0]).toEqual(["Especie", "Método"]);
    expect(d.text).toContain("Concepto y agente");
  });

  it("captures bold/underline run formatting", () => {
    const d = parseDocumentXml(doc(para("Respuesta correcta", { bold: true })));
    expect(d.blocks[0].kind).toBe("paragraph");
    if (d.blocks[0].kind === "paragraph") {
      expect(d.blocks[0].runs[0].bold).toBe(true);
    }
  });
});

describe("topic detection", () => {
  it("detects the official id, subtopic and suggests products", () => {
    const d = parseDocumentXml(
      doc(
        para("Triquina y triquinelosis", { heading: 1 }) +
          para("Control oficial y procedimiento de actuación ante un positivo según el Reglamento (CE) 2075/2005 y el Real Decreto 640/2006.") +
          para("El plazo es de 3 días y la temperatura de -18 ºC durante 20 días.") +
          table([["a", "b"]]),
      ),
    );
    const det = detectTopic(d, "A 36.1 - 2026.docx");
    expect(det.number).toBe(36);
    expect(det.subtopicCode).toBe("36.1");
    expect(det.isPartial).toBe(true);
    expect(det.officialId).toBe("E36");
    expect(det.normativa.length).toBeGreaterThan(0);
    expect(det.figures.length).toBeGreaterThan(0);
    expect(det.suggestedProducts).toContain("Tabla normativa");
    expect(det.suggestedProducts).toContain("Diagrama de procedimiento");
  });
});

describe("test parsing", () => {
  const body =
    para("1. ¿Qué debe levantarse en una inspección?") +
    para("A) Un certificado") +
    para("B) Una autorización") +
    para("C) Un acta", { bold: true }) +
    para("D) Una declaración") +
    para("2) ¿Qué plazo de conservación aplica?") +
    para("a) Un año") +
    para("b) Tres años") +
    para("c) Cinco años") +
    para("d) Ninguna");

  it("parses questions, options and the marked correct answer", () => {
    const t = parseTest(parseDocumentXml(doc(body)), "ZARAGOZA 17-6-26.docx");
    expect(t.questions).toHaveLength(2);
    expect(t.questions[0].options).toHaveLength(4);
    expect(t.questions[0].correct).toBe("C");
    expect(t.date).toBe("2026-06-17");
  });

  it("reads a plantilla answer key when answers aren't marked inline", () => {
    const withKey =
      body.replace('<w:b/>', "") + // remove the bold marker
      para("Plantilla de soluciones") +
      para("1. C  2. B");
    const t = parseTest(parseDocumentXml(doc(withKey)), "test.docx");
    expect(t.questions[0].correct).toBe("C");
    expect(t.questions[1].correct).toBe("B");
  });
});

describe("test fusion", () => {
  it("merges a corrected version into the uncorrected one", () => {
    const base = parseTest(
      parseDocumentXml(
        doc(para("1. Pregunta uno larga sobre bienestar animal") + para("A) op a") + para("B) op b")),
      ),
      "test 17-6-26.docx",
    );
    const corrected = parseTest(
      parseDocumentXml(
        doc(para("1. Pregunta uno larga sobre bienestar animal") + para("A) op a") + para("B) op b", { bold: true })),
      ),
      "test corregido 17-6-26.docx",
    );
    expect(isSameTest(base, corrected)).toBe(true);
    const { fused, merged } = fuseTests(base, corrected);
    expect(merged).toBe(1);
    expect(fused.questions[0].correct).toBe("B");
  });
});

describe("date detection", () => {
  it("reads several date formats from filenames", () => {
    expect(detectTestDate("ZARAGOZA 17-6-26.docx")).toBe("2026-06-17");
    expect(detectTestDate("test 2026-06-24.docx")).toBe("2026-06-24");
    expect(detectTestDate("t 03/07/2026.docx")).toBe("2026-07-03");
  });
});
