// "Progress" screen: per course, mark which weekly lectures and practice
// sessions you attended or watched, and see which ones you still owe.

import { el, pageHead } from './ui.js';
import {
  WEEKS, PRESET_OPTIONS, presetRows, completedKeys, cellKey, missingSessions, progressSummary, clampWeek,
} from './lib/progress.js';

function presetPicker(name, handlers) {
  return [
    el('p', { text: 'מה יש בקורס הזה בכל שבוע?' }),
    el('div', { class: 'preset-list' }, PRESET_OPTIONS.map((option) => el('button', {
      class: 'btn', type: 'button', text: option.title, onclick: () => handlers.onPreset(name, option.key),
    }))),
  ];
}

function weekStepper(name, currentWeek, handlers) {
  return el('div', { class: 'week-stepper' }, [
    document.createTextNode('אנחנו בשבוע'),
    el('button', {
      class: 'icon-btn', type: 'button', text: '−', 'aria-label': 'שבוע קודם', disabled: currentWeek <= 1,
      onclick: () => handlers.onWeek(name, clampWeek(currentWeek - 1)),
    }),
    el('output', { text: String(currentWeek) }),
    el('button', {
      class: 'icon-btn', type: 'button', text: '+', 'aria-label': 'שבוע הבא', disabled: currentWeek >= WEEKS,
      onclick: () => handlers.onWeek(name, clampWeek(currentWeek + 1)),
    }),
  ]);
}

function sessionGrid(course, done, currentWeek, handlers) {
  return el('div', { class: 'grid-scroll' }, presetRows(course.tracker_preset).map((row) => el('div', { class: 'session-row' }, [
    el('span', { class: 'session-label', text: row.label }),
    ...Array.from({ length: WEEKS }, (_unused, i) => {
      const week = i + 1;
      const isDone = done.has(cellKey(row.type, row.index, week));
      return el('button', {
        class: 'cell',
        type: 'button',
        text: String(week),
        'aria-pressed': String(isDone),
        'aria-label': `${row.label}, שבוע ${week}${isDone ? ', בוצע' : ''}`,
        'data-missing': !isDone && week <= currentWeek ? 'true' : null,
        onclick: () => handlers.onToggle(course, row, week, !isDone),
      });
    }),
  ])));
}

function missingLine(missing) {
  if (missing.length === 0) return el('p', { class: 'missing', text: 'אין מה להשלים. הכול מעודכן.' });
  const list = missing.map((m) => `${m.label} ${m.week}`).join(', ');
  return el('p', { class: 'missing' }, [
    el('strong', { text: `להשלים (${missing.length}): ` }),
    document.createTextNode(list),
  ]);
}

function trackedCourse(course, cells, handlers) {
  const name = course.course_name;
  const currentWeek = clampWeek(course.tracker_current_week);
  const done = completedKeys(cells, course.id);
  const summary = progressSummary(course.tracker_preset, done, currentWeek);
  const missing = missingSessions(course.tracker_preset, done, currentWeek);
  const behind = missing.length > 0 ? 'true' : null;

  return [
    el('div', { class: 'course-head' }, [
      el('h2', { text: name }),
      el('span', { class: 'percent', 'data-behind': behind, text: `${summary.percent}%` }),
    ]),
    el('div', { class: 'bar', role: 'presentation' }, [
      el('div', { class: 'bar-fill', 'data-behind': behind, style: `width: ${summary.percent}%` }),
    ]),
    el('p', { text: `${summary.done} מתוך ${summary.expected} עד שבוע ${currentWeek}` }),
    missingLine(missing),
    weekStepper(name, currentWeek, handlers),
    sessionGrid(course, done, currentWeek, handlers),
    el('button', { class: 'link-btn', type: 'button', text: 'שנה את מבנה הקורס', onclick: () => handlers.onPreset(name, null) }),
  ];
}

/**
 * @param {object} input
 * @param {{ name: string, course: object|null }[]} input.courses course names with their saved settings, if any
 * @param {object[]} input.cells every tracker cell
 */
export function progressScreen({ courses, cells, handlers }) {
  const nameInput = el('input', { type: 'text', name: 'course', placeholder: 'שם הקורס', 'aria-label': 'שם קורס חדש', maxlength: '120' });

  const panels = courses.map(({ name, course }) => el('section', { class: 'panel' },
    course && course.tracker_preset
      ? trackedCourse(course, cells, handlers)
      : [el('h2', { text: name }), ...presetPicker(name, handlers)]));

  return [
    pageHead('התקדמות', [document.createTextNode('מה ראיתי ומה חסר')]),
    ...(panels.length ? panels : [el('div', { class: 'empty', text: 'עוד אין קורסים. הוסף קורס למטה.' })]),
    el('section', { class: 'panel' }, [
      el('h2', { text: 'קורס נוסף' }),
      el('p', { text: 'קורס שלא מופיע ברשימה? הוסף אותו לפי שם.' }),
      el('form', {
        class: 'inline-form',
        onsubmit: (event) => {
          event.preventDefault();
          const name = nameInput.value.trim();
          if (name) handlers.onAddCourse(name);
        },
      }, [nameInput, el('button', { class: 'btn', type: 'submit', text: 'הוסף' })]),
    ]),
  ];
}
