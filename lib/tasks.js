// Which rows count as "still to do", and how to order and group them.

import { dueTime, dayKey } from './time.js';

const STATUS_SUBMITTED = 'submitted';
const COURSE_SEPARATOR = '·';
const ASSIGNMENT_WORD = 'מטלה';
const MANUAL_PREFIX = 'משימה אישית';

export const SOURCE_MOODLE = 'moodle';
export const SOURCE_MANUAL = 'manual';

/**
 * Turn a row of the `tasks` table (a task the user typed in, here or in the
 * Chrome extension) into the same shape as a Moodle assignment row, so one
 * list, calendar and history can show both.
 */
export function fromManualTask(task) {
  return {
    id: task.id,
    source: SOURCE_MANUAL,
    name: task.title,
    description: `${MANUAL_PREFIX} ${COURSE_SEPARATOR} ${task.course_name || ''}`,
    link: task.link || null,
    due_at: task.deadline || null,
    is_hidden: false,
    manual_done: !!task.done,
    manual_done_at: task.done_at || null,
    moodle_status: null,
    deleted_at: task.deleted_at || null,
    updated_at: task.updated_at || null,
  };
}

export function isManual(row) {
  return row.source === SOURCE_MANUAL;
}

/** @returns {string} course name parsed from "מועד הגשת מטלה · <course>" */
export function courseName(row) {
  const description = String(row.description || '');
  const index = description.indexOf(COURSE_SEPARATOR);
  return index === -1 ? '' : description.slice(index + 1).trim();
}

/** @returns {'assignment'|'activity'} */
export function taskKind(row) {
  return String(row.description || '').includes(ASSIGNMENT_WORD) ? 'assignment' : 'activity';
}

export function isOpen(row) {
  return !row.deleted_at && !row.is_hidden && !row.manual_done && row.moodle_status !== STATUS_SUBMITTED;
}

/**
 * Open tasks, soonest first; tasks without a due time go last.
 * @param {object[]} rows
 * @param {string[]} [hiddenCourses] course names the user chose not to see
 */
export function openTasks(rows, hiddenCourses = []) {
  const hidden = new Set(hiddenCourses);
  return rows
    .filter((row) => isOpen(row) && !hidden.has(courseName(row)))
    .map((row) => ({ row, due: dueTime(row) }))
    .sort((a, b) => (a.due ?? Infinity) - (b.due ?? Infinity))
    .map(({ row }) => row);
}

/** Distinct course names among rows that are not deleted, sorted for display. */
export function allCourses(rows) {
  const names = rows.filter((row) => !row.deleted_at).map(courseName).filter(Boolean);
  return [...new Set(names)].sort((a, b) => a.localeCompare(b, 'he'));
}

/**
 * @param {object[]} tasks
 * @returns {Map<string, object[]>} yyyy-mm-dd → tasks due that local day
 */
export function groupByDay(tasks) {
  const groups = new Map();
  for (const row of tasks) {
    const due = dueTime(row);
    if (due == null) continue;
    const key = dayKey(new Date(due));
    groups.set(key, [...(groups.get(key) || []), row]);
  }
  return groups;
}

const REASON_MANUAL = 'manual';       // marked done by hand
const REASON_SUBMITTED = 'submitted'; // Moodle reports it was submitted
const REASON_REMOVED = 'removed';     // no longer listed in Moodle

function historyReason(row) {
  if (row.is_hidden) return null;                     // deleted by the user
  if (isManual(row) && row.deleted_at) return null;   // deleted by the user
  if (row.manual_done) return REASON_MANUAL;
  if (row.moodle_status === STATUS_SUBMITTED) return REASON_SUBMITTED;
  if (row.deleted_at) return REASON_REMOVED;
  return null;
}

/**
 * Finished tasks, newest first.
 * @returns {{ row: object, reason: 'manual'|'submitted'|'removed', at: number }[]}
 */
export function historyItems(rows) {
  return rows
    .map((row) => ({
      row,
      reason: historyReason(row),
      at: Date.parse(row.manual_done_at || row.deleted_at || row.updated_at || '') || 0,
    }))
    .filter((item) => item.reason)
    .sort((a, b) => b.at - a.at);
}
