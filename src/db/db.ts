import Dexie, { type Table } from "dexie";
import type {
  AppSettings,
  DailyCheckin,
  ErrorEntry,
  Material,
  Question,
  Review,
  StudyProduct,
  StudySession,
  StudyTask,
  Subtopic,
  Test,
  TestAttempt,
  Topic,
  WeeklyPlan,
} from "../domain/types";

export class OpoDB extends Dexie {
  topics!: Table<Topic, string>;
  subtopics!: Table<Subtopic, string>;
  materials!: Table<Material, string>;
  tasks!: Table<StudyTask, string>;
  sessions!: Table<StudySession, string>;
  reviews!: Table<Review, string>;
  questions!: Table<Question, string>;
  tests!: Table<Test, string>;
  attempts!: Table<TestAttempt, string>;
  errors!: Table<ErrorEntry, string>;
  weeklyPlans!: Table<WeeklyPlan, string>;
  checkins!: Table<DailyCheckin, string>;
  settings!: Table<AppSettings, string>;
  products!: Table<StudyProduct, string>;

  constructor() {
    super("opokiller");
    this.version(1).stores({
      topics: "officialId, block, materialStatus, status, priority, nextReviewAt",
      subtopics: "id, topicId, nextReviewAt",
      materials: "id, topicId, processed, date",
      tasks: "id, plannedDate, status, type, topicId",
      sessions: "id, startedAt, topicId, taskId",
      reviews: "id, topicId, scheduledAt, completedAt",
      questions: "id, topicId, category, nextRepeatAt",
      tests: "id, date, status, type",
      attempts: "id, testId, startedAt",
      errors: "id, topicId, status, severity, nextReviewAt",
      weeklyPlans: "id, startDate, status",
      checkins: "date",
      settings: "id",
    });
    // v2: study products per topic (Word-import suggestions + manual checklist).
    this.version(2).stores({
      products: "id, topicId, status, type",
    });
  }
}

export const db = new OpoDB();
