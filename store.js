// Where the app's data lives. Two interchangeable stores with one interface:
// the real one talks to Supabase, the demo one keeps made-up data in memory.

import * as api from './api.js';
import { demoRows } from './demo-data.js';

const TASK_KIND = 'task'; // the Chrome extension's kind for plain to-dos

function newId() {
  return globalThis.crypto.randomUUID();
}

function nowIso() {
  return new Date().toISOString();
}

function newTask({ title, course_name, deadline }, userId) {
  const now = nowIso();
  return {
    id: newId(),
    user_id: userId,
    kind: TASK_KIND,
    title: String(title).trim(),
    link: null,
    course_name: course_name || null,
    deadline: deadline || null,
    done: false,
    done_at: null,
    added_at: now,
    updated_at: now,
  };
}

function newCourse(fields, userId) {
  return {
    id: newId(),
    user_id: userId,
    is_hidden: false,
    color_index: null,
    tracker_preset: null,
    tracker_current_week: 1,
    ...fields,
    updated_at: nowIso(),
  };
}

function sameCell(a, b) {
  return a.user_course_id === b.user_course_id && a.row_type === b.row_type
    && a.row_index === b.row_index && a.week === b.week;
}

/**
 * Course settings are keyed by name: update the existing row for that course
 * (reviving a deleted one), or create it.
 */
function courseToSave(existingCourses, fields, userId) {
  const existing = existingCourses.find((course) => course.course_name === fields.course_name);
  return existing
    ? { ...existing, ...fields, deleted_at: null, updated_at: nowIso() }
    : newCourse(fields, userId);
}

function cellToSave(existingCells, cell, userId) {
  const existing = existingCells.find((other) => sameCell(other, cell));
  return existing
    ? { ...existing, completed: cell.completed, deleted_at: null, updated_at: nowIso() }
    : { id: newId(), user_id: userId, ...cell, updated_at: nowIso() };
}

export function createRemoteStore() {
  let userCourses = [];
  let cells = [];
  const userId = () => api.currentSession().userId;

  return {
    async load() {
      const [submissions, tasks, courses, trackerCells] = await Promise.all([
        api.selectAll('submissions'),
        api.selectAll('tasks', `kind=eq.${TASK_KIND}`),
        api.selectAll('user_courses'),
        api.selectAll('tracker_cells'),
      ]);
      userCourses = courses;
      cells = trackerCells;
      return { submissions, tasks, userCourses, cells };
    },
    patchSubmission: (id, fields) => api.patch('submissions', id, { ...fields, updated_at: nowIso() }),
    patchTask: (id, fields) => api.patch('tasks', id, { ...fields, updated_at: nowIso() }),
    async addTask(fields) {
      const task = newTask(fields, userId());
      await api.upsert('tasks', task);
      return task;
    },
    async saveCourse(fields) {
      const row = courseToSave(userCourses, fields, userId());
      await api.upsert('user_courses', row);
      userCourses = [...userCourses.filter((course) => course.id !== row.id), row];
      return row;
    },
    async saveCell(cell) {
      const row = cellToSave(cells, cell, userId());
      await api.upsert('tracker_cells', row);
      cells = [...cells.filter((other) => other.id !== row.id), row];
      return row;
    },
  };
}

export function createDemoStore() {
  const DEMO_USER = 'demo-user';
  let data = { submissions: demoRows(), tasks: [], userCourses: [], cells: [] };
  const patchIn = (list, id, fields) => list.map((row) => (row.id === id ? { ...row, ...fields } : row));

  return {
    load: async () => data,
    async patchSubmission(id, fields) {
      data = { ...data, submissions: patchIn(data.submissions, id, fields) };
    },
    async patchTask(id, fields) {
      data = { ...data, tasks: patchIn(data.tasks, id, fields) };
    },
    async addTask(fields) {
      const task = newTask(fields, DEMO_USER);
      data = { ...data, tasks: [...data.tasks, task] };
      return task;
    },
    async saveCourse(fields) {
      const row = courseToSave(data.userCourses, fields, DEMO_USER);
      data = { ...data, userCourses: [...data.userCourses.filter((course) => course.id !== row.id), row] };
      return row;
    },
    async saveCell(cell) {
      const row = cellToSave(data.cells, cell, DEMO_USER);
      data = { ...data, cells: [...data.cells.filter((other) => other.id !== row.id), row] };
      return row;
    },
  };
}
