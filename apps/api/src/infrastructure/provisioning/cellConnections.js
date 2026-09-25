/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import {
  readFile,
  writeFile,
  rename,
  mkdir,
  rm,
  lstat,
  open,
} from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { randomUUID } from 'node:crypto';
import {
  MaintenanceError,
  requireCondition,
} from '../../application/shared/errors.js';

/**
 * Merge one cell into a connection map, refusing a different existing entry
 * (I0003-R012). An identical entry is a no-op, so a retried activation
 * publishes safely.
 * @param {unknown} current Parsed map, or `undefined` when absent.
 * @param {string} cellId
 * @param {unknown} entry
 * @returns {{map: Record<string, unknown>, changed: boolean}}
 * @throws {MaintenanceError} `PUBLISH_CONFLICT`, `PUBLISH_FAILED`
 */
export function mergeConnection(current, cellId, entry) {
  const map = current ?? {};
  requireCondition(
    map && typeof map === 'object' && !Array.isArray(map),
    'PUBLISH_FAILED'
  );
  const key = Object.keys(map).find(
    id => id.toLowerCase() === cellId.toLowerCase()
  );
  if (key === undefined)
    return { map: { ...map, [cellId]: entry }, changed: true };
  requireCondition(
    JSON.stringify(map[key]) === JSON.stringify(entry),
    'PUBLISH_CONFLICT'
  );
  return { map, changed: false };
}

function parseMap(text) {
  if (!text?.trim()) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    throw new MaintenanceError('PUBLISH_FAILED');
  }
}

/**
 * Keep only codes this module means to report; anything else, including a
 * file-system error that could name a path, becomes `PUBLISH_FAILED`.
 * @param {() => Promise<T>} operation
 * @returns {Promise<T>}
 * @template T
 */
async function publishErrors(operation) {
  try {
    return await operation();
  } catch (error) {
    if (
      error instanceof MaintenanceError &&
      ['PUBLISH_CONFLICT', 'UNSAFE_STATE_FILE', 'STATE_LOCKED'].includes(
        error.code
      )
    )
      throw error;
    throw new MaintenanceError('PUBLISH_FAILED');
  }
}

/**
 * Merge `{ "<cell-id>": "<endpoint>" }` into `CELL_DATABASES_<suffix>` in the
 * private `.env` file (I0003-R011, dev). Passwords stay in `NAP_*_PSWD_*`.
 *
 * Every other line is kept as written. The file must be mode `0600`
 * (I0003-R040); the rewrite is atomic and keeps that mode.
 * @param {string} file `.env` path.
 * @param {string} cellId
 * @param {string} endpoint
 * @param {{suffix?: string}} [options]
 * @returns {Promise<{changed: boolean}>}
 * @throws {MaintenanceError} `PUBLISH_CONFLICT`, `PUBLISH_FAILED`, `UNSAFE_STATE_FILE`, `STATE_LOCKED`
 */
export async function publishLocalConnection(
  file,
  cellId,
  endpoint,
  { suffix = 'DEV' } = {}
) {
  return publishErrors(async () => {
    const lock = file + '.lock';
    try {
      await mkdir(lock, { mode: 0o700 });
    } catch (error) {
      throw new MaintenanceError(
        error.code === 'EEXIST' ? 'STATE_LOCKED' : 'PUBLISH_FAILED'
      );
    }
    try {
      const stat = await lstat(file);
      requireCondition(
        stat.isFile() && !(stat.mode & 0o077),
        'UNSAFE_STATE_FILE'
      );
      const text = await readFile(file, 'utf8');
      const setting = `CELL_DATABASES_${suffix}`;
      const { map, changed } = mergeConnection(
        parseMap(parseEnv(text)[setting]),
        cellId,
        endpoint
      );
      if (!changed) return { changed };
      const line = `${setting}='${JSON.stringify(map)}'`;
      const pattern = new RegExp(`^${setting}=.*$`, 'm');
      const next = pattern.test(text)
        ? text.replace(pattern, () => line)
        : text.replace(/\n?$/, `\n${line}\n`);
      const temp = `${file}.${randomUUID()}`;
      try {
        await writeFile(temp, next, { mode: 0o600, flag: 'wx' });
        const fd = await open(temp, 'r');
        try {
          await fd.sync();
        } finally {
          await fd.close();
        }
        await rename(temp, file);
      } finally {
        await rm(temp, { force: true });
      }
      return { changed };
    } finally {
      await rm(lock, { recursive: true, force: true });
    }
  });
}

/**
 * Read and write one environment variable on a Render service.
 *
 * Render's env-var list is paginated by cursor; a variable the service does
 * not define reads as `undefined`. Writes replace only that variable.
 * @param {(path: string, method?: string, body?: unknown) => Promise<unknown>} call `renderClient` caller.
 * @param {string} serviceId
 * @param {string} key
 * @returns {{read: () => Promise<string|undefined>, write: (value: string) => Promise<void>}}
 */
export function renderVariable(call, serviceId, key) {
  const base = `/services/${encodeURIComponent(serviceId)}/env-vars`;
  return {
    async read() {
      let cursor;
      for (;;) {
        const page = await call(
          `${base}?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`
        );
        requireCondition(Array.isArray(page), 'INVALID_RENDER_RESPONSE');
        const found = page.find(item => item?.envVar?.key === key);
        if (found) return found.envVar.value;
        if (page.length < 100) return undefined;
        cursor = page.at(-1)?.cursor;
        requireCondition(cursor, 'INVALID_RENDER_RESPONSE');
      }
    },
    async write(value) {
      await call(`${base}/${encodeURIComponent(key)}`, 'PUT', { value });
    },
  };
}

/**
 * Merge `{ "<cell-id>": { endpoint, appPassword, adminPassword } }` into the
 * Render service's `CELL_DATABASES_PROD` variable (I0003-R011, prod).
 *
 * Changing the variable does not change the running process's environment;
 * the registry receives the new cell through `add`, and the next deploy reads
 * the published map.
 * @param {Function} call `renderClient` caller.
 * @param {string} serviceId `RENDER_API_SERVICE_ID`.
 * @param {string} cellId
 * @param {{endpoint: string, appPassword: string, adminPassword: string}} connection
 * @returns {Promise<{changed: boolean}>}
 * @throws {MaintenanceError} `PUBLISH_CONFLICT`, `PUBLISH_FAILED`
 */
export async function publishRenderConnection(
  call,
  serviceId,
  cellId,
  { endpoint, appPassword, adminPassword }
) {
  return publishErrors(async () => {
    const variable = renderVariable(call, serviceId, 'CELL_DATABASES_PROD');
    const { map, changed } = mergeConnection(
      parseMap(await variable.read()),
      cellId,
      { endpoint, appPassword, adminPassword }
    );
    if (changed) await variable.write(JSON.stringify(map));
    return { changed };
  });
}

/**
 * Production provisioning state in `NAP_PROVISION_STATE_PROD`
 * (I0003-R013): a JSON object keyed by cell ID holding Render instance IDs,
 * operation IDs, and generated role passwords, so a retry reuses them.
 * @param {Function} call `renderClient` caller.
 * @param {string} serviceId
 * @returns {{read: (cellId: string) => Promise<object|undefined>, save: (cellId: string, state: object) => Promise<void>}}
 */
export function renderProvisioningState(call, serviceId) {
  const variable = renderVariable(call, serviceId, 'NAP_PROVISION_STATE_PROD');
  const all = async () => parseMap(await variable.read()) ?? {};
  return {
    async read(cellId) {
      return (await all())[cellId];
    },
    async save(cellId, state) {
      const current = await all();
      await variable.write(JSON.stringify({ ...current, [cellId]: state }));
    },
  };
}
