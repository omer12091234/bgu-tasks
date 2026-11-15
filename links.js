// Quick links: a fixed set of university sites plus links the user adds.
// The added ones are kept on this device (browser storage), not on the server.

const STORAGE_KEY = 'bgu-tasks.links';
const MAX_NAME_LENGTH = 30;
export const MAX_CUSTOM_LINKS = 12;

export const DEFAULT_LINKS = [
  { name: 'מודל', url: 'https://moodle.bgu.ac.il/moodle/my/' },
  { name: 'פורטל', url: 'https://portal.bgu.ac.il/public/login' },
  { name: 'גזר', url: 'https://gezer1.bgu.ac.il/meser/main.php' },
  { name: 'מנהל תלמידים', url: 'https://bgu4u22.bgu.ac.il/apex/10g/r/f_login1004/login_desktop?p_lang=he' },
  { name: 'הרשמה לקורסים', url: 'https://bgu4u.bgu.ac.il/pls/scwp/!app.gate?app=cns' },
];

/**
 * Check and tidy a link typed by the user. An address without "https://"
 * gets it added. Only web addresses are accepted.
 * @returns {{ link: { name: string, url: string } }|{ error: string }}
 */
export function normalizeLink({ name, url }) {
  const cleanName = String(name || '').trim().slice(0, MAX_NAME_LENGTH);
  const typed = String(url || '').trim();
  if (!cleanName) return { error: 'צריך שם לקישור.' };
  if (!typed) return { error: 'צריך כתובת לקישור.' };
  let parsed;
  try {
    parsed = new URL(/^[a-z][a-z0-9+.-]*:/i.test(typed) ? typed : `https://${typed}`);
  } catch (_err) {
    return { error: 'הכתובת לא תקינה.' };
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return { error: 'אפשר להוסיף רק כתובות אתרים (https).' };
  if (!parsed.hostname.includes('.')) return { error: 'הכתובת לא תקינה.' };
  return { link: { name: cleanName, url: parsed.href } };
}

/** Add a link to the list; a link with the same address replaces the old one. */
export function addLink(links, link) {
  return [...links.filter((other) => other.url !== link.url), link].slice(-MAX_CUSTOM_LINKS);
}

export function removeLink(links, url) {
  return links.filter((link) => link.url !== url);
}

/** The saved custom links; anything unreadable or malformed is dropped. */
export function readCustomLinks(storage = globalThis.localStorage) {
  try {
    const saved = JSON.parse(storage.getItem(STORAGE_KEY) || '[]');
    if (!Array.isArray(saved)) return [];
    return saved.map((item) => normalizeLink(item || {})).filter((result) => result.link).map((result) => result.link);
  } catch (_err) {
    return [];
  }
}

export function saveCustomLinks(links, storage = globalThis.localStorage) {
  storage.setItem(STORAGE_KEY, JSON.stringify(links));
}
