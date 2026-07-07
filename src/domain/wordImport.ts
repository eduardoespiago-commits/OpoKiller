// Heuristics that turn a parsed .docx into structured study data:
// topic detection (structure + suggested products) and test parsing + fusion.
// Never invents data — only surfaces what the document contains.
import type { DocxDoc, DocxParagraph } from "./docx";

// ---------------------------------------------------------------------------
// Topic detection
// ---------------------------------------------------------------------------

export interface TopicDetection {
  officialId: string | null; // "E36", "C08"
  block: "Común" | "Específico" | null;
  number: number | null;
  subtopicCode: string | null; // "36.1"
  isPartial: boolean;
  title: string;
  headings: { level: number; text: string }[];
  tableCount: number;
  normativa: string[];
  figures: string[];
  suggestedProducts: string[];
  confidence: number; // 0..1
}

const NORMATIVA_RE =
  /\b(?:Reglamento(?:\s*\(?(?:UE|CE|CEE)\)?)?\s*(?:n[.º]?\s*)?\d[\d./]*|Directiva\s*\d[\d./]*|Ley\s*(?:Org[aá]nica\s*)?\d[\d./]*|Real\s+Decreto(?:-ley)?\s*\d[\d./]*|\bRD\s*\d[\d./]*|Decreto\s*\d[\d./]*|Orden\s*(?:[A-Z]{2,4}\/)?\d[\d./]*|art[íi]culo?\s*\d+|art\.\s*\d+)\b/gi;

const FIGURE_RE =
  /\b\d[\d.,]*\s?(?:%|d[íi]as?|horas?|meses?|años?|km|m²|m2|mg|g|kg|litros?|l\b|€|ºC|grados|semanas?)\b/gi;

/** Extract "36" and optional subtopic "36.1" from filename/first text. */
function detectNumber(filename: string, firstText: string): { num: number | null; sub: string | null } {
  const hay = `${filename} ${firstText}`;
  // Subtopic like 36.1 or 12.2
  const subM = /\b(\d{1,2})\.(\d)\b/.exec(hay);
  if (subM) return { num: Number(subM[1]), sub: `${subM[1]}.${subM[2]}` };
  // "Tema 36" / "A 36" / "E36" / "36 -"
  const numM =
    /\b(?:tema|t\.?|a|e|c)?\s*(\d{1,2})\b/i.exec(filename) ||
    /\btema\s*(\d{1,2})\b/i.exec(firstText);
  return { num: numM ? Number(numM[1]) : null, sub: null };
}

/** Decide block from filename hints (E = específico, C = común). */
function detectBlock(filename: string): "Común" | "Específico" | null {
  if (/\bC\d/i.test(filename) || /com[uú]n/i.test(filename)) return "Común";
  if (/\bE\d/i.test(filename) || /espec[ií]fic/i.test(filename)) return "Específico";
  return null;
}

export function detectTopic(doc: DocxDoc, filename: string): TopicDetection {
  const firstHeading = doc.headings[0]?.text ?? "";
  const firstPara = doc.blocks.find(
    (b): b is DocxParagraph => b.kind === "paragraph" && !!b.text,
  );
  const firstText = firstHeading || firstPara?.text || "";
  const { num, sub } = detectNumber(filename, firstText);
  const block = detectBlock(filename) ?? (num != null && num <= 15 && /\bc/i.test(filename) ? "Común" : "Específico");

  const officialId =
    num != null
      ? `${block === "Común" ? "C" : "E"}${String(num).padStart(2, "0")}`
      : null;

  const normativa = unique(matchAll(doc.text, NORMATIVA_RE)).slice(0, 40);
  const figures = unique(matchAll(doc.text, FIGURE_RE)).slice(0, 40);

  const products: string[] = ["Mapa maestro", "Preguntas de recuperación"];
  if (doc.tables.length > 0) products.push("Tabla comparativa");
  if (normativa.length >= 2) products.push("Tabla normativa");
  if (figures.length >= 3) products.push("Tabla de cifras");
  if (/procedimiento|actuaci[oó]n|protocolo|ante un positivo/i.test(doc.text))
    products.push("Diagrama de procedimiento");
  products.push("Mini test");

  // Confidence from how much structure we could extract.
  let confidence = 0.2;
  if (num != null) confidence += 0.3;
  if (doc.headings.length >= 2) confidence += 0.2;
  if (doc.text.length > 800) confidence += 0.15;
  if (normativa.length > 0 || figures.length > 0) confidence += 0.15;

  return {
    officialId,
    block,
    number: num,
    subtopicCode: sub,
    isPartial: sub != null,
    title: cleanTitle(firstText, num),
    headings: doc.headings,
    tableCount: doc.tables.length,
    normativa,
    figures,
    suggestedProducts: unique(products),
    confidence: Math.min(1, confidence),
  };
}

// ---------------------------------------------------------------------------
// Test parsing
// ---------------------------------------------------------------------------

export interface ParsedQuestion {
  index: number;
  statement: string;
  options: string[]; // in A,B,C,D order
  correct: string | null; // "A".."D"
  explanation: string;
}

export interface ParsedTest {
  title: string;
  date: string | null; // ISO
  questions: ParsedQuestion[];
  confidence: number;
  warnings: string[];
}

const OPTION_RE = /^\s*([A-Da-d])\s*[)\].-]\s*(.+)$/;
const QUESTION_RE = /^\s*(\d{1,3})\s*[)\].-]\s+(.+)$/;
const LETTERS = ["A", "B", "C", "D"];

export function detectTestDate(filename: string): string | null {
  // 17-6-26, 17/06/2026, 2026-06-17
  const iso = /\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/.exec(filename);
  if (iso) return `${iso[1]}-${pad(iso[2])}-${pad(iso[3])}`;
  const dmy = /\b(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})\b/.exec(filename);
  if (dmy) {
    const y = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
    return `${y}-${pad(dmy[2])}-${pad(dmy[1])}`;
  }
  return null;
}

export function parseTest(doc: DocxDoc, filename: string): ParsedTest {
  const paras = doc.blocks.filter(
    (b): b is DocxParagraph => b.kind === "paragraph",
  );
  const questions: ParsedQuestion[] = [];
  const warnings: string[] = [];
  let current: ParsedQuestion | null = null;

  // Optional answer key section ("Plantilla", "Soluciones").
  const answerKey = extractAnswerKey(doc.text);

  const push = () => {
    if (current) {
      if (current.options.length < 2) warnings.push(`Pregunta ${current.index} incompleta`);
      questions.push(current);
    }
  };

  for (const p of paras) {
    const line = p.text;
    if (!line) continue;
    const qm = QUESTION_RE.exec(line);
    const om = OPTION_RE.exec(line);
    if (qm && !om) {
      push();
      current = { index: Number(qm[1]), statement: qm[2].trim(), options: [], correct: null, explanation: "" };
      continue;
    }
    if (om && current) {
      const letter = om[1].toUpperCase();
      const optText = om[2].trim();
      current.options[LETTERS.indexOf(letter)] = optText;
      // Correct answer marked by bold/underline on the option run.
      const marked = p.runs.some((r) => (r.bold || r.underline) && r.text.trim().length > 1);
      if (marked && !current.correct) current.correct = letter;
      continue;
    }
    // Continuation of a statement (no option/question marker yet).
    if (current && current.options.length === 0) {
      current.statement = `${current.statement} ${line}`.trim();
    } else if (current && /^(explicaci[oó]n|soluci[oó]n|respuesta)\b/i.test(line)) {
      current.explanation = line.replace(/^[^:]*:\s*/, "").trim();
    }
  }
  push();

  // Fill correct answers from the key if not marked inline.
  for (const q of questions) {
    if (!q.correct && answerKey.has(q.index)) q.correct = answerKey.get(q.index)!;
    q.options = q.options.map((o) => o ?? "");
  }

  const withCorrect = questions.filter((q) => q.correct).length;
  const confidence = questions.length
    ? Math.min(1, 0.3 + 0.4 * (withCorrect / questions.length) + Math.min(0.3, questions.length / 100))
    : 0;

  return {
    title: cleanTestTitle(filename),
    date: detectTestDate(filename),
    questions,
    confidence,
    warnings,
  };
}

function extractAnswerKey(text: string): Map<number, string> {
  const map = new Map<number, string>();
  // Match "1. C", "1) C", "1 - C", "1: C"
  const re = /\b(\d{1,3})\s*[).:-]\s*([A-Da-d])\b/g;
  const keySection = /(?:plantilla|soluci[oó]n(?:es)?|respuestas?\s+correctas?)[\s\S]{0,4000}/i.exec(text);
  const hay = keySection ? keySection[0] : "";
  let m: RegExpExecArray | null;
  while ((m = re.exec(hay))) {
    map.set(Number(m[1]), m[2].toUpperCase());
  }
  return map;
}

// ---------------------------------------------------------------------------
// Fusion of an uncorrected test with its corrected version
// ---------------------------------------------------------------------------

export interface FusionResult {
  fused: ParsedTest;
  merged: number;
  ambiguous: number;
}

export function fuseTests(base: ParsedTest, corrected: ParsedTest): FusionResult {
  const fusedQuestions: ParsedQuestion[] = base.questions.map((q) => ({ ...q }));
  let merged = 0;
  let ambiguous = 0;

  for (const q of fusedQuestions) {
    const match = bestMatch(q, corrected.questions);
    if (match && match.correct) {
      q.correct = match.correct;
      if (match.explanation) q.explanation = match.explanation;
      merged++;
    } else {
      ambiguous++;
    }
  }

  return {
    fused: {
      title: base.title || corrected.title,
      date: base.date ?? corrected.date,
      questions: fusedQuestions,
      confidence: Math.max(base.confidence, corrected.confidence),
      warnings: base.warnings,
    },
    merged,
    ambiguous,
  };
}

export function isSameTest(a: ParsedTest, b: ParsedTest): boolean {
  if (a.date && b.date && a.date === b.date) return true;
  const countClose = Math.abs(a.questions.length - b.questions.length) <= 2;
  const firstSim =
    a.questions[0] && b.questions[0]
      ? similarity(a.questions[0].statement, b.questions[0].statement) > 0.5
      : false;
  return countClose && firstSim;
}

function bestMatch(q: ParsedQuestion, pool: ParsedQuestion[]): ParsedQuestion | null {
  // Prefer same index, else best statement similarity above threshold.
  const byIndex = pool.find((p) => p.index === q.index);
  if (byIndex && similarity(q.statement, byIndex.statement) > 0.4) return byIndex;
  let best: ParsedQuestion | null = null;
  let bestScore = 0.55;
  for (const p of pool) {
    const s = similarity(q.statement, p.statement);
    if (s > bestScore) {
      best = p;
      bestScore = s;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function similarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / Math.max(ta.size, tb.size);
}

function tokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3),
  );
}

function matchAll(text: string, re: RegExp): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  const r = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  while ((m = r.exec(text))) out.push(m[0].replace(/\s+/g, " ").trim());
  return out;
}

function unique<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function cleanTitle(text: string, num: number | null): string {
  let t = text.replace(/^\s*(?:tema|t\.?)\s*\d+\s*[.:-]?\s*/i, "").trim();
  if (!t && num != null) t = `Tema ${num}`;
  return t.slice(0, 200) || "Tema importado";
}

function cleanTestTitle(filename: string): string {
  return filename.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || "Test importado";
}

function pad(s: string): string {
  return s.padStart(2, "0");
}
