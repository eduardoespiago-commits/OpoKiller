// Core domain types for OpoKiller.
// Kept free of any storage/UI concern so the logic can be unit-tested in isolation.

export type ISODate = string; // "YYYY-MM-DD"
export type ISODateTime = string; // full ISO timestamp

export type Block = "Común" | "Específico";

export type MaterialStatus =
  | "No recibido"
  | "Pendiente confirmar"
  | "Parcial"
  | "Recibido"
  | "Test disponible"
  | "Actualizado";

export type TopicStatus =
  | "No iniciado"
  | "Clase pendiente"
  | "Clase vista"
  | "Lectura inicial"
  | "1.ª vuelta"
  | "En repaso"
  | "Preparado para test"
  | "Consolidado"
  | "Necesita actualización";

export type Priority = "Alta" | "Media" | "Baja";

export interface Topic {
  officialId: string; // e.g. "E36", "C08"
  block: Block;
  number: number;
  title: string;
  materialStatus: MaterialStatus;
  origin: string; // "Matrícula" | "Semanal" | ...
  priority: Priority;
  status: TopicStatus;
  classDate: ISODate | null;
  lastStudyAt: ISODate | null;
  reviewStage: number; // 0..7
  mastery: number; // 0..100
  accumulatedMinutes: number;
  pendingQuestions: number;
  nextReviewAt: ISODate | null;
  academyWeek: string;
  notes: string;
}

export interface Subtopic {
  id: string; // e.g. "E36.1"
  topicId: string; // parent officialId, e.g. "E36"
  code: string; // "36.1"
  title: string;
  status: TopicStatus;
  mastery: number;
  lastStudyAt: ISODate | null;
  nextReviewAt: ISODate | null;
  reviewStage: number;
  accumulatedMinutes: number;
}

export type MaterialType =
  | "Tema Word"
  | "Tema Word / clase"
  | "Temario oficial"
  | "Test semanal"
  | "Test sin corregir"
  | "Plantilla corregida"
  | "Vídeo / clase"
  | "PDF"
  | "Esquema"
  | "Resumen"
  | "Enlace"
  | "Documento propio"
  | "Entrada pendiente"
  | "Otro";

export interface Material {
  id: string;
  name: string;
  type: MaterialType | string;
  date: ISODate | null;
  topicId: string | null;
  subtopicId: string | null;
  topicsRaw: string; // raw "E53, E62 + ..." text from the sheet
  status: string;
  origin: string;
  howTo: string;
  nextAction: string;
  processed: boolean;
  createdAt: ISODateTime;
  version?: number; // material version (docx re-imports bump this)
  supersedesId?: string | null; // previous material version this replaces
}

export type StudyProductType =
  | "mapa-maestro"
  | "resumen"
  | "tabla-normativa"
  | "tabla-cifras"
  | "tabla-comparativa"
  | "diagrama"
  | "preguntas"
  | "flashcards"
  | "mini-test"
  | "supuesto"
  | "notas"
  | "hoja-errores";

export type StudyProductStatus = "pendiente" | "iniciado" | "completado" | "necesita-revision";

export interface StudyProduct {
  id: string;
  topicId: string;
  subtopicId: string | null;
  type: StudyProductType;
  label: string;
  status: StudyProductStatus;
  createdAt: ISODateTime;
}

export type TaskType =
  | "materia-nueva"
  | "primera-vuelta"
  | "repaso"
  | "test"
  | "errores"
  | "atrasado"
  | "cierre"
  | "recuperacion";

export type TaskStatus = "pendiente" | "en-curso" | "completada" | "aplazada";

export interface StudyTask {
  id: string;
  topicId: string | null;
  subtopicId: string | null;
  type: TaskType;
  title: string;
  objective: string;
  expectedOutput: string;
  plannedDate: ISODate;
  plannedMinutes: number;
  actualMinutes: number;
  priority: number; // computed score
  priorityReasons: string[];
  status: TaskStatus;
  source: "auto" | "manual";
  locked: boolean;
  order: number;
  testId?: string | null;
  createdAt: ISODateTime;
}

export interface StudySession {
  id: string;
  taskId: string | null;
  topicId: string | null;
  subtopicId: string | null;
  type: TaskType;
  title: string;
  startedAt: ISODateTime;
  endedAt: ISODateTime | null;
  plannedMinutes: number;
  actualMinutes: number;
  focusScore: number | null; // 1..5
  energy: number | null; // 1..5
  difficulty: number | null; // 1..5
  completedPercentage: number | null; // 0..100
  recall: number | null; // 0..5 self-report
  notes: string;
}

export type ReviewType =
  | "esquema"
  | "preguntas-cortas"
  | "flashcards"
  | "mini-test"
  | "explicacion-oral"
  | "tabla-datos"
  | "procedimiento"
  | "errores"
  | "test-acumulativo";

export interface Review {
  id: string;
  topicId: string;
  subtopicId: string | null;
  scheduledAt: ISODate;
  completedAt: ISODate | null;
  reviewType: ReviewType;
  recallScore: number | null; // 0..5
  stageBefore: number;
  stageAfter: number | null;
  nextReviewAt: ISODate | null;
}

export type QuestionType =
  | "test"
  | "respuesta-corta"
  | "enumeracion"
  | "comparacion"
  | "definicion"
  | "procedimiento";

export interface Question {
  id: string;
  topicId: string;
  subtopicId: string | null;
  type: QuestionType;
  category: string; // "Tema semanal" | "Acumulativo" | ...
  statement: string;
  options: string[]; // [A,B,C,D]
  correctAnswer: string; // "A".."D" for test
  explanation: string;
  source: string;
  difficulty: Priority;
  timesAnswered: number;
  timesCorrect: number;
  timesIncorrect: number;
  lastAnsweredAt: ISODate | null;
  nextRepeatAt: ISODate | null;
}

export type TestType =
  | "por-tema"
  | "acumulativo"
  | "semanal"
  | "simulacro"
  | "solo-fallos"
  | "solo-dudas"
  | "por-bloque";

export interface Test {
  id: string;
  date: ISODate;
  title: string;
  type: TestType;
  questionIds: string[];
  status: "pendiente" | "en-curso" | "corregido";
  durationMinutes: number;
  source: string;
  topicIds: string[];
}

export interface TestAnswer {
  questionId: string;
  selected: string | null; // "A".."D" or null (blank)
  flaggedDoubt: boolean;
  result: "Correcta" | "Error" | "Blanco";
}

export interface TestAttempt {
  id: string;
  testId: string;
  startedAt: ISODateTime;
  finishedAt: ISODateTime | null;
  answers: TestAnswer[];
  correct: number;
  incorrect: number;
  blank: number;
  netScore: number;
  rawPercentage: number;
  netPercentage: number;
  totalSeconds: number;
}

export type ErrorCause =
  | "no-lo-sabia"
  | "confundi-conceptos"
  | "falle-cifra"
  | "confundi-norma"
  | "no-vi-excepcion"
  | "lei-mal"
  | "cambie-respuesta"
  | "desactualizado";

export type ErrorSeverity = "Alta" | "Media" | "Baja";

export type ErrorStatus =
  | "nuevo"
  | "pendiente"
  | "repetido"
  | "comprendido"
  | "resuelto"
  | "recurrente";

export interface ErrorEntry {
  id: string;
  questionId: string | null;
  topicId: string | null;
  subtopicId: string | null;
  statement: string;
  selectedAnswer: string;
  correctAnswer: string;
  cause: ErrorCause | null;
  correctionRule: string;
  severity: ErrorSeverity;
  status: ErrorStatus;
  repetitions: number;
  createdAt: ISODate;
  nextReviewAt: ISODate | null;
  notes: string;
}

export interface WeeklyPlan {
  id: string; // startDate
  startDate: ISODate;
  targetHours: number;
  currentTopicPct: number;
  backlogPct: number;
  reviewPct: number;
  currentTopicIds: string[];
  backlogTopicId: string | null;
  status: "activa" | "cerrada";
  createdAt: ISODateTime;
}

export interface DailyCheckin {
  date: ISODate;
  availabilityMinutes: number;
  energy: number; // 1..5
  fatigue: number; // 1..5
  focus: number; // 1..5
  constraints: string;
  preferredDayType: DayType;
  eveningNote: string;
  tomorrowFirstStep: string;
}

export type DayType =
  | "minimo"
  | "ligero"
  | "medio"
  | "normal"
  | "intensivo"
  | "descanso"
  | "clase"
  | "test";

export interface AppSettings {
  id: "default";
  weeklyTargetHours: number;
  currentTopicPct: number;
  backlogPct: number;
  reviewPct: number;
  maxCurrentTopics: number;
  maxBacklogTopics: number;
  pomodoroPreset: number; // minutes of focus
  pomodoroBreak: number;
  reviewIntervals: number[]; // by stage
  penaltyCorrect: number;
  penaltyIncorrect: number;
  penaltyBlank: number;
  theme: "auto" | "claro" | "oscuro";
  availabilityByWeekday: number[]; // minutes, index 0=Mon..6=Sun
  onboarded: boolean;
  lastBackupAt: ISODateTime | null;
  notificationsEnabled: boolean;
  weights: PriorityWeights;
}

export interface PriorityWeights {
  weeklyTopic: number;
  reviewDue: number;
  testDue: number;
  lowMastery: number;
  openErrors: number;
  partialMaterial: number;
  startedTopic: number;
  classSoon: number;
  overloadPenalty: number;
  tooManyFrontsPenalty: number;
}
