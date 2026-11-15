// Made-up tasks for trying the app without signing in: open the page with
// ?demo=1. Nothing is read from or written to the server in demo mode.

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function task(id, name, course, offsetMs, kind = 'מועד הגשת מטלה') {
  return {
    id: `demo-${id}`,
    name,
    description: `${kind} · ${course}`,
    link: 'https://moodle.bgu.ac.il/moodle/my/',
    due_at: new Date(Date.now() + offsetMs).toISOString(),
    is_hidden: false,
    manual_done: false,
    moodle_status: 'new',
    deleted_at: null,
  };
}

export function demoRows() {
  return [
    task(1, 'תרגיל בית 4 – עצים מאוזנים', 'מבני נתונים', -5 * HOUR),
    task(2, 'בוחן אמצע 2', 'אלגברה לינארית 2', 6 * HOUR, 'בוחן או פעילות'),
    task(3, 'דוח מעבדה 3', 'מעבדה בפיזיקה 1', 31 * HOUR),
    task(4, 'עבודה 2 – תכנון דינמי', 'אלגוריתמים', 2.6 * DAY),
    task(5, 'Reading response 5', 'אנגלית מתקדמים ב', 4 * DAY),
    task(6, 'תרגיל 6 – טורים', 'חדו"א 2', 6 * DAY),
    task(7, 'פרויקט אמצע – שלב א', 'מבני נתונים', 13 * DAY),
  ];
}
