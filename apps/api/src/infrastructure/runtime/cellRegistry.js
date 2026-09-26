/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { roleUrl } from '../../application/shared/configuration.js';
import { verifyPhysicalIdentity } from '../../modules/cell-tenancy/schema/identity.js';
import { createCellDatabase } from './cellDatabase.js';

/** Thrown by `cellFor` when the session's tenant has no ready cell. */
export class CellRegistryError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

/**
 * Build the runtime cell registry: the in-process map from cell ID to a
 * `nap-app` connection and its readiness (I0003-R014–R022).
 *
 * Every entry records the first failed check as its not-ready reason; a
 * failure never throws out of `load` or `add`, so one broken cell cannot stop
 * startup or affect the others (R016). Reasons are codes only, never
 * endpoints or passwords (R039). The registry connects only as `nap-app`
 * (R038).
 * @param {{admin: {cells: object, tenants: object}, connect?: (url: string) => {connect: () => Promise<unknown>, close: () => Promise<void>, db: object}}} options
 *   `admin` is the admin database's repository handle (`admin.db`).
 * @returns {{load: Function, add: Function, readiness: Function, markDisabled: Function, recheck: Function, cellFor: Function, close: Function}}
 */
export function createCellRegistry({ admin, connect = createCellDatabase }) {
  /** @type {Map<string, {connection: {endpoint: string, appPassword: string}, handle: object|null, ready: boolean, reason?: string}>} */
  const cells = new Map();

  async function open(connection) {
    const handle = connect(
      roleUrl(connection.endpoint, 'nap-app', connection.appPassword)
    );
    try {
      await handle.connect();
      await handle.db.one('SELECT 1');
      return handle;
    } catch {
      await handle.close().catch(() => {});
      return null;
    }
  }

  async function check(id, entry, { requireEnabled }) {
    const set = reason => {
      entry.ready = !reason;
      entry.reason = reason;
      cells.set(id, entry);
      return readiness(id);
    };
    let record;
    try {
      record = await admin.cells.findOneBy(
        { id },
        { columnWhitelist: ['id', 'database_name', 'enabled'] }
      );
    } catch {
      return set('CELL_UNREACHABLE');
    }
    if (!record) return set('CELL_NOT_REGISTERED');
    if (requireEnabled && !record.enabled) return set('CELL_DISABLED');
    entry.handle ??= await open(entry.connection);
    if (!entry.handle) return set('CELL_UNREACHABLE');
    try {
      const identity = await verifyPhysicalIdentity(entry.handle, record);
      return set(identity.ready ? undefined : identity.reason);
    } catch {
      return set('CELL_UNREACHABLE');
    }
  }

  /**
   * I0003-R017.
   * @param {string} id
   * @returns {{ready: true} | {ready: false, reason: string}}
   */
  function readiness(id) {
    const entry = cells.get(String(id).toLowerCase());
    if (!entry) return { ready: false, reason: 'CELL_NOT_CONFIGURED' };
    return entry.ready
      ? { ready: true }
      : { ready: false, reason: entry.reason };
  }

  /**
   * Load every published cell at startup (I0003-R014–R016).
   * @param {Record<string, {endpoint: string, appPassword: string}>} map
   * @returns {Promise<void>}
   */
  async function load(map) {
    await Promise.all(
      Object.entries(map).map(([id, connection]) =>
        check(
          id.toLowerCase(),
          { connection, handle: null, ready: false },
          { requireEnabled: true }
        )
      )
    );
  }

  /**
   * Add a newly activated cell, or re-check one already held on its existing
   * connection (I0003-R018). Skips the enabled check: activation enables the
   * cell next.
   * @param {string} id
   * @param {{endpoint: string, appPassword: string}} connection
   * @returns {Promise<{ready: boolean, reason?: string}>}
   */
  async function add(id, connection) {
    const key = id.toLowerCase();
    const entry = cells.get(key) ?? { connection, handle: null, ready: false };
    return check(key, entry, { requireEnabled: false });
  }

  /**
   * Mark a disabled cell not ready at once (I0003-R021).
   * @param {string} id
   * @returns {void}
   */
  function markDisabled(id) {
    const entry = cells.get(id.toLowerCase());
    if (entry) Object.assign(entry, { ready: false, reason: 'CELL_DISABLED' });
  }

  /**
   * Re-run the full checks for a held cell, e.g. after it is re-enabled.
   * @param {string} id
   * @returns {Promise<{ready: boolean, reason?: string}>}
   */
  async function recheck(id) {
    const key = id.toLowerCase();
    const entry = cells.get(key);
    if (!entry) return readiness(key);
    return check(key, entry, { requireEnabled: true });
  }

  /**
   * Return the ready cell connection for the session's tenant (I0003-R019).
   * The cell always comes from the tenant record, never from the request.
   * @param {{tenant: string|null}} session
   * @returns {Promise<object>} The cell's repository handle (`handle.db`).
   * @throws {CellRegistryError} `CELL_UNAVAILABLE`
   */
  async function cellFor(session) {
    if (!session?.tenant) throw new CellRegistryError('CELL_UNAVAILABLE');
    const tenant = await admin.tenants.findOneBy(
      { id: session.tenant },
      { columnWhitelist: ['id', 'cell_id'] }
    );
    const entry =
      tenant?.cell_id && cells.get(String(tenant.cell_id).toLowerCase());
    if (!entry?.ready || !entry.handle)
      throw new CellRegistryError('CELL_UNAVAILABLE');
    return entry.handle.db;
  }

  /**
   * The ready cells and their repository handles, for the sync worker
   * (I0004-R002).
   * @returns {{id: string, db: object}[]}
   */
  function readyCells() {
    return [...cells.entries()]
      .filter(([, entry]) => entry.ready && entry.handle)
      .map(([id, entry]) => ({ id, db: entry.handle.db }));
  }

  /**
   * Return the ready connection for a cell ID (I0004-R014).
   * @param {string} cellId
   * @returns {object} The cell's repository handle (`handle.db`).
   * @throws {CellRegistryError} `CELL_UNAVAILABLE`
   */
  function dbFor(cellId) {
    const entry = cells.get(String(cellId).toLowerCase());
    if (!entry?.ready || !entry.handle)
      throw new CellRegistryError('CELL_UNAVAILABLE');
    return entry.handle.db;
  }

  /**
   * Close every cell connection (I0003-R022).
   * @returns {Promise<void>}
   */
  async function close() {
    const handles = [...cells.values()].map(entry => entry.handle);
    cells.clear();
    await Promise.allSettled(handles.filter(Boolean).map(h => h.close()));
  }

  return {
    load,
    add,
    readiness,
    markDisabled,
    recheck,
    cellFor,
    readyCells,
    dbFor,
    close,
  };
}
