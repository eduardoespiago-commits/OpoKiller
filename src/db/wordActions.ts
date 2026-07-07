// Persist Word-import results (topics + tests) with precise, reversible writes.
import { db } from "./db";
import { todayISO } from "../domain/dates";
import type {
  Material,
  Question,
  StudyProduct,
  StudyProductType,
  Subtopic,
  Test,
  Topic,
} from "../domain/types";
import type { ParsedTest, TopicDetection } from "../domain/wordImport";

export interface ImportUndo {
  undo: () => Promise<void>;
}

const PRODUCT_MAP: Record<string, StudyProductType> = {
  "Mapa maestro": "mapa-maestro",
  "Preguntas de recuperación": "preguntas",
  "Tabla comparativa": "tabla-comparativa",
  "Tabla normativa": "tabla-normativa",
  "Tabla de cifras": "tabla-cifras",
  "Diagrama de procedimiento": "diagrama",
  "Mini test": "mini-test",
};

export interface TopicImportOptions {
  officialId: string;
  title: string;
  isPartial: boolean;
  subtopicCode: string | null;
  origin: string;
  createProducts: boolean;
  detection: TopicDetection;
  fileName: string;
}

export interface TopicImportResult extends ImportUndo {
  materialId: string;
  productsCreated: number;
  subtopicId: string | null;
}

export async function importTopicDoc(opts: TopicImportOptions): Promise<TopicImportResult> {
  const today = todayISO();
  const topic = await db.topics.get(opts.officialId);
  const prevTopic: Topic | undefined = topic ? { ...topic } : undefined;

  // Material version: bump if a Word material for this topic already exists.
  const priorMaterials = (await db.materials.toArray()).filter(
    (m) => m.topicId === opts.officialId && String(m.type).startsWith("Tema Word"),
  );
  const version = priorMaterials.length + 1;
  const materialId = `mat-word-${Date.now()}`;
  const material: Material = {
    id: materialId,
    name: opts.fileName,
    type: "Tema Word",
    date: today,
    topicId: opts.officialId,
    subtopicId: opts.subtopicCode ? `${opts.officialId}.${opts.subtopicCode.split(".")[1]}` : null,
    topicsRaw: opts.officialId,
    status: "Recibido",
    origin: opts.origin || "Semanal",
    howTo: "Tema importado de Word. Estudiar con sus productos sugeridos.",
    nextAction: opts.isPartial ? "Completar el resto del tema oficial" : "Primera vuelta activa",
    processed: false,
    createdAt: new Date().toISOString(),
    version,
    supersedesId: priorMaterials[priorMaterials.length - 1]?.id ?? null,
  };

  let subtopicId: string | null = null;
  let createdSubtopic = false;
  if (opts.isPartial && opts.subtopicCode) {
    subtopicId = `${opts.officialId}.${opts.subtopicCode.split(".")[1]}`;
    const existing = await db.subtopics.get(subtopicId);
    if (!existing) {
      const sub: Subtopic = {
        id: subtopicId,
        topicId: opts.officialId,
        code: opts.subtopicCode,
        title: opts.title,
        status: "1.ª vuelta",
        mastery: 0,
        lastStudyAt: null,
        nextReviewAt: null,
        reviewStage: 0,
        accumulatedMinutes: 0,
      };
      await db.subtopics.put(sub);
      createdSubtopic = true;
    }
  }

  const products: StudyProduct[] = [];
  if (opts.createProducts) {
    for (const label of opts.detection.suggestedProducts) {
      const type = PRODUCT_MAP[label];
      if (!type) continue;
      products.push({
        id: `prod-${opts.officialId}-${type}-${Date.now()}-${products.length}`,
        topicId: opts.officialId,
        subtopicId,
        type,
        label,
        status: "pendiente",
        createdAt: new Date().toISOString(),
      });
    }
  }

  await db.transaction("rw", [db.materials, db.topics, db.subtopics, db.products], async () => {
    await db.materials.put(material);
    if (products.length) await db.products.bulkPut(products);
    if (topic) {
      await db.topics.update(opts.officialId, {
        materialStatus: opts.isPartial ? "Parcial" : "Recibido",
        title: opts.title.length > 10 ? opts.title : topic.title,
      });
    }
  });

  return {
    materialId,
    productsCreated: products.length,
    subtopicId,
    undo: async () => {
      await db.transaction("rw", [db.materials, db.topics, db.subtopics, db.products], async () => {
        await db.materials.delete(materialId);
        await db.products.bulkDelete(products.map((p) => p.id));
        if (createdSubtopic && subtopicId) await db.subtopics.delete(subtopicId);
        if (prevTopic) await db.topics.put(prevTopic);
      });
    },
  };
}

export interface TestImportOptions {
  parsed: ParsedTest;
  topicId: string | null; // default topic for all questions
  fileName: string;
}

export interface TestImportResult extends ImportUndo {
  testId: string;
  questionsCreated: number;
}

export async function importTestDoc(opts: TestImportOptions): Promise<TestImportResult> {
  const { parsed } = opts;
  const date = parsed.date ?? todayISO();
  const stamp = date.replace(/-/g, "");
  const testId = `test-word-${stamp}-${Date.now()}`;
  const questions: Question[] = parsed.questions
    .filter((q) => q.statement && q.options.filter(Boolean).length >= 2)
    .map((q, i) => ({
      id: `W${stamp}-${String(i + 1).padStart(2, "0")}`,
      topicId: opts.topicId ?? "",
      subtopicId: null,
      type: "test",
      category: "Importado Word",
      statement: q.statement,
      options: q.options.map((o) => o ?? ""),
      correctAnswer: q.correct ?? "",
      explanation: q.explanation ?? "",
      source: `Word ${date}`,
      difficulty: "Media",
      timesAnswered: 0,
      timesCorrect: 0,
      timesIncorrect: 0,
      lastAnsweredAt: null,
      nextRepeatAt: null,
    }));

  const test: Test = {
    id: testId,
    date,
    title: parsed.title,
    type: "semanal",
    questionIds: questions.map((q) => q.id),
    status: "pendiente",
    durationMinutes: Math.max(10, Math.round(questions.length * 1.2)),
    source: opts.fileName,
    topicIds: opts.topicId ? [opts.topicId] : [],
  };

  await db.transaction("rw", [db.tests, db.questions], async () => {
    await db.questions.bulkPut(questions);
    await db.tests.put(test);
  });

  return {
    testId,
    questionsCreated: questions.length,
    undo: async () => {
      await db.transaction("rw", [db.tests, db.questions], async () => {
        await db.tests.delete(testId);
        await db.questions.bulkDelete(questions.map((q) => q.id));
      });
    },
  };
}

/** Find an existing pending test that looks like the same one (for fusion). */
export async function findMatchingTest(parsed: ParsedTest): Promise<Test | undefined> {
  const all = await db.tests.toArray();
  return all.find(
    (t) =>
      (parsed.date && t.date === parsed.date) ||
      (Math.abs(t.questionIds.length - parsed.questions.length) <= 2 &&
        t.title.toLowerCase().includes(parsed.title.toLowerCase().slice(0, 6))),
  );
}

/** Merge corrected answers into an existing test's questions. */
export async function fuseCorrectionIntoTest(
  testId: string,
  parsed: ParsedTest,
): Promise<{ merged: number; ambiguous: number }> {
  const test = await db.tests.get(testId);
  if (!test) return { merged: 0, ambiguous: 0 };
  const questions = await db.questions.bulkGet(test.questionIds);
  let merged = 0;
  let ambiguous = 0;
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    if (!q) continue;
    const match =
      parsed.questions.find((p) => p.index === i + 1 && p.correct) ??
      parsed.questions.find((p) => statementSim(p.statement, q.statement) > 0.5 && p.correct);
    if (match && match.correct) {
      await db.questions.update(q.id, {
        correctAnswer: match.correct,
        explanation: match.explanation || q.explanation,
      });
      merged++;
    } else if (!q.correctAnswer) {
      ambiguous++;
    }
  }
  return { merged, ambiguous };
}

function statementSim(a: string, b: string): number {
  const ta = new Set(a.toLowerCase().split(/\s+/).filter((w) => w.length > 3));
  const tb = new Set(b.toLowerCase().split(/\s+/).filter((w) => w.length > 3));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / Math.max(ta.size, tb.size);
}
