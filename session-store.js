// Where the sign-in session is kept. In a normal browser tab (the phone app)
// that is the page's own storage. Inside the Chrome extension it is the
// extension's storage instead, because there the popup and the background
// worker must share one session: each refresh replaces the previous token,
// so two separate copies would sign each other out.

const SESSION_KEY = 'bgu-tasks.session';

function chromeStorageStore(area) {
  return {
    load: () => new Promise((resolve) => {
      area.get(SESSION_KEY, (items) => resolve((items && items[SESSION_KEY]) || null));
    }),
    save: (session) => new Promise((resolve) => {
      if (session) area.set({ [SESSION_KEY]: session }, resolve);
      else area.remove(SESSION_KEY, resolve);
    }),
  };
}

function pageStorageStore(storage) {
  return {
    async load() {
      try {
        return JSON.parse(storage.getItem(SESSION_KEY) || 'null');
      } catch (_err) {
        return null; // unreadable session: treat as signed out
      }
    },
    async save(session) {
      if (session) storage.setItem(SESSION_KEY, JSON.stringify(session));
      else storage.removeItem(SESSION_KEY);
    },
  };
}

/**
 * @param {object} [env] the global object (overridable for tests)
 * @returns {{ load: () => Promise<object|null>, save: (session: object|null) => Promise<void> }}
 */
export function createSessionStore(env = globalThis) {
  const extensionStorage = env.chrome && env.chrome.storage && env.chrome.storage.local;
  if (extensionStorage) return chromeStorageStore(extensionStorage);
  if (env.localStorage) return pageStorageStore(env.localStorage);
  // No storage at all (tests, unusual browsers): keep the session in memory.
  let memory = null;
  return { load: async () => memory, save: async (session) => { memory = session; } };
}

/** True when this code runs inside the Chrome extension rather than the web app. */
export function isExtension(env = globalThis) {
  return !!(env.location && env.location.protocol === 'chrome-extension:');
}
