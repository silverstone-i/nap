/**
 * @file Fetch wrapper with cookie credentials and /api prefix
 * @module nap-client/services/client
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

const BASE = '/api';

async function request(method, path, body, opts = {}) {
  const url = `${BASE}${path}`;
  const headers = { ...(opts.headers || {}) };

  if (body && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(url, {
    method,
    credentials: 'include',
    headers,
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
    ...opts,
  });

  if (!res.ok) {
    let payload;
    try {
      payload = await res.json();
    } catch {
      payload = { error: res.statusText };
    }
    const err = new Error(payload.error || payload.message || `Request failed (${res.status})`);
    err.status = res.status;
    err.payload = payload;
    throw err;
  }

  if (res.status === 204) return null;
  return res.json();
}

export const client = {
  get: (path, opts) => request('GET', path, null, opts),
  post: (path, body, opts) => request('POST', path, body, opts),
  put: (path, body, opts) => request('PUT', path, body, opts),
  patch: (path, body, opts) => request('PATCH', path, body, opts),
  del: (path, body, opts) => request('DELETE', path, body, opts),
};

export default client;
