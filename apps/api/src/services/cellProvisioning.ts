/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import {
  argumentsFor,
  configuration,
  remoteConfiguration,
  privateWrite,
  publishLocal,
  roleUrl,
  ProvisioningError,
} from './provisioning/config.mjs';
import { run } from './provisioning/engine.mjs';
import { renderClient, renderSettings } from './provisioning/render.mjs';
import { createCellDatabase } from '../db/cell/index.js';
import { cellRepositories } from '../db/cell/repositories.js';
import { resolveEnvironment } from '../util/env.js';
import { logger } from '../util/logger.js';
import { HttpError } from '../util/httpError.js';
import type {
  AdminHandle,
  AdminRepositories,
} from '../db/admin/repositories.js';
import type { AdminTransaction } from '../db/withAdminTransaction.js';
import type { CellRegistry } from './cellRegistry.js';
import type { CacheBinding } from '../db/authorizationCache.js';

/** Does: Validates private saved connection entries. Used by: configuration loading. */
const connectionSchema = z
  .object({
    endpoint: z.string().optional(),
    appPassword: z.string().optional(),
    adminPassword: z.string().optional(),
  })
  .passthrough();
/** Does: Validates resumable secret state while retaining legacy recovery fields. Used by: operation setup. */
const stateSchema = z
  .object({
    environment: z.string(),
    databases: z.record(
      z.string(),
      connectionSchema.extend({
        id: z.string().optional(),
        database: z.string().optional(),
        name: z.string().optional(),
        operationId: z.string().optional(),
        stage: z.string().optional(),
        renderId: z.string().optional(),
      })
    ),
  })
  .passthrough();
/** Does: Describes non-secret saved execution progress. Used by: the API runner. */
type Operation = {
  cell_id: string;
  environment: string;
  name: string;
  database_name: string;
  operation_id: string;
  resource_id: string | null;
  stage: string;
  status: string;
  requested_action: string;
};
/** Does: Defines the environment and fixture-owned persistence inputs. Used by: startup and disposable tests. */
export type ProvisioningOptions = {
  env?: NodeJS.ProcessEnv;
  environment?: 'DEV' | 'TEST' | 'PROD';
  cache?: CacheBinding['cache'];
};

/**
 * Does: Creates a resumable cell runner and transaction-scoped management commands.
 * Called by: the single API runtime and isolated test fixtures.
 */
export function createCellProvisioning(
  admin: AdminHandle,
  cells: CellRegistry,
  options: ProvisioningOptions = {}
): CellProvisioning {
  const env = options.env ?? process.env;
  const environment = options.environment ?? resolveEnvironment(env);
  const lower = environment.toLowerCase();
  let stopped = false;
  const cancellation = new AbortController();
  let timer: ReturnType<typeof setInterval> | undefined;
  let flight: Promise<void> | undefined;

  /** Does: Saves authenticated register/retry/availability intent. Called by: the control transaction before commit. */
  async function command(
    tx: AdminTransaction<AdminRepositories>,
    actor: string,
    input: { operation: string; suffix?: string; cell?: string },
    management = true
  ) {
    if (management && environment === 'TEST')
      throw new HttpError('INVALID_INPUT');
    await tx.cells.lockControl();
    if (input.operation === 'cell') {
      if (`nap_${lower}_cell_${input.suffix ?? ''}`.length > 63)
        throw new HttpError('INVALID_INPUT');
      const parsed = argumentsFor([
        'setup',
        'cell',
        '--env',
        lower,
        '--cell-name',
        input.suffix ?? '',
      ]);
      const existing = await tx.oneOrNone<{ cell_id: string }>(
        'SELECT cell_id FROM admin.cell_provisioning WHERE environment=$1 AND name=$2',
        [lower, parsed.name]
      );
      if (existing) return existing.cell_id;
      const inserted = await tx.cells.insert({
        database_name: parsed.database!,
        enabled: false,
      });
      const id = inserted.id;
      await tx.none(
        `INSERT INTO admin.cell_provisioning(cell_id,environment,name,database_name,operation_id,status,initiated_by)
       VALUES($1,$2,$3,$4,$5,'queued',$6)`,
        [id, lower, parsed.name, parsed.database, randomUUID(), actor]
      );
      return id;
    }
    const row = await tx.oneOrNone<Operation>(
      'SELECT * FROM admin.cell_provisioning WHERE cell_id=$1 AND environment=$2',
      [input.cell, lower]
    );
    if (!row) throw new HttpError('NOT_FOUND');
    if (['queued', 'running'].includes(row.status))
      throw new HttpError('CONFLICT');
    if (input.operation === 'cell-disable') {
      await tx.cells.update(row.cell_id, { enabled: false });
      return row.cell_id;
    }
    if (
      input.operation === 'cell-activate' &&
      !['seeded', 'enabled'].includes(row.stage)
    )
      throw new HttpError('INVALID_INPUT');
    await tx.cells.update(row.cell_id, { enabled: false });
    await tx.none(
      "UPDATE admin.cell_provisioning SET status='queued',requested_action=$2,failure_code=NULL,initiated_by=$3,updated_at=now() WHERE cell_id=$1",
      [
        row.cell_id,
        input.operation === 'cell-activate' ? 'activate' : 'provision',
        actor,
      ]
    );
    return row.cell_id;
  }

  /** Does: Opens saved credentials and supplies persistence and live-pool callbacks. Called by: each queued operation. */
  async function contextFor(row: Operation) {
    const args = argumentsFor([
      'setup',
      'cell',
      '--env',
      lower,
      '--cell-name',
      row.name,
    ]);
    if (
      environment === 'TEST' &&
      (!env.NAP_ENV_FILE ||
        !env.NAP_PROVISION_STATE ||
        !env.SETUP_DATABASE_TEST)
    )
      throw new ProvisioningError(
        'TEST requires isolated fixture configuration'
      );
    const call =
      environment === 'PROD'
        ? renderClient(renderSettings(env), fetch, cancellation.signal)
        : undefined;
    const service = env.RENDER_API_SERVICE_ID;
    const rawContext = call
      ? await remoteConfiguration(args, env, call)
      : await configuration(args, env);
    try {
      const context = {
        ...rawContext,
        state: stateSchema.parse(rawContext.state),
      };
      context.save = call
        ? async () => {
            await call(
              `/services/${service}/env-vars/NAP_PROVISION_STATE_PROD`,
              'PUT',
              { value: JSON.stringify(context.state) }
            );
          }
        : async () => {
            await privateWrite(
              context.stateFile,
              JSON.stringify(context.state, null, 2) + '\n'
            );
          };
      const entry = context.state.databases[row.database_name];
      if (
        entry &&
        (entry.id !== row.cell_id ||
          entry.operationId !== row.operation_id ||
          entry.database !== row.database_name)
      ) {
        throw new ProvisioningError(
          'Saved operation identity differs from registration'
        );
      }
      context.state.databases[row.database_name] ??= {
        id: row.cell_id,
        database: row.database_name,
        name: row.name,
        operationId: row.operation_id,
        stage: row.stage,
        renderId: row.resource_id ?? undefined,
      };
      // Admin bootstrap has already published the runtime endpoint and shared maintenance credentials.
      if (!context.state.databases.admin) {
        const adminConfig =
          environment === 'PROD'
            ? connectionSchema.parse(
                JSON.parse(env.ADMIN_DATABASE_PROD ?? '{}')
              )
            : undefined;
        context.state.databases.admin = {
          database: `nap_${lower}_admin`,
          endpoint:
            adminConfig?.endpoint ?? env[`ADMIN_DATABASE_${environment}`],
          adminPassword:
            adminConfig?.adminPassword ?? env[`NAP_ADMIN_PSWD_${environment}`],
        };
      }
      const extended = Object.assign(context, {
        api: true,
        signal: cancellation.signal,
        /** Does: Persists a cell connection without deploying. Called by: activation before loading. */
        publish: async (entry: {
          id: string;
          runtimeEndpoint: string;
          appPassword: string;
          adminPassword: string;
        }) => {
          const key = `CELL_DATABASES_${environment}`;
          if (call) {
            const saved = await call(`/services/${service}/env-vars/${key}`);
            const map = z
              .record(z.string(), connectionSchema)
              .parse(
                JSON.parse(
                  saved &&
                    typeof saved === 'object' &&
                    'value' in saved &&
                    typeof saved.value === 'string'
                    ? saved.value
                    : '{}'
                )
              );
            if (
              map[entry.id] &&
              map[entry.id].endpoint !== entry.runtimeEndpoint
            )
              throw new ProvisioningError('Saved cell endpoint differs');
            map[entry.id] = {
              endpoint: entry.runtimeEndpoint,
              appPassword: entry.appPassword,
              adminPassword: entry.adminPassword,
            };
            await call(`/services/${service}/env-vars/${key}`, 'PUT', {
              value: JSON.stringify(map),
            });
          } else
            await publishLocal(context, {
              [key]: JSON.stringify({ [entry.id]: entry.runtimeEndpoint }),
            });
        },
        /** Does: Installs and verifies the new runtime pool. Called by: activation after configuration is durable. */
        load: async (entry: {
          id: string;
          database: string;
          operationId: string;
          runtimeEndpoint: string;
          appPassword: string;
        }) => {
          if (cells.handles.has(entry.id)) {
            await cells.check();
            const handle = cells.get(entry.id);
            const actual = await handle.one<{
              id: string;
              database_name: string;
              operation_id: string;
              environment: string;
              actual: string;
            }>(
              'SELECT *,current_database() AS actual FROM cell.physical_identity'
            );
            if (
              actual.id !== entry.id ||
              actual.database_name !== entry.database ||
              actual.actual !== entry.database ||
              actual.operation_id !== entry.operationId ||
              actual.environment !== lower
            )
              throw new ProvisioningError(
                'Runtime cell identity differs from registration'
              );
            return;
          }
          const handle = createCellDatabase(
            roleUrl(entry.runtimeEndpoint, 'nap_app', entry.appPassword),
            {
              repositories: cellRepositories,
              pool: { max: 10 },
              authorizationCache: options.cache
                ? { cache: options.cache, database: entry.id }
                : undefined,
            }
          );
          await cells.add(entry.id, handle, admin);
        },
      });
      return extended;
    } catch (error) {
      await rawContext.close();
      throw error;
    }
  }

  /** Does: Executes queued work serially and records recoverable failures. Called by: the timer and tests. */
  function drain() {
    if (flight) return flight;
    if (stopped) return Promise.resolve();
    flight = (async () => {
      while (!stopped) {
        const row = await admin.oneOrNone<Operation>(
          "UPDATE admin.cell_provisioning SET status='running',started_at=now(),updated_at=now() WHERE cell_id=(SELECT cell_id FROM admin.cell_provisioning WHERE status='queued' AND environment=$1 ORDER BY updated_at LIMIT 1) RETURNING *",
          [lower]
        );
        if (!row) break;
        let context: Awaited<ReturnType<typeof contextFor>> | undefined;
        try {
          context = await contextFor(row);
          for (const operation of row.requested_action === 'activate'
            ? ['activate']
            : ['setup', 'migrate', 'seed', 'activate']) {
            if (stopped)
              throw new ProvisioningError(
                'Provisioning interrupted by shutdown; retry'
              );
            const args =
              operation === 'setup'
                ? ['setup', 'cell', '--env', lower, '--cell-name', row.name]
                : [operation, 'cell', '--env', lower, '--cell-id', row.cell_id];
            await run(argumentsFor(args), context);
          }
          await admin.none(
            "UPDATE admin.cell_provisioning SET status='completed',completed_at=now(),updated_at=now(),failure_code=NULL WHERE cell_id=$1",
            [row.cell_id]
          );
        } catch (error) {
          const message =
            error instanceof ProvisioningError
              ? error.message
              : 'Provisioning failed; verify configured credentials and database availability';
          await admin.none(
            'UPDATE admin.cell_provisioning SET status=$3,failure_code=$2,updated_at=now() WHERE cell_id=$1',
            [row.cell_id, message, stopped ? 'queued' : 'failed']
          );
          await admin.db.cells.update(row.cell_id, { enabled: false });
        } finally {
          await context?.close();
        }
      }
    })().finally(() => {
      flight = undefined;
    });
    return flight;
  }
  /** Does: Resumes interrupted work and starts background polling. Called by: runtime startup. */
  async function start() {
    if (stopped || timer) return;
    await admin.none(
      "UPDATE admin.cell_provisioning SET status='queued' WHERE status='running' AND environment=$1",
      [lower]
    );
    timer = setInterval(() => {
      void drain().catch(() => {
        logger.error(
          { event: 'cell.provisioning_poll_failed' },
          'Cell provisioning polling failed'
        );
      });
    }, 1000);
    timer.unref();
  }
  /** Does: Stops scheduling and waits for the current database step. Called by: runtime shutdown. */
  async function stop() {
    stopped = true;
    cancellation.abort();
    if (timer) clearInterval(timer);
    await flight;
  }
  return { environment, command, drain, start, stop };
}
/** Does: Names the provisioning coordinator. Used by: the cell registry and routes. */
export type CellProvisioning = {
  environment: 'DEV' | 'TEST' | 'PROD';
  command: (
    tx: AdminTransaction<AdminRepositories>,
    actor: string,
    input: { operation: string; suffix?: string; cell?: string },
    management?: boolean
  ) => Promise<string>;
  drain: () => Promise<void>;
  start: () => Promise<void>;
  stop: () => Promise<void>;
};
