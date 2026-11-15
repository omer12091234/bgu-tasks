// Numbers for the statistics screen. Pure functions over the saved rows:
// study time per day and course, watched videos, and how early tasks get done.

import { dayKey } from './time.js';

const HOUR_MS = 60 * 60 * 1000;
const DAYS_IN_WEEK = 7;
export const HEATMAP_WEEKS = 13;
// Deadline score: done three days early or more is 100, a day late or more is 0.
const SCORE_BEST_HOURS = 72;
const SCORE_WORST_HOURS = -24;

function startOfDay(ms) {
  const date = new Date(ms);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** The Sunday that starts the week of `ms`, as a Date at 00:00. */
export function weekStart(ms) {
  const day = startOfDay(ms);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate() - day.getDay());
}

function shiftDays(date, days) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** Seconds studied on each day: { 'yyyy-mm-dd': seconds }. */
export function secondsByDay(sessions) {
  const totals = {};
  for (const row of sessions) {
    if (row.deleted_at) continue;
    totals[row.date] = (totals[row.date] || 0) + (row.total_seconds || 0);
  }
  return totals;
}

function sumRange(byDay, from, days) {
  let total = 0;
  for (let offset = 0; offset < days; offset += 1) total += byDay[dayKey(shiftDays(from, offset))] || 0;
  return total;
}

/** Study seconds this week (from Sunday) and in the week before it. */
export function weekTotals(sessions, nowMs) {
  const byDay = secondsByDay(sessions);
  const start = weekStart(nowMs);
  return {
    thisWeek: sumRange(byDay, start, DAYS_IN_WEEK),
    lastWeek: sumRange(byDay, shiftDays(start, -DAYS_IN_WEEK), DAYS_IN_WEEK),
  };
}

/** Days in a row with study time, ending today (or yesterday, if today is still empty). */
export function streak(sessions, nowMs) {
  const byDay = secondsByDay(sessions);
  let day = startOfDay(nowMs);
  if (!byDay[dayKey(day)]) day = shiftDays(day, -1);
  let count = 0;
  while (byDay[dayKey(day)] > 0) {
    count += 1;
    day = shiftDays(day, -1);
  }
  return count;
}

/**
 * The last 13 weeks as columns of 7 days (Sunday first), oldest week first.
 * `level` is 0 (nothing) to 4 (the busiest days).
 */
export function heatmap(sessions, nowMs) {
  const byDay = secondsByDay(sessions);
  const today = startOfDay(nowMs);
  const first = shiftDays(weekStart(nowMs), -DAYS_IN_WEEK * (HEATMAP_WEEKS - 1));
  const days = Array.from({ length: HEATMAP_WEEKS * DAYS_IN_WEEK }, (_, index) => {
    const date = shiftDays(first, index);
    const key = dayKey(date);
    return { key, seconds: byDay[key] || 0, future: date > today };
  });
  const busiest = Math.max(0, ...days.map((day) => day.seconds));
  const withLevels = days.map((day) => ({
    ...day,
    level: day.seconds > 0 ? Math.max(1, Math.ceil((day.seconds / busiest) * 4)) : 0,
  }));
  return Array.from({ length: HEATMAP_WEEKS }, (_, week) => withLevels.slice(week * DAYS_IN_WEEK, (week + 1) * DAYS_IN_WEEK));
}

/** Study seconds per course, most studied first. */
export function secondsByCourse(sessions) {
  const totals = new Map();
  for (const row of sessions) {
    if (row.deleted_at) continue;
    totals.set(row.course_name, (totals.get(row.course_name) || 0) + (row.total_seconds || 0));
  }
  return [...totals].map(([course, seconds]) => ({ course, seconds })).sort((a, b) => b.seconds - a.seconds);
}

function uniqueByLink(rows) {
  return [...new Map(rows.filter((row) => !row.deleted_at).map((row) => [row.link, row])).values()];
}

/** How many videos were watched, and which were started but not finished. */
export function videoSummary(watched, times) {
  const watchedRows = uniqueByLink(watched);
  const watchedLinks = new Set(watchedRows.map((row) => row.link));
  const unfinished = uniqueByLink(times)
    .filter((row) => !watchedLinks.has(row.link) && row.seconds > 0)
    .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
  return { watchedCount: watchedRows.length, unfinished };
}

/** Share of the manual tasks that are done, in whole percent; null without tasks. */
export function taskCompletion(tasks) {
  const live = tasks.filter((task) => !task.deleted_at);
  if (!live.length) return null;
  return Math.round((live.filter((task) => task.done).length / live.length) * 100);
}

/**
 * How early things get done. Uses every task and assignment that has both a
 * deadline and a moment it was marked done.
 * @returns {{ score: number, averageHours: number, count: number }|null}
 */
export function deadlineScore(tasks, submissions) {
  const pairs = [
    ...tasks.filter((task) => !task.deleted_at && task.done).map((task) => [task.deadline, task.done_at]),
    ...submissions.filter((row) => row.manual_done).map((row) => [row.due_at, row.manual_done_at]),
  ];
  const hours = pairs
    .map(([due, done]) => (Date.parse(due) - Date.parse(done)) / HOUR_MS)
    .filter((value) => Number.isFinite(value));
  if (!hours.length) return null;
  const averageHours = hours.reduce((sum, value) => sum + value, 0) / hours.length;
  const share = (averageHours - SCORE_WORST_HOURS) / (SCORE_BEST_HOURS - SCORE_WORST_HOURS);
  return { score: Math.round(Math.min(1, Math.max(0, share)) * 100), averageHours, count: hours.length };
}

/** "3.5 שעות" or "40 דקות". */
export function formatDuration(seconds) {
  if (seconds >= 3600) return `${(seconds / 3600).toFixed(1).replace(/\.0$/, '')} שעות`;
  return `${Math.round(seconds / 60)} דקות`;
}
