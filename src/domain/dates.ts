import type { ISODate } from "./types";

export function todayISO(now: Date = new Date()): ISODate {
  return toISODate(now);
}

export function toISODate(d: Date): ISODate {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseISO(date: ISODate): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(date: ISODate, days: number): ISODate {
  const d = parseISO(date);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

export function diffDays(a: ISODate, b: ISODate): number {
  // a - b in whole days
  const ms = parseISO(a).getTime() - parseISO(b).getTime();
  return Math.round(ms / 86400000);
}

/** Monday of the week containing `date`. */
export function startOfWeek(date: ISODate): ISODate {
  const d = parseISO(date);
  const weekday = (d.getDay() + 6) % 7; // Mon=0 .. Sun=6
  d.setDate(d.getDate() - weekday);
  return toISODate(d);
}

/** 0=Mon .. 6=Sun */
export function weekdayIndex(date: ISODate): number {
  return (parseISO(date).getDay() + 6) % 7;
}

const WEEKDAY_NAMES = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
];

export function weekdayName(date: ISODate): string {
  return WEEKDAY_NAMES[weekdayIndex(date)];
}

export function formatHuman(date: ISODate): string {
  const d = parseISO(date);
  return d.toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function formatShort(date: ISODate): string {
  const d = parseISO(date);
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" });
}

export function weekDates(start: ISODate): ISODate[] {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}
