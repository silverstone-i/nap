/**
 * @file Fetch wrapper with cookie credentials, /api prefix, and silent token refresh
 * @module nap-client/services/client
 *
 * On 401, automatically attempts a single token refresh via /auth/refresh
 * then retries the original request. Concurrent 401s share the same refresh
 * promise to avoid duplicate refresh calls.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

const BASE = '/api';

let refreshPromise = null;

function doFetch(method, url, headers, body, opts) {
  return fetch(url, {
    method,
    credentials: 'include',
    headers,
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
    ...opts,
  });
}

async function request(method, path, body, opts = {}) {
  const url = `${BASE}${path}`;
  const headers = { ...(opts.headers || {}) };

  if (body && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  let res = await doFetch(method, url, headers, body, opts);

  // On 401, attempt a single silent refresh then retry the original request
  if (res.status === 401 && !path.startsWith('/auth/')) {
    try {
      if (!refreshPromise) {
        refreshPromise = fetch(`${BASE}/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
        });
      }
      const refreshRes = await refreshPromise;
      refreshPromise = null;

      if (refreshRes.ok) {
        res = await doFetch(method, url, headers, body, opts);
      }
    } catch {
      refreshPromise = null;
    }
  }

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
