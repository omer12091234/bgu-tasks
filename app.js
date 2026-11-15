// App shell: holds the state, talks to the store, and re-renders screens.

import * as api from './api.js';
import { createRemoteStore, createDemoStore } from './store.js';
import { openTasks, allCourses, historyItems, fromManualTask, isManual, SOURCE_MOODLE } from './lib/tasks.js';
import { shiftMonth } from './lib/calendar.js';
import { buildIcs, icsFileName } from './lib/ics.js';
import { dayKey } from './lib/time.js';
import { tasksScreen, calendarScreen, settingsScreen, loginScreen, taskDialog, tabBar, el } from './ui.js';
import { progressScreen } from './ui-progress.js';
import { pushSupport, currentSubscription, subscribe, unsubscribe, SUPPORT_OK } from './push.js';

const HIDDEN_COURSES_KEY = 'bgu-tasks.hiddenCourses';
const DATA_CACHE_KEY = 'bgu-tasks.data';
const COUNTDOWN_REFRESH_MS = 30 * 1000;
const UNDO_WINDOW_MS = 6 * 1000;
const UNAUTHORIZED = 401;
const EMPTY_DATA = { submissions: [], tasks: [], userCourses: [], cells: [] };

const isDemo = new URLSearchParams(location.search).has('demo');
const store = isDemo ? createDemoStore() : createRemoteStore();
const appNode = document.getElementById('app');
const tabsNode = document.getElementById('tabs');
const toastNode = document.getElementById('toast');
const updatedFormatter = new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

function readJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch (_err) {
    return fallback;
  }
}

const today = new Date();
let state = {
  signedIn: isDemo || !!api.currentSession(),
  view: 'tasks',
  taskMode: 'open',
  data: isDemo ? EMPTY_DATA : { ...EMPTY_DATA, ...readJson(DATA_CACHE_KEY, {}) },
  push: { support: isDemo ? 'demo' : pushSupport(), enabled: false, busy: false, error: null },
  calendar: { year: today.getFullYear(), month: today.getMonth(), selectedKey: dayKey(today) },
  notice: null,
  loginError: null,
  busy: false,
  lastUpdated: null,
};
let toastTimer = null;

function setState(patch) {
  state = { ...state, ...patch };
  render();
}

// ---------- derived data ----------

/** Moodle assignments and manual tasks as one list of the same shape. */
function allRows() {
  return [
    ...state.data.submissions.map((row) => ({ ...row, source: SOURCE_MOODLE })),
    ...state.data.tasks.map(fromManualTask),
  ];
}

function savedCourses() {
  return state.data.userCourses.filter((course) => !course.deleted_at);
}

// Hidden courses are saved on the server (not just on this phone), so the
// Chrome extension and the notifications respect the same choice.
function hiddenCourses() {
  return savedCourses().filter((course) => course.is_hidden).map((course) => course.course_name);
}

function visibleTasks() {
  return openTasks(allRows(), hiddenCourses());
}

/** Every course name we know: from tasks, plus ones saved for progress tracking. */
function courseNames() {
  const names = [...allCourses(allRows()), ...savedCourses().map((course) => course.course_name)];
  return [...new Set(names)].sort((a, b) => a.localeCompare(b, 'he'));
}

// ---------- server ----------

async function refresh() {
  if (!state.signedIn) return;
  try {
    const data = await store.load();
    if (!isDemo) localStorage.setItem(DATA_CACHE_KEY, JSON.stringify(data));
    setState({ data, notice: null, lastUpdated: updatedFormatter.format(new Date()) });
    await moveLocalHiddenCoursesToServer();
  } catch (err) {
    if (err.status === UNAUTHORIZED) {
      setState({ signedIn: false, loginError: 'צריך להתחבר מחדש.' });
      return;
    }
    setState({ notice: `לא הצלחתי לרענן (${err.message}). מוצגים הנתונים האחרונים שנשמרו.` });
  }
}

async function signIn(email, password) {
  setState({ busy: true, loginError: null });
  try {
    await api.signIn(email, password);
    setState({ signedIn: true, busy: false });
    await refresh();
  } catch (err) {
    const message = /invalid login/i.test(err.message) ? 'אימייל או סיסמה שגויים.' : `ההתחברות נכשלה: ${err.message}`;
    setState({ busy: false, loginError: message });
  }
}

function signOut() {
  api.signOut();
  localStorage.removeItem(DATA_CACHE_KEY);
  setState({ signedIn: false, data: EMPTY_DATA, view: 'tasks' });
}

function patchById(list, id, fields) {
  return list.map((row) => (row.id === id ? { ...row, ...fields } : row));
}

function upsertById(list, row) {
  return list.some((other) => other.id === row.id) ? patchById(list, row.id, row) : [...list, row];
}

/** Show a change at once, save it, and roll back with a message if saving fails. */
async function saveChange(nextData, save) {
  const before = state.data;
  setState({ data: nextData });
  try {
    await save();
    return true;
  } catch (err) {
    setState({ data: before, notice: `השינוי לא נשמר (${err.message}).` });
    return false;
  }
}

/** Change fields on a task, whichever table it lives in. */
function changeTask(row, manualFields, moodleFields) {
  return isManual(row)
    ? saveChange({ ...state.data, tasks: patchById(state.data.tasks, row.id, manualFields) }, () => store.patchTask(row.id, manualFields))
    : saveChange({ ...state.data, submissions: patchById(state.data.submissions, row.id, moodleFields) }, () => store.patchSubmission(row.id, moodleFields));
}

function setDone(row, done) {
  const at = done ? new Date().toISOString() : null;
  return changeTask(row, { done, done_at: at }, { manual_done: done, manual_done_at: at });
}

// Deleting a manual task removes it; "deleting" a Moodle assignment hides
// it, so the hourly check does not bring it straight back.
function setDeleted(row, deleted) {
  return changeTask(row, { deleted_at: deleted ? new Date().toISOString() : null }, { is_hidden: deleted });
}

async function markDone(row) {
  if (await setDone(row, true)) showToast(`"${row.name}" סומנה כבוצעה`, 'בטל', () => setDone(row, false));
}

async function deleteTask(row) {
  if (await setDeleted(row, true)) showToast(`"${row.name}" נמחקה`, 'בטל', () => setDeleted(row, false));
}

async function addTask(fields) {
  try {
    const task = await store.addTask(fields);
    setState({ data: { ...state.data, tasks: [...state.data.tasks, task] }, taskMode: 'open' });
  } catch (err) {
    setState({ notice: `המשימה לא נשמרה (${err.message}).` });
  }
}

function openTaskDialog() {
  const dialog = taskDialog({ courses: courseNames(), onSubmit: addTask });
  document.body.append(dialog);
  dialog.showModal();
}

async function saveCourse(fields) {
  try {
    const course = await store.saveCourse(fields);
    setState({ data: { ...state.data, userCourses: upsertById(state.data.userCourses, course) } });
  } catch (err) {
    setState({ notice: `ההגדרה לא נשמרה (${err.message}).` });
  }
}

async function toggleSession(course, row, week, completed) {
  try {
    const cell = await store.saveCell({
      user_course_id: course.id, row_type: row.type, row_index: row.index, week, completed,
    });
    setState({ data: { ...state.data, cells: upsertById(state.data.cells, cell) } });
  } catch (err) {
    setState({ notice: `הסימון לא נשמר (${err.message}).` });
  }
}

function addToCalendar(row) {
  const file = buildIcs(row, Date.now());
  if (!file) return;
  const url = URL.createObjectURL(new Blob([file], { type: 'text/calendar;charset=utf-8' }));
  const link = el('a', { href: url, download: icsFileName(row) });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10 * 1000);
}

function toggleCourse(name, visible) {
  return saveCourse({ course_name: name, is_hidden: !visible });
}

// Earlier versions kept hidden courses on the phone only. Move them once.
async function moveLocalHiddenCoursesToServer() {
  const local = readJson(HIDDEN_COURSES_KEY, []);
  if (isDemo || local.length === 0) return;
  localStorage.removeItem(HIDDEN_COURSES_KEY);
  for (const name of local) {
    await saveCourse({ course_name: name, is_hidden: true });
  }
}

// ---------- notifications ----------

async function loadPushState() {
  if (state.push.support !== SUPPORT_OK) return;
  try {
    const device = await currentSubscription();
    setState({ push: { ...state.push, enabled: !!device } });
  } catch (err) {
    setState({ push: { ...state.push, error: `לא הצלחתי לבדוק את מצב ההתראות (${err.message}).` } });
  }
}

async function togglePush(enable) {
  setState({ push: { ...state.push, busy: true, error: null } });
  try {
    if (enable) {
      await store.saveDevice(await subscribe());
    } else {
      const endpoint = await unsubscribe();
      if (endpoint) await store.removeDevice(endpoint);
    }
    setState({ push: { ...state.push, support: pushSupport(), enabled: enable, busy: false } });
  } catch (err) {
    setState({ push: { ...state.push, support: pushSupport(), busy: false, error: `לא הצלחתי (${err.message}).` } });
  }
}

// ---------- rendering ----------

function showToast(message, actionLabel, onAction) {
  clearTimeout(toastTimer);
  const hide = () => { toastNode.hidden = true; };
  toastNode.replaceChildren(
    el('span', { text: message }),
    el('button', { type: 'button', text: actionLabel, onclick: () => { hide(); onAction(); } }),
  );
  toastNode.hidden = false;
  toastTimer = setTimeout(hide, UNDO_WINDOW_MS);
}

function currentScreen() {
  const taskHandlers = { onDone: markDone, onCalendar: addToCalendar, onDelete: deleteTask };
  const now = Date.now();

  if (state.view === 'calendar') {
    return calendarScreen({
      tasks: visibleTasks(),
      now,
      view: state.calendar,
      handlers: {
        ...taskHandlers,
        onSelectDay: (selectedKey) => setState({ calendar: { ...state.calendar, selectedKey } }),
        onShiftMonth: (delta) => setState({
          calendar: { ...state.calendar, ...shiftMonth(state.calendar.year, state.calendar.month, delta) },
        }),
      },
    });
  }
  if (state.view === 'progress') {
    const hidden = new Set(hiddenCourses());
    const saved = new Map(savedCourses().map((course) => [course.course_name, course]));
    return progressScreen({
      courses: courseNames().filter((name) => !hidden.has(name)).map((name) => ({ name, course: saved.get(name) || null })),
      cells: state.data.cells,
      handlers: {
        onPreset: (name, preset) => saveCourse({ course_name: name, tracker_preset: preset }),
        onWeek: (name, week) => saveCourse({ course_name: name, tracker_current_week: week }),
        onToggle: toggleSession,
        onAddCourse: (name) => saveCourse({ course_name: name }),
      },
    });
  }
  if (state.view === 'settings') {
    const session = api.currentSession();
    return settingsScreen({
      courses: courseNames(),
      hiddenCourses: hiddenCourses(),
      email: session && session.email,
      lastUpdated: state.lastUpdated,
      demo: isDemo,
      push: state.push,
      handlers: { onToggleCourse: toggleCourse, onRefresh: refresh, onSignOut: signOut, onTogglePush: togglePush },
    });
  }
  const demoNotice = isDemo ? 'מצב הדגמה: מטלות מומצאות, שום דבר לא נשמר.' : null;
  return tasksScreen({
    tasks: visibleTasks(),
    history: historyItems(allRows()),
    mode: state.taskMode,
    now,
    notice: state.notice || demoNotice,
    handlers: {
      ...taskHandlers,
      onRestore: (row) => setDone(row, false),
      onMode: (taskMode) => setState({ taskMode }),
      onAdd: openTaskDialog,
    },
  });
}

function render() {
  if (!state.signedIn) {
    tabsNode.hidden = true;
    appNode.replaceChildren(...loginScreen({ error: state.loginError, busy: state.busy, onSubmit: signIn }).filter(Boolean));
    return;
  }
  appNode.replaceChildren(...currentScreen().filter(Boolean));
  tabsNode.replaceChildren(...tabBar(state.view, (view) => setState({ view })));
  tabsNode.hidden = false;
}

// ---------- start ----------

render();
refresh();
loadPushState();

// Keep countdowns current (only where they are shown, so typing and
// scrolling elsewhere are never interrupted), and refetch on return.
setInterval(() => {
  const showsCountdowns = state.view === 'tasks' || state.view === 'calendar';
  if (state.signedIn && showsCountdowns && !document.querySelector('dialog[open]')) render();
}, COUNTDOWN_REFRESH_MS);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });

if (!isDemo && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch((err) => console.warn('[app] offline support unavailable', err));
}
