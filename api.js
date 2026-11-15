// Sign-in and data access, straight over Supabase's REST API (no SDK, so
// the app stays tiny and loads fast on mobile data). Used by the phone app
// and by the Chrome extension (popup and background worker).

import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { createSessionStore } from './session-store.js';

const REFRESH_MARGIN_MS = 60 * 1000;
const sessionStore = createSessionStore();
let session = null; // in-memory copy, filled by init()

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** Load the saved session. Call once at start, before currentSession(). */
export async function init() {
  session = await sessionStore.load();
  return session;
}

async function writeSession(next) {
  session = next;
  await sessionStore.save(next);
}

function toSession(body) {
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: Date.now() + Number(body.expires_in || 0) * 1000,
    userId: body.user && body.user.id,
    email: body.user && body.user.email,
  };
}

async function request(path, { method = 'GET', token = null, body = null, headers = {} } = {}) {
  let response;
  try {
    response = await fetch(`${SUPABASE_URL}${path}`, {
      method,
      headers: {
        apikey: SUPABASE_KEY,
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (_err) {
    throw new ApiError('אין חיבור לרשת', 0);
  }
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const detail = (data && (data.msg || data.message || data.error_description)) || `HTTP ${response.status}`;
    throw new ApiError(detail, response.status);
  }
  return data;
}

/** The session loaded by init() or set by signIn(); null when signed out. */
export function currentSession() {
  return session;
}

export async function signIn(email, password) {
  const body = await request('/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: { email: String(email).trim(), password },
  });
  await writeSession(toSession(body));
  return session;
}

export async function signOut() {
  await writeSession(null);
}

// A valid access token, refreshed when it is about to expire. Throws an
// ApiError with status 401 when the user has to sign in again.
async function accessToken() {
  // Re-read first: another part of the app (the extension's background
  // worker, another tab) may have refreshed the session since we loaded it.
  session = await sessionStore.load();
  if (!session) throw new ApiError('לא מחובר', 401);
  if (session.expiresAt - Date.now() > REFRESH_MARGIN_MS) return session.accessToken;

  try {
    const body = await request('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      body: { refresh_token: session.refreshToken },
    });
    await writeSession(toSession(body));
    return session.accessToken;
  } catch (err) {
    if (err.status === 0) throw err; // offline: keep the session, try later
    await writeSession(null);
    throw new ApiError('פג תוקף ההתחברות', 401);
  }
}

/** Every row of a table that belongs to the signed-in user (Row Level Security). */
export async function selectAll(table, filter = '') {
  const token = await accessToken();
  return request(`/rest/v1/${table}?select=*${filter ? `&${filter}` : ''}`, { token });
}

/** Insert a row, or replace the row that has the same value in `conflictColumn`. */
export async function upsert(table, row, conflictColumn = 'id') {
  const token = await accessToken();
  await request(`/rest/v1/${table}?on_conflict=${conflictColumn}`, {
    method: 'POST',
    token,
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: row,
  });
}

/** Change some fields of one row. */
export async function patch(table, id, fields) {
  const token = await accessToken();
  await request(`/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    token,
    headers: { Prefer: 'return=minimal' },
    body: fields,
  });
}

/** Delete the rows matching a PostgREST filter such as `endpoint=eq.<value>`. */
export async function remove(table, filter) {
  const token = await accessToken();
  await request(`/rest/v1/${table}?${filter}`, { method: 'DELETE', token, headers: { Prefer: 'return=minimal' } });
}
