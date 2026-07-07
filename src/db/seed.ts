// Transforms the Excel-derived seed.json into typed DB records and loads them
// on first run. Real data only — no demo/placeholder rows mixed in.
import seedJson from "../data/seed.json";
import type {
  Material,
  Question,
  Subtopic,
  Test,
  Topic,
} from "../domain/types";
import { db } from "./db";
import { DEFAULT_SETTINGS } from "./defaults";

interface SeedTopic {
  officialId: string;
  block: string;
  number: number;
  title: string;
  materialStatus: string;
  origin: string;
  priority: string;
  status: string;
  classDate: string | null;
  lastStudyAt: string | null;
  reviewStage: number;
  mastery: number;
  accumulatedMinutes: number;
  pendingQuestions: number;
  academyWeek: string;
  notes: string;
}

function mapTopic(s: SeedTopic): Topic {
  return {
    officialId: s.officialId,
    block: (s.block as Topic["block"]) ?? "Específico",
    number: s.number,
    title: s.title,
    materialStatus: s.materialStatus as Topic["materialStatus"],
    origin: s.origin,
    priority: (s.priority as Topic["priority"]) ?? "Baja",
    status: (s.status as Topic["status"]) ?? "No iniciado",
    classDate: s.classDate,
    lastStudyAt: s.lastStudyAt,
    reviewStage: s.reviewStage ?? 0,
    mastery: s.mastery ?? 0,
    accumulatedMinutes: s.accumulatedMinutes ?? 0,
    pendingQuestions: s.pendingQuestions ?? 0,
    nextReviewAt: null,
    academyWeek: s.academyWeek ?? "",
    notes: s.notes ?? "",
  };
}

// Known subtopics from the Excel (parciales). Parent topics stay as containers.
const SEED_SUBTOPICS: Subtopic[] = [
  {
    id: "E12.2",
    topicId: "E12",
    code: "12.2",
    title: "DDD (desinsectación, desratización y desinfección)",
    status: "1.ª vuelta",
    mastery: 0,
    lastStudyAt: null,
    nextReviewAt: null,
    reviewStage: 0,
    accumulatedMinutes: 0,
  },
  {
    id: "E36.1",
    topicId: "E36",
    code: "36.1",
    title: "Triquina y triquinelosis",
    status: "1.ª vuelta",
    mastery: 0,
    lastStudyAt: null,
    nextReviewAt: null,
    reviewStage: 0,
    accumulatedMinutes: 0,
  },
  {
    id: "E36.2",
    topicId: "E36",
    code: "36.2",
    title: "Anisakis",
    status: "No iniciado",
    mastery: 0,
    lastStudyAt: null,
    nextReviewAt: null,
    reviewStage: 0,
    accumulatedMinutes: 0,
  },
];

function mapMaterial(s: any, i: number): Material {
  return {
    id: `mat-${i + 1}`,
    name: s.name,
    type: s.type ?? "Otro",
    date: s.date ?? null,
    topicId: null,
    subtopicId: null,
    topicsRaw: s.topics ?? "",
    status: s.status ?? "",
    origin: s.origin ?? "",
    howTo: s.howTo ?? "",
    nextAction: s.nextAction ?? "",
    processed: !!s.processed,
    createdAt: new Date().toISOString(),
  };
}

function mapQuestion(s: any): Question {
  return {
    id: s.id,
    topicId: s.topicId,
    subtopicId: null,
    type: "test",
    category: s.category ?? "",
    statement: s.statement,
    options: [s.A, s.B, s.C, s.D].map((x) => x ?? ""),
    correctAnswer: (s.correct ?? "").toUpperCase(),
    explanation: s.correctText ? `Respuesta correcta: ${s.correctText}` : "",
    source: s.sourceDate ? `Test ${s.sourceDate}` : "",
    difficulty: (s.difficulty as Question["difficulty"]) ?? "Media",
    timesAnswered: 0,
    timesCorrect: 0,
    timesIncorrect: 0,
    lastAnsweredAt: null,
    nextRepeatAt: null,
  };
}

export async function isSeeded(): Promise<boolean> {
  const s = await db.settings.get("default");
  return !!s;
}

export async function loadSeed(): Promise<void> {
  const seed = seedJson as any;
  const topics = (seed.topics as SeedTopic[]).map(mapTopic);
  const questions = (seed.questions as any[]).map(mapQuestion);
  const materials = (seed.materials as any[]).map(mapMaterial);

  // Build the three weekly tests. The 17/06 test carries the 50 real questions.
  const q1706 = questions.filter((q) => q.source.includes("2026-06-17"));
  const tests: Test[] = (seed.weeklyTests as any[]).map((wt) => {
    const is1706 = wt.date === "2026-06-17";
    return {
      id: `test-${wt.date}`,
      date: wt.date,
      title: `Test semanal ${wt.date}`,
      type: "semanal",
      questionIds: is1706 ? q1706.map((q) => q.id) : [],
      status: is1706 ? "pendiente" : "pendiente",
      durationMinutes: 60,
      source: wt.material ?? "",
      topicIds: extractTopicIds(wt.topics ?? ""),
    };
  });

  await db.transaction(
    "rw",
    [
      db.topics,
      db.subtopics,
      db.materials,
      db.questions,
      db.tests,
      db.settings,
    ],
    async () => {
      await db.topics.bulkPut(topics);
      await db.subtopics.bulkPut(SEED_SUBTOPICS);
      await db.materials.bulkPut(materials);
      await db.questions.bulkPut(questions);
      await db.tests.bulkPut(tests);
      const existing = await db.settings.get("default");
      if (!existing) await db.settings.put(DEFAULT_SETTINGS);
    },
  );
}

function extractTopicIds(raw: string): string[] {
  const matches = raw.match(/[CE]\d{2}(?:\.\d)?/g);
  return matches ? Array.from(new Set(matches)) : [];
}

export async function ensureSeeded(): Promise<void> {
  const settings = await db.settings.get("default");
  const count = await db.topics.count();
  if (!settings || count === 0) {
    await loadSeed();
  }
}
