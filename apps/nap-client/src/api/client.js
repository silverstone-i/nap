'use strict';

// Minimal API client for nap-serv. All requests include credentials so the
// httpOnly cookies set by the server are sent. The Vite dev proxy should map
// /api to the backend so this remains same-origin during development.

const defaultHeaders = {
  'Content-Type': 'application/json',
};

async function request(path, { method = 'GET', body, headers = {} } = {}) {
  const res = await fetch(path, {
    method,
    headers: { ...defaultHeaders, ...headers },
    credentials: 'include',
    body: body ? JSON.stringify(body) : undefined,
  });

  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const data = isJson ? await res.json().catch(() => ({})) : await res.text();

  if (!res.ok) {
    const message = (isJson && (data?.message || data?.error)) || res.statusText || 'Request failed';
    const err = new Error(message);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

export const api = {
  // Auth endpoints
  login: (email, password) => request('/api/tenants/v1/auth/login', { method: 'POST', body: { email, password } }),
  logout: () => request('/api/tenants/v1/auth/logout', { method: 'POST' }),
  refresh: () => request('/api/tenants/v1/auth/refresh', { method: 'POST' }),
  me: () => request('/api/v1/auth/me'),
};

export default api;
