// Course progress: which weekly lectures and practice sessions are done,
// and which are still missing. Uses the same presets and week count as the
// Chrome extension's weekly tracker, so both show the same data.

export const WEEKS = 13;

const LECTURE = 'lecture';
const TIRGUL = 'tirgul';
const LABELS = { [LECTURE]: 'הרצאה', [TIRGUL]: 'תרגול' };

// lectures / practice sessions per week
const PRESET_SHAPES = {
  '1L_1T': { title: 'הרצאה + תרגול', lectures: 1, tirguls: 1 },
  '1L_2T': { title: 'הרצאה + 2 תרגולים', lectures: 1, tirguls: 2 },
  '2L_1T': { title: '2 הרצאות + תרגול', lectures: 2, tirguls: 1 },
  '2L_2T': { title: '2 הרצאות + 2 תרגולים', lectures: 2, tirguls: 2 },
  '1L': { title: 'הרצאה בלבד', lectures: 1, tirguls: 0 },
};

export const PRESET_OPTIONS = Object.entries(PRESET_SHAPES).map(([key, shape]) => ({ key, title: shape.title }));

function rowsOfType(type, count) {
  return Array.from({ length: count }, (_unused, i) => ({
    type,
    index: i + 1,
    label: count > 1 ? `${LABELS[type]} ${i + 1}` : LABELS[type],
  }));
}

/** @returns {{ type: string, index: number, label: string }[]} weekly sessions of a preset */
export function presetRows(presetKey) {
  const shape = PRESET_SHAPES[presetKey];
  if (!shape) return [];
  return [...rowsOfType(LECTURE, shape.lectures), ...rowsOfType(TIRGUL, shape.tirguls)];
}

export function cellKey(type, index, week) {
  return `${type}:${index}:${week}`;
}

/** @returns {Set<string>} keys of the sessions marked done for one course */
export function completedKeys(cells, userCourseId) {
  return new Set(cells
    .filter((cell) => cell.user_course_id === userCourseId && cell.completed && !cell.deleted_at)
    .map((cell) => cellKey(cell.row_type, cell.row_index, cell.week)));
}

export function clampWeek(week) {
  return Math.min(WEEKS, Math.max(1, Math.round(Number(week) || 1)));
}

/**
 * Sessions up to and including the current week that are not marked done.
 * @returns {{ type: string, index: number, label: string, week: number }[]}
 */
export function missingSessions(presetKey, done, currentWeek) {
  const missing = [];
  for (const row of presetRows(presetKey)) {
    for (let week = 1; week <= Math.min(currentWeek, WEEKS); week++) {
      if (!done.has(cellKey(row.type, row.index, week))) missing.push({ ...row, week });
    }
  }
  return missing;
}

/** @returns {{ done: number, expected: number, total: number, percent: number }} */
export function progressSummary(presetKey, done, currentWeek) {
  const rows = presetRows(presetKey);
  const weeksSoFar = Math.min(Math.max(currentWeek, 0), WEEKS);
  const expected = rows.length * weeksSoFar;
  const doneSoFar = expected - missingSessions(presetKey, done, weeksSoFar).length;
  return {
    done: doneSoFar,
    expected,
    total: rows.length * WEEKS,
    percent: expected === 0 ? 0 : Math.round((doneSoFar / expected) * 100),
  };
}
