/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { setTimeout as delay } from 'node:timers/promises';
import {
  advanceCellProvisioning,
  claimCellProvisioning,
} from '../../modules/admin-tenancy/domain/cells.js';
import {
  advanceTenantProvisioning,
  claimTenantProvisioning,
  TENANT_STAGES,
} from '../../modules/admin-tenancy/domain/tenantProvisioning.js';
import {
  assignNapsoftCell,
  runNapsoftTenantSetup,
} from './napsoftTenantSetup.js';

/** Stages each requested action runs, in order (I0003 §8). */
const PLANS = Object.freeze({
  provision: ['setup', 'migration', 'seed', 'activation'],
  activate: ['activation'],
});

/**
 * Build the provisioning worker that runs inside the API (I0003-R001–R006).
 *
 * One job runs at a time per process. Each check first retries a pending
 * Napsoft tenant setup, then claims the next queued job and runs its stages,
 * recording every stage change through M0001-06's `advanceCellProvisioning`.
 * Stopping lets the current step finish and returns the job to `queued`.
 * Each check also runs at most one queued tenant job (I0006-R005), through
 * `tenantStages`, recording its stage changes through
 * `advanceTenantProvisioning`.
 * @param {{admin: {db: object}, stages: Record<string, (job: object) => Promise<void>>, tenantStages?: ReturnType<typeof import('./tenantStages.js').createTenantStages>, driver: object, intervalMs?: number, napsoftSetup?: typeof runNapsoftTenantSetup}} options
 * @returns {{start: () => Promise<void>, stop: () => Promise<void>, tick: () => Promise<void>}}
 */
export function createProvisioningWorker({
  admin,
  stages,
  tenantStages,
  driver,
  intervalMs = 1000,
  napsoftSetup = runNapsoftTenantSetup,
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
   * Run a claimed tenant job from its current stage (I0006 §8). A stop
   * returns it to `queued` at the same stage; a failure records the code.
   * @param {object} job
   * @returns {Promise<void>}
   */
  async function runTenantJob(job) {
    const plan = TENANT_STAGES.slice(
      TENANT_STAGES.indexOf(job.stage),
      TENANT_STAGES.indexOf('complete')
    );
    const requeueTenant = () =>
      advanceTenantProvisioning(db, job.tenant_id, { kind: 'requeued' });
    for (const [index, name] of plan.entries()) {
      if (controller.signal.aborted) return requeueTenant();
      if (index > 0)
        await advanceTenantProvisioning(db, job.tenant_id, {
          kind: 'advanced',
          stage: name,
        });
      try {
        await tenantStages[name](job);
      } catch (error) {
        if (controller.signal.aborted || error?.code === 'STOPPED')
          return requeueTenant();
        await advanceTenantProvisioning(db, job.tenant_id, {
          kind: 'failed',
          failureCode: error?.code ?? 'SEED_FAILED',
        });
        return;
      }
    }
    try {
      await advanceTenantProvisioning(
        db,
        job.tenant_id,
        { kind: 'completed' },
        { onCompleted: (tx, locked) => tenantStages.activate(tx, locked) }
      );
    } catch {
      await advanceTenantProvisioning(db, job.tenant_id, {
        kind: 'failed',
        failureCode: 'ACTIVATION_FAILED',
      });
    }
  }

  /**
   * Claim and run at most one queued tenant job. Errors never escape.
   * @returns {Promise<void>}
   */
  async function tenantTick() {
    if (!tenantStages) return;
    let job;
    try {
      job = await claimTenantProvisioning(db);
    } catch {
      return;
    }
    if (!job) return;
    // A failed stage-change write leaves the job `running`; the next start
    // returns it to `queued` (I0006-R005).
    await runTenantJob(job).catch(() => {});
  }

  /**
   * One check: retry Napsoft tenant setup, then run at most one queued job.
   * Errors never escape, so a bad job cannot stop the loop.
   * @returns {Promise<void>}
   */
  async function tick() {
    await napsoftSetup(db, driver).catch(() => {});
    let job;
    try {
      job = await claimCellProvisioning(db);
    } catch {
      job = null;
    }
    if (job) {
      try {
        await runJob(job);
        await napsoftSetup(db, driver).catch(() => {});
      } catch {
        // A failed stage-change write leaves the job `running`; the next
        // start returns it to `queued` (I0003-R002).
      }
    }
    await tenantTick();
  }

  /**
   * Return jobs a previous process left `running` to `queued`, then check
   * every `intervalMs` until stopped (I0003-R002, R003).
   * @returns {Promise<void>}
   */
  async function start() {
    await db.cell_provisioning.requeueRunning();
    if (tenantStages) await db.tenant_provisioning.requeueRunning();
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
