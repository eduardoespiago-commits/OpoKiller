import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db/db";
import { getSettings } from "../db/actions";
import { DEFAULT_SETTINGS } from "../db/defaults";
import { todayISO } from "../domain/dates";

export function useTopics() {
  return useLiveQuery(() => db.topics.toArray(), [], []);
}
export function useSubtopics() {
  return useLiveQuery(() => db.subtopics.toArray(), [], []);
}
export function useProducts(topicId?: string) {
  return useLiveQuery(
    () => (topicId ? db.products.where("topicId").equals(topicId).toArray() : db.products.toArray()),
    [topicId],
    [],
  );
}
export function useMaterials() {
  return useLiveQuery(() => db.materials.orderBy("date").reverse().toArray(), [], []);
}
export function useReviews() {
  return useLiveQuery(() => db.reviews.toArray(), [], []);
}
export function useErrors() {
  return useLiveQuery(() => db.errors.toArray(), [], []);
}
export function useTests() {
  return useLiveQuery(() => db.tests.orderBy("date").reverse().toArray(), [], []);
}
export function useAttempts() {
  return useLiveQuery(() => db.attempts.toArray(), [], []);
}
export function useQuestions() {
  return useLiveQuery(() => db.questions.toArray(), [], []);
}
export function useSessions() {
  return useLiveQuery(() => db.sessions.toArray(), [], []);
}
export function useTasksForDay(date: string) {
  return useLiveQuery(
    () => db.tasks.where("plannedDate").equals(date).toArray(),
    [date],
    [],
  );
}
export function useAllTasks() {
  return useLiveQuery(() => db.tasks.toArray(), [], []);
}
export function useSettings() {
  return useLiveQuery(async () => (await getSettings()) ?? DEFAULT_SETTINGS, [], DEFAULT_SETTINGS);
}
export function useWeeklyPlans() {
  return useLiveQuery(() => db.weeklyPlans.toArray(), [], []);
}
export function useCheckin(date: string = todayISO()) {
  return useLiveQuery(() => db.checkins.get(date), [date], undefined);
}
