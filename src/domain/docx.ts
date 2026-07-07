// Pure parser for the body XML of a .docx (WordprocessingML).
// Kept dependency-free and string-based so it runs in both the browser and
// the test runner (no DOMParser needed) and can be unit-tested with fixtures.

export interface DocxRun {
  text: string;
  bold: boolean;
  underline: boolean;
}

export interface DocxParagraph {
  kind: "paragraph";
  headingLevel: number | null; // 1..6, or null for body text
  runs: DocxRun[];
  text: string;
}

export interface DocxTable {
  kind: "table";
  rows: string[][];
}

export type DocxBlock = DocxParagraph | DocxTable;

export interface DocxDoc {
  blocks: DocxBlock[];
  text: string;
  headings: { level: number; text: string }[];
  tables: DocxTable[];
}

const XML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
  "&#160;": " ",
};

function decodeXml(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;|&lt;|&gt;|&quot;|&apos;|&#160;/g, (m) => XML_ENTITIES[m] ?? m);
}

function textOfRun(runXml: string): string {
  let out = "";
  const re = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(runXml))) out += decodeXml(m[1]);
  // Tabs and breaks become spaces.
  if (/<w:tab\b/.test(runXml)) out += "\t";
  if (/<w:br\b/.test(runXml)) out += "\n";
  return out;
}

function parseParagraph(pXml: string): DocxParagraph {
  let headingLevel: number | null = null;
  const style = /<w:pStyle[^>]*w:val="([^"]+)"/.exec(pXml);
  if (style) {
    const v = style[1].toLowerCase();
    const hn = /(?:heading|t[ií]tulo|titulo)\s*(\d)/.exec(v);
    if (hn) headingLevel = Math.min(6, Number(hn[1]));
    else if (/^(heading|t[ií]tulo|titulo)$/.test(v)) headingLevel = 1;
  }
  const runs: DocxRun[] = [];
  const runRe = /<w:r\b[\s\S]*?<\/w:r>/g;
  let rm: RegExpExecArray | null;
  while ((rm = runRe.exec(pXml))) {
    const rXml = rm[0];
    const rprEnd = rXml.indexOf("</w:rPr>");
    const rpr = rprEnd >= 0 ? rXml.slice(0, rprEnd) : "";
    const bold = /<w:b\b(?![^>]*w:val="(?:false|0)")/.test(rpr);
    const underline = /<w:u\b(?![^>]*w:val="none")/.test(rpr);
    const text = textOfRun(rXml);
    if (text) runs.push({ text, bold, underline });
  }
  const text = runs.map((r) => r.text).join("").replace(/\s+/g, " ").trim();
  return { kind: "paragraph", headingLevel, runs, text };
}

function parseTable(tblXml: string): DocxTable {
  const rows: string[][] = [];
  const rowRe = /<w:tr\b[\s\S]*?<\/w:tr>/g;
  let rm: RegExpExecArray | null;
  while ((rm = rowRe.exec(tblXml))) {
    const cells: string[] = [];
    const cellRe = /<w:tc\b[\s\S]*?<\/w:tc>/g;
    let cm: RegExpExecArray | null;
    while ((cm = cellRe.exec(rm[0]))) {
      const tRe = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
      let t: RegExpExecArray | null;
      let cell = "";
      while ((t = tRe.exec(cm[0]))) cell += decodeXml(t[1]);
      cells.push(cell.replace(/\s+/g, " ").trim());
    }
    if (cells.length) rows.push(cells);
  }
  return { kind: "table", rows };
}

/** Parse the raw `word/document.xml` string into structured blocks. */
export function parseDocumentXml(xml: string): DocxDoc {
  const blocks: DocxBlock[] = [];
  // Walk paragraphs and tables in document order.
  const re = /<w:tbl\b[\s\S]*?<\/w:tbl>|<w:p\b[\s\S]*?<\/w:p>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const chunk = m[0];
    if (chunk.startsWith("<w:tbl")) blocks.push(parseTable(chunk));
    else {
      const p = parseParagraph(chunk);
      if (p.text || p.headingLevel) blocks.push(p);
    }
  }
  const headings = blocks
    .filter((b): b is DocxParagraph => b.kind === "paragraph" && b.headingLevel != null)
    .map((b) => ({ level: b.headingLevel!, text: b.text }));
  const tables = blocks.filter((b): b is DocxTable => b.kind === "table");
  const text = blocks
    .map((b) => (b.kind === "paragraph" ? b.text : b.rows.map((r) => r.join(" | ")).join("\n")))
    .filter(Boolean)
    .join("\n");
  return { blocks, text, headings, tables };
}
