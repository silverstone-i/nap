/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { setTimeout as delay } from 'node:timers/promises';
import {
  advanceCellProvisioning,
  claimCellProvisioning,
} from '../../modules/admin-tenancy/domain/cells.js';
import { assignNapsoftCell, runRootTenantSetup } from './rootTenantSetup.js';

/** Stages each requested action runs, in order (I0003 §8). */
const PLANS = Object.freeze({
  provision: ['setup', 'migration', 'seed', 'activation'],
  activate: ['activation'],
});

/**
 * Build the provisioning worker that runs inside the API (I0003-R001–R006).
 *
 * One job runs at a time per process. Each check first retries a pending
 * root tenant setup, then claims the next queued job and runs its stages,
 * recording every stage change through M0001-06's `advanceCellProvisioning`.
 * Stopping lets the current step finish and returns the job to `queued`.
 * @param {{admin: {db: object}, stages: Record<string, (job: object) => Promise<void>>, driver: object, intervalMs?: number, rootSetup?: typeof runRootTenantSetup}} options
 * @returns {{start: () => Promise<void>, stop: () => Promise<void>, tick: () => Promise<void>}}
 */
export function createProvisioningWorker({
  admin,
  stages,
  driver,
  intervalMs = 1000,
  rootSetup = runRootTenantSetup,
}) {
  const db = admin.db;
  const controller = new AbortController();
  let loop;

  async function requeue(job) {
    await db.cell_provisioning.update(job.id, { status: 'queued' });
  }

  async function runJob(job) {
    const cell = await db.cells.findOneBy(
      { id: job.cell_id },
      { columnWhitelist: ['id', 'database_name', 'environment'] }
    );
    const context = {
      cell,
      operationId: job.operation_id,
      signal: controller.signal,
    };
    const plan = PLANS[job.requested_action];
    for (const [index, name] of plan.entries()) {
      if (controller.signal.aborted) return requeue(job);
      if (index > 0 || name !== job.stage)
        await advanceCellProvisioning(db, job.operation_id, {
          kind: 'advanced',
          stage: name,
        });
      try {
        await stages[name](context);
      } catch (error) {
        if (controller.signal.aborted || error?.code === 'STOPPED')
          return requeue(job);
        await advanceCellProvisioning(db, job.operation_id, {
          kind: 'failed',
          failureCode: error?.code ?? 'SETUP_FAILED',
        });
        return;
      }
    }
    await advanceCellProvisioning(
      db,
      job.operation_id,
      { kind: 'completed' },
      { onCompleted: (tx, operation) => assignNapsoftCell(db, tx, operation) }
    );
  }

  /**
   * One check: retry root tenant setup, then run at most one queued job.
   * Errors never escape, so a bad job cannot stop the loop.
   * @returns {Promise<void>}
   */
  async function tick() {
    await rootSetup(db, driver).catch(() => {});
    let job;
    try {
      job = await claimCellProvisioning(db);
    } catch {
      return;
    }
    if (!job) return;
    try {
      await runJob(job);
    } catch {
      // A failed stage-change write leaves the job `running`; the next start
      // returns it to `queued` (I0003-R002).
      return;
    }
    await rootSetup(db, driver).catch(() => {});
  }

  /**
   * Return jobs a previous process left `running` to `queued`, then check
   * every `intervalMs` until stopped (I0003-R002, R003).
   * @returns {Promise<void>}
   */
  async function start() {
    await db.cell_provisioning.requeueRunning();
    loop = (async () => {
      while (!controller.signal.aborted) {
        await tick();
        await delay(intervalMs, undefined, {
          signal: controller.signal,
        }).catch(() => {});
      }
    })();
  }

  /**
   * Stop after the current step; an unfinished job goes back to `queued`
   * (I0003-R005).
   * @returns {Promise<void>}
   */
  async function stop() {
    controller.abort();
    await loop;
  }

  return { start, stop, tick };
}
