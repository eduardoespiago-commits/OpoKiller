import type { AppSettings } from "../domain/types";
import { DEFAULT_WEIGHTS } from "../domain/planner";
import { DEFAULT_INTERVALS } from "../domain/review";
import { OFFICIAL_PENALTY } from "../domain/scoring";

export const DEFAULT_SETTINGS: AppSettings = {
  id: "default",
  weeklyTargetHours: 28,
  currentTopicPct: 0.55,
  backlogPct: 0.25,
  reviewPct: 0.2,
  maxCurrentTopics: 2,
  maxBacklogTopics: 1,
  pomodoroPreset: 45,
  pomodoroBreak: 10,
  reviewIntervals: DEFAULT_INTERVALS,
  penaltyCorrect: OFFICIAL_PENALTY.correct,
  penaltyIncorrect: OFFICIAL_PENALTY.incorrect,
  penaltyBlank: OFFICIAL_PENALTY.blank,
  theme: "auto",
  // Mon..Sun, in minutes. Weekdays 4h, Sat 5h, Sun 2h by default.
  availabilityByWeekday: [240, 240, 240, 240, 240, 300, 120],
  onboarded: false,
  lastBackupAt: null,
  notificationsEnabled: false,
  weights: DEFAULT_WEIGHTS,
};
