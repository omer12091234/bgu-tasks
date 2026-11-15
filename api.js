// Sign-in and data access for the phone app, straight over Supabase's REST
// API (no SDK, so the app stays tiny and loads fast on mobile data).

import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

const SESSION_KEY = 'bgu-tasks.session';
const REFRESH_MARGIN_MS = 60 * 1000;

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

function readSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
  } catch (_err) {
    return null;
  }
}

function writeSession(session) {
  if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else localStorage.removeItem(SESSION_KEY);
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

export function currentSession() {
  return readSession();
}

export async function signIn(email, password) {
  const body = await request('/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: { email: String(email).trim(), password },
  });
  const session = toSession(body);
  writeSession(session);
  return session;
}

export function signOut() {
  writeSession(null);
}

// A valid access token, refreshed when it is about to expire. Throws an
// ApiError with status 401 when the user has to sign in again.
async function accessToken() {
  const session = readSession();
  if (!session) throw new ApiError('לא מחובר', 401);
  if (session.expiresAt - Date.now() > REFRESH_MARGIN_MS) return session.accessToken;

  try {
    const body = await request('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      body: { refresh_token: session.refreshToken },
    });
    const next = toSession(body);
    writeSession(next);
    return next.accessToken;
  } catch (err) {
    if (err.status === 0) throw err; // offline: keep the session, try later
    writeSession(null);
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
