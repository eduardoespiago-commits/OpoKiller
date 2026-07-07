// Task templates: turn a topic + intent into a concrete, checkable task
// ("verb + scope + duration + product"), never a vague "study topic X".
import type { StudyTask, TaskType, Topic } from "./types";

export interface TaskTemplate {
  type: TaskType;
  title: (t: Topic) => string;
  objective: string;
  expectedOutput: string;
  minutes: number;
}

export const FIRST_PASS_TEMPLATE: TaskTemplate = {
  type: "primera-vuelta",
  title: (t) => `${t.officialId}: primera vuelta activa`,
  objective:
    "Comprender el tema por epígrafes y convertirlo en material recuperable.",
  expectedOutput:
    "Mapa/esquema del tema + tabla de cifras y normativa + 15-20 preguntas respondidas sin mirar.",
  minutes: 80,
};

export const NEW_MATERIAL_TEMPLATE: TaskTemplate = {
  type: "materia-nueva",
  title: (t) => `${t.officialId}: registrar y abrir material nuevo`,
  objective: "Situar el tema nuevo: índice, alcance y primeros epígrafes.",
  expectedOutput: "Índice revisado + 1 nota por idea nueva + dudas localizadas.",
  minutes: 60,
};

export const BACKLOG_TEMPLATE: TaskTemplate = {
  type: "atrasado",
  title: (t) => `${t.officialId}: recuperar un apartado atrasado`,
  objective: "Avanzar un único apartado del tema atrasado (sin abrir más frentes).",
  expectedOutput: "Un apartado procesado con su mini-esquema y 5-8 datos anotados.",
  minutes: 50,
};

export const REVIEW_TEMPLATE: TaskTemplate = {
  type: "repaso",
  title: (t) => `${t.officialId}: repaso por recuperación`,
  objective: "Recuperar el tema sin mirar y corregir después.",
  expectedOutput:
    "Esquema en hoja en blanco o 10 preguntas + corrección y errores anotados.",
  minutes: 30,
};

export const ERRORS_TEMPLATE: TaskTemplate = {
  type: "errores",
  title: () => "Repetir errores pendientes",
  objective: "Volver a responder los errores vencidos hasta acertarlos.",
  expectedOutput: "Errores repetidos, causa anotada y regla de corrección.",
  minutes: 20,
};

export const CLOSE_TEMPLATE: TaskTemplate = {
  type: "cierre",
  title: () => "Cierre diario",
  objective: "Actualizar estado, minutos y decidir el primer paso de mañana.",
  expectedOutput: "Estado y dominio actualizados + acción concreta para mañana.",
  minutes: 10,
};

export const RECOVERY_TEMPLATE: TaskTemplate = {
  type: "recuperacion",
  title: () => "Recuperación inicial",
  objective: "Activar lo anterior antes de abrir nada nuevo.",
  expectedOutput: "Lista de lagunas y errores en hoja en blanco.",
  minutes: 15,
};

let counter = 0;
export function newTaskId(): string {
  counter += 1;
  return `task-${Date.now()}-${counter}`;
}

export function buildTask(
  template: TaskTemplate,
  topic: Topic | null,
  plannedDate: string,
  order: number,
  extra: Partial<StudyTask> = {},
): StudyTask {
  return {
    id: newTaskId(),
    topicId: topic ? topic.officialId : null,
    subtopicId: null,
    type: template.type,
    title: topic ? template.title(topic) : template.title({} as Topic),
    objective: template.objective,
    expectedOutput: template.expectedOutput,
    plannedDate,
    plannedMinutes: template.minutes,
    actualMinutes: 0,
    priority: 0,
    priorityReasons: [],
    status: "pendiente",
    source: "auto",
    locked: false,
    order,
    createdAt: new Date().toISOString(),
    ...extra,
  };
}
