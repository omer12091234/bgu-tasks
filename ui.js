// Screen builders. Every function takes plain data + callbacks and returns
// DOM nodes; none of them touches the network or storage.

import { dueTime, countdown, formatDue, dayKey } from './lib/time.js';
import { courseName, groupByDay, isManual } from './lib/tasks.js';
import { monthGrid } from './lib/calendar.js';

const WEEKDAYS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];
const monthFormatter = new Intl.DateTimeFormat('he-IL', { month: 'long', year: 'numeric' });
const todayFormatter = new Intl.DateTimeFormat('he-IL', { weekday: 'long', day: 'numeric', month: 'long' });
const dayTitleFormatter = new Intl.DateTimeFormat('he-IL', { weekday: 'long', day: 'numeric', month: 'long' });
const historyFormatter = new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'long' });
const HISTORY_REASONS = { manual: 'סומנה כבוצעה', submitted: 'הוגשה במודל', removed: 'ירדה מהמודל' };
const GENERAL_COURSE = '';

/** Small DOM helper. Text always goes through textContent, never innerHTML. */
export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === 'text') node.textContent = value;
    else if (key === 'class') node.className = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of [].concat(children)) {
    if (child) node.append(child);
  }
  return node;
}

export function pageHead(eyebrow, titleNodes) {
  return el('header', { class: 'page-head' }, [
    el('p', { class: 'eyebrow', text: eyebrow }),
    el('h1', { class: 'page-title' }, titleNodes),
  ]);
}

function taskCard(row, now, handlers) {
  const due = dueTime(row);
  const { text, level } = countdown(due, now);
  const meta = [courseName(row), formatDue(due)].filter(Boolean).join(' · ');

  return el('li', { class: 'task', 'data-level': level }, [
    el('p', { class: 'task-countdown', text }),
    isManual(row) && el('span', { class: 'tag', text: 'אישית' }),
    el('h2', { class: 'task-name', text: row.name || 'ללא שם' }),
    el('p', { class: 'task-meta', text: meta }),
    el('div', { class: 'task-actions' }, [
      el('button', { class: 'btn btn-done', type: 'button', text: '✓ בוצע', onclick: () => handlers.onDone(row) }),
      due != null && el('button', {
        class: 'btn', type: 'button', text: 'ליומן', 'aria-label': 'הוסף ליומן', onclick: () => handlers.onCalendar(row),
      }),
      row.link && el('a', { class: 'btn', href: row.link, target: '_blank', rel: 'noopener', text: 'פתח' }),
      el('button', {
        class: 'btn btn-danger', type: 'button', text: 'מחק', 'aria-label': `מחק את ${row.name}`, onclick: () => handlers.onDelete(row),
      }),
    ]),
  ]);
}

function historyCard(item, handlers) {
  const { row, reason, at } = item;
  const meta = [courseName(row), HISTORY_REASONS[reason], at ? historyFormatter.format(new Date(at)) : '']
    .filter(Boolean).join(' · ');

  return el('li', { class: 'task task-finished' }, [
    el('h2', { class: 'task-name', text: row.name || 'ללא שם' }),
    el('p', { class: 'task-meta', text: meta }),
    reason === 'manual' && el('div', { class: 'task-actions' }, [
      el('button', { class: 'btn', type: 'button', text: 'החזר לרשימה', onclick: () => handlers.onRestore(row) }),
    ]),
  ]);
}

function segment(mode, onMode, counts) {
  const option = (id, label) => el('button', {
    class: 'segment-btn', type: 'button', 'aria-pressed': String(mode === id), text: label, onclick: () => onMode(id),
  });
  return el('div', { class: 'segment', role: 'group', 'aria-label': 'תצוגה' }, [
    option('open', `פתוחות (${counts.open})`),
    option('history', `היסטוריה (${counts.history})`),
  ]);
}

function taskList(tasks, now, handlers) {
  return el('ul', { class: 'task-list' }, tasks.map((row) => taskCard(row, now, handlers)));
}

export function tasksScreen({ tasks, history, mode, now, notice, handlers }) {
  const title = tasks.length === 0
    ? [document.createTextNode('אין מטלות פתוחות')]
    : [el('span', { class: 'count', text: String(tasks.length) }), document.createTextNode(tasks.length === 1 ? ' מטלה פתוחה' : ' מטלות פתוחות')];

  const openList = tasks.length === 0
    ? el('div', { class: 'empty' }, [el('strong', { text: 'הכול הוגש' }), document.createTextNode('מטלות חדשות יופיעו כאן תוך שעה מרגע שהן עולות למודל.')])
    : taskList(tasks, now, handlers);
  const historyList = history.length === 0
    ? el('div', { class: 'empty', text: 'עוד אין מטלות שהושלמו.' })
    : el('ul', { class: 'task-list' }, history.map((item) => historyCard(item, handlers)));

  return [
    pageHead(todayFormatter.format(new Date(now)), title),
    notice && el('p', { class: 'banner', text: notice }),
    el('div', { class: 'toolbar' }, [
      segment(mode, handlers.onMode, { open: tasks.length, history: history.length }),
      el('button', { class: 'btn btn-add', type: 'button', text: '+ משימה', onclick: handlers.onAdd }),
    ]),
    mode === 'history' ? historyList : openList,
  ];
}

/**
 * "New task" dialog. Course is optional: the first option means a general
 * task that belongs to no course.
 */
export function taskDialog({ courses, onSubmit }) {
  const title = el('input', { type: 'text', name: 'title', required: true, maxlength: '200', autocomplete: 'off' });
  const course = el('select', { name: 'course' }, [
    el('option', { value: GENERAL_COURSE, text: 'כללי (בלי קורס)' }),
    ...courses.map((name) => el('option', { value: name, text: name })),
  ]);
  const due = el('input', { type: 'datetime-local', name: 'due' });
  const dialog = el('dialog', { class: 'sheet', 'aria-label': 'משימה חדשה' });
  // Close and remove in one step: relying on the dialog's own "close" event
  // to clean up left stale dialogs behind in some browsers.
  const dismiss = () => {
    if (dialog.open) dialog.close();
    dialog.remove();
  };

  dialog.append(el('form', {
    class: 'sheet-form',
    onsubmit: (event) => {
      event.preventDefault();
      if (!title.value.trim()) return;
      onSubmit({
        title: title.value,
        course_name: course.value || null,
        deadline: due.value ? new Date(due.value).toISOString() : null,
      });
      dismiss();
    },
  }, [
    el('h2', { class: 'sheet-title', text: 'משימה חדשה' }),
    el('label', { class: 'field field-rtl' }, [document.createTextNode('מה צריך לעשות'), title]),
    el('label', { class: 'field field-rtl' }, [document.createTextNode('קורס'), course]),
    el('label', { class: 'field field-rtl' }, [document.createTextNode('מועד (לא חובה)'), due]),
    el('div', { class: 'task-actions' }, [
      el('button', { class: 'btn btn-primary', type: 'submit', text: 'הוסף' }),
      el('button', { class: 'btn', type: 'button', text: 'ביטול', onclick: dismiss }),
    ]),
  ]));
  dialog.addEventListener('cancel', dismiss); // Esc / back gesture
  return dialog;
}

export function calendarScreen({ tasks, now, view, handlers }) {
  const groups = groupByDay(tasks);
  const todayKey = dayKey(new Date(now));
  const selected = groups.get(view.selectedKey) || [];
  const [year, month, day] = view.selectedKey.split('-').map(Number);

  const cells = monthGrid(view.year, view.month).map((cell) => el('button', {
    class: 'cal-day',
    type: 'button',
    text: String(cell.day),
    'data-outside': cell.inMonth ? null : 'true',
    'data-today': cell.key === todayKey ? 'true' : null,
    'data-count': groups.has(cell.key) ? String(groups.get(cell.key).length) : null,
    'aria-pressed': String(cell.key === view.selectedKey),
    onclick: () => handlers.onSelectDay(cell.key),
  }));

  return [
    pageHead('לוח שנה', [document.createTextNode('מה מגיע')]),
    el('div', { class: 'cal-nav' }, [
      el('button', { class: 'icon-btn', type: 'button', text: '›', 'aria-label': 'החודש הקודם', onclick: () => handlers.onShiftMonth(-1) }),
      el('h2', { class: 'cal-month', text: monthFormatter.format(new Date(view.year, view.month, 1)) }),
      el('button', { class: 'icon-btn', type: 'button', text: '‹', 'aria-label': 'החודש הבא', onclick: () => handlers.onShiftMonth(1) }),
    ]),
    el('div', { class: 'cal-grid' }, [
      ...WEEKDAYS.map((name) => el('div', { class: 'cal-weekday', text: name })),
      ...cells,
    ]),
    el('h3', { class: 'section-title', text: dayTitleFormatter.format(new Date(year, month - 1, day)) }),
    selected.length === 0
      ? el('div', { class: 'empty', text: 'אין הגשות ביום הזה.' })
      : taskList(selected, now, handlers),
  ];
}

const PUSH_MESSAGES = {
  'needs-install': 'באייפון התראות עובדות רק מהאפליקציה שבמסך הבית: ב-Safari ללחוץ על שיתוף, "הוסף למסך הבית", ולפתוח משם.',
  denied: 'ההתראות חסומות בהגדרות המכשיר. אפשר לאפשר אותן שם ולחזור לכאן.',
  unsupported: 'הדפדפן הזה לא תומך בהתראות.',
  demo: 'לא זמין במצב הדגמה.',
};

function pushPanel(push, handlers) {
  const blocked = PUSH_MESSAGES[push.support];
  const status = blocked || (push.enabled
    ? 'פעיל במכשיר הזה: יום לפני הגשה, סיכום בוקר, וכשעולה מטלה חדשה.'
    : 'כבוי במכשיר הזה.');
  return el('section', { class: 'panel' }, [
    el('h2', { text: 'התראות' }),
    el('p', { text: status }),
    push.error && el('p', { class: 'error', role: 'alert', text: push.error }),
    !blocked && el('button', {
      class: push.enabled ? 'btn' : 'btn btn-primary',
      type: 'button',
      disabled: push.busy,
      text: push.busy ? 'רגע…' : (push.enabled ? 'כבה התראות' : 'הפעל התראות'),
      onclick: () => handlers.onTogglePush(!push.enabled),
    }),
  ]);
}

export function settingsScreen({ courses, hiddenCourses, email, lastUpdated, demo, push, handlers }) {
  const hidden = new Set(hiddenCourses);
  const courseRows = courses.map((name) => el('label', { class: 'course-row' }, [
    el('input', {
      type: 'checkbox',
      checked: !hidden.has(name),
      onchange: (event) => handlers.onToggleCourse(name, event.target.checked),
    }),
    el('span', { text: name }),
  ]));

  return [
    pageHead('הגדרות', [document.createTextNode('מה להציג')]),
    pushPanel(push, handlers),
    el('section', { class: 'panel' }, [
      el('h2', { text: 'קורסים' }),
      el('p', { text: 'בטל סימון כדי להסתיר קורס: המטלות שלו לא יופיעו ברשימה, בלוח השנה או בהתראות.' }),
      ...(courseRows.length ? courseRows : [el('p', { text: 'עדיין אין קורסים עם מטלות.' })]),
    ]),
    el('section', { class: 'panel' }, [
      el('h2', { text: 'נתונים' }),
      el('p', { text: lastUpdated ? `עודכן לאחרונה: ${lastUpdated}` : 'עוד לא נטענו נתונים.' }),
      el('button', { class: 'btn', type: 'button', text: 'רענן עכשיו', onclick: handlers.onRefresh }),
    ]),
    el('section', { class: 'panel' }, [
      el('h2', { text: 'חשבון' }),
      el('p', { text: demo ? 'מצב הדגמה: הנתונים מומצאים ושום דבר לא נשמר.' : `מחובר כ-${email || ''}` }),
      !demo && el('button', { class: 'btn', type: 'button', text: 'התנתק', onclick: handlers.onSignOut }),
    ]),
  ];
}

export function loginScreen({ error, busy, onSubmit }) {
  const email = el('input', { type: 'email', name: 'email', autocomplete: 'username', inputmode: 'email', required: true });
  const password = el('input', { type: 'password', name: 'password', autocomplete: 'current-password', required: true });

  return [
    el('form', {
      class: 'login',
      onsubmit: (event) => {
        event.preventDefault();
        onSubmit(email.value, password.value);
      },
    }, [
      pageHead('מטלות BGU', [document.createTextNode('התחברות')]),
      el('label', { class: 'field' }, [document.createTextNode('אימייל'), email]),
      el('label', { class: 'field' }, [document.createTextNode('סיסמה'), password]),
      error && el('p', { class: 'error', role: 'alert', text: error }),
      el('button', { class: 'btn btn-primary', type: 'submit', disabled: busy, text: busy ? 'מתחבר…' : 'התחבר' }),
    ]),
  ];
}

const TABS = [
  { id: 'tasks', label: 'מטלות', glyph: '☰' },
  { id: 'calendar', label: 'לוח שנה', glyph: '▦' },
  { id: 'progress', label: 'התקדמות', glyph: '◔' },
  { id: 'settings', label: 'הגדרות', glyph: '⚙' },
];

export function tabBar(current, onSelect) {
  return TABS.map((tab) => el('button', {
    class: 'tab',
    type: 'button',
    'aria-current': tab.id === current ? 'page' : null,
    onclick: () => onSelect(tab.id),
  }, [el('span', { class: 'tab-glyph', 'aria-hidden': 'true', text: tab.glyph }), document.createTextNode(tab.label)]));
}
