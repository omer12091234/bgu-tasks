// "Statistics" screen: study time, watched videos and how early things get
// done. The numbers come from lib/stats.js; this file only draws them.

import { el, pageHead } from './ui.js';
import {
  weekTotals, streak, heatmap, secondsByCourse, videoSummary, taskCompletion, deadlineScore, formatDuration,
} from './lib/stats.js';

const QUICK_LINKS = [
  { label: 'מודל', url: 'https://moodle.bgu.ac.il/moodle/my/' },
  { label: 'פורטל', url: 'https://portal.bgu.ac.il/public/login' },
  { label: 'גזר', url: 'https://gezer1.bgu.ac.il/meser/main.php' },
  { label: 'מנהל תלמידים', url: 'https://bgu4u22.bgu.ac.il/apex/10g/r/f_login1004/login_desktop?p_lang=he' },
  { label: 'הרשמה לקורסים', url: 'https://bgu4u.bgu.ac.il/pls/scwp/!app.gate?app=cns' },
];
const DAY_LETTERS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];
const MAX_UNFINISHED = 5;
const MAX_COURSES = 8;

function statCard(label, value, note) {
  return el('div', { class: 'stat-card' }, [
    el('p', { class: 'stat-label', text: label }),
    el('p', { class: 'stat-value', text: value }),
    note && el('p', { class: 'stat-note', text: note }),
  ]);
}

function weekNote({ thisWeek, lastWeek }) {
  if (!lastWeek) return null;
  const difference = thisWeek - lastWeek;
  if (Math.abs(difference) < 60) return 'כמו בשבוע שעבר';
  return `${formatDuration(Math.abs(difference))} ${difference > 0 ? 'יותר' : 'פחות'} מהשבוע שעבר`;
}

function deadlineNote(result) {
  const hours = Math.round(Math.abs(result.averageHours));
  return result.averageHours >= 0 ? `בממוצע ${hours} שעות לפני המועד` : `בממוצע ${hours} שעות אחרי המועד`;
}

function heatmapPanel(weeks) {
  return el('section', { class: 'panel' }, [
    el('h2', { text: 'מפת פעילות' }),
    el('p', { text: '13 השבועות האחרונים. ככל שהמשבצת כהה יותר, למדת יותר באותו יום.' }),
    el('div', { class: 'heatmap', role: 'img', 'aria-label': 'מפת זמן למידה לפי ימים' }, [
      el('div', { class: 'heatmap-days', 'aria-hidden': 'true' }, DAY_LETTERS.map((letter) => el('span', { text: letter }))),
      ...weeks.map((week) => el('div', { class: 'heatmap-week' }, week.map((day) => el('span', {
        class: 'heatmap-cell',
        'data-level': day.future ? 'future' : String(day.level),
        title: `${day.key}: ${formatDuration(day.seconds)}`,
      })))),
    ]),
  ]);
}

function coursePanel(courses) {
  const top = courses.slice(0, MAX_COURSES);
  const most = top.length ? top[0].seconds : 0;
  return el('section', { class: 'panel' }, [
    el('h2', { text: 'זמן למידה לפי קורס' }),
    top.length
      ? el('ul', { class: 'bar-list' }, top.map((item) => el('li', {}, [
        el('span', { class: 'bar-name', text: item.course }),
        el('span', { class: 'bar-track' }, [el('span', { class: 'bar-fill', style: `inline-size: ${Math.round((item.seconds / most) * 100)}%` })]),
        el('span', { class: 'bar-value', text: formatDuration(item.seconds) }),
      ])))
      : el('p', { text: 'עוד לא נמדד זמן למידה. הוא נמדד בזמן שהמודל פתוח בכרום, עם התוסף.' }),
  ]);
}

function videoPanel(videos) {
  const shown = videos.unfinished.slice(0, MAX_UNFINISHED);
  const more = videos.unfinished.length - shown.length;
  return el('section', { class: 'panel' }, [
    el('h2', { text: 'סרטונים שלא סיימתי' }),
    shown.length
      ? el('ul', { class: 'link-list' }, shown.map((row) => {
        const percent = row.duration > 0 ? Math.min(100, Math.round((row.seconds / row.duration) * 100)) : null;
        const meta = [row.course_name, percent == null ? null : `ראיתי ${percent}%`].filter(Boolean).join(' · ');
        return el('li', {}, [
          el('a', { href: row.link, target: '_blank', rel: 'noopener', text: row.title || 'סרטון' }),
          meta && el('span', { class: 'link-meta', text: meta }),
        ]);
      }))
      : el('p', { text: 'אין סרטונים שהתחלת ולא סיימת.' }),
    more > 0 && el('p', { text: `ועוד ${more}.` }),
  ]);
}

function linksPanel() {
  return el('section', { class: 'panel' }, [
    el('h2', { text: 'קישורים מהירים' }),
    el('div', { class: 'quick-links' }, QUICK_LINKS.map((link) => el('a', {
      class: 'btn', href: link.url, target: '_blank', rel: 'noopener', text: link.label,
    }))),
  ]);
}

/**
 * @param {{ study: object[], watched: object[], times: object[], tasks: object[], submissions: object[], now: number }} input
 */
export function statsScreen({ study, watched, times, tasks, submissions, now }) {
  const week = weekTotals(study, now);
  const videos = videoSummary(watched, times);
  const completion = taskCompletion(tasks);
  const deadlines = deadlineScore(tasks, submissions);
  const days = streak(study, now);

  return [
    pageHead('נתונים', [document.createTextNode('איך הולך לי')]),
    el('div', { class: 'stat-grid' }, [
      statCard('למידה השבוע', formatDuration(week.thisWeek), weekNote(week)),
      statCard('ימים ברצף', String(days), days ? 'ימים רצופים עם זמן למידה' : 'עוד אין רצף'),
      statCard('סרטונים שנצפו', String(videos.watchedCount), videos.unfinished.length ? `${videos.unfinished.length} התחלתי ולא סיימתי` : null),
      statCard('משימות שהושלמו', completion == null ? '—' : `${completion}%`, completion == null ? 'עוד אין משימות ידניות' : 'מהמשימות הידניות'),
      statCard('ציון עמידה במועדים', deadlines ? String(deadlines.score) : '—', deadlines ? deadlineNote(deadlines) : 'יחושב אחרי שתסמן מטלות כבוצעו'),
    ]),
    heatmapPanel(heatmap(study, now)),
    coursePanel(secondsByCourse(study)),
    videoPanel(videos),
    linksPanel(),
  ];
}
