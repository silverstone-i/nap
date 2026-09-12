import { ProvisioningError } from './provision/config.mjs';
/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import {
  argumentsFor,
  configuration,
  passwords,
  publishLocal,
} from './provision/config.mjs';
import {
  using,
  prepareRoles,
  createLocal,
  databasePrivileges,
  identity,
  maintenanceUrl,
} from './provision/postgres.mjs';
import {
  renderSettings,
  renderClient,
  provisionRender,
  deployCell,
} from './provision/render.mjs';
import { migrateDatabase } from '../apps/api/dist/db/migrate.js';
import { adminModules } from '../apps/api/dist/db/admin/modules.js';
import { cellModules } from '../apps/api/dist/db/cell/modules.js';
import { createAdminDatabase } from '../apps/api/dist/db/admin/index.js';
import { adminRepositories } from '../apps/api/dist/db/admin/repositories.js';
import { createCellDatabase } from '../apps/api/dist/db/cell/index.js';
import { cellRepositories } from '../apps/api/dist/db/cell/repositories.js';
import {
  bootstrapConfiguration,
  bootstrapRoot,
} from '../apps/api/dist/services/bootstrap.js';
import {
  seedReference,
  referenceReady,
} from '../apps/api/dist/modules/reference-data/seed.js';

/** Does: Confirms saved cell metadata matches the central registration. Called by: every operation on an existing cell. */
async function registered(context, entry) {
  const admin = context.state.databases.admin;
  if (!admin) throw new ProvisioningError('Set up and migrate admin first');
  return using(maintenanceUrl(admin), async db => {
    const row = await db.oneOrNone(
      'SELECT p.*,c.enabled,c.deactivated_at FROM admin.cell_provisioning p JOIN admin.cells c ON c.id=p.cell_id WHERE p.cell_id=$1',
      [entry.id]
    );
    if (
      !row ||
      row.environment !== context.state.environment ||
      row.name !== entry.name ||
      row.database_name !== entry.database ||
      row.operation_id !== entry.operationId ||
      row.deactivated_at
    )
      throw new ProvisioningError(
        'Registered cell does not match provisioning state'
      );
    return row;
  });
}
/** Does: Records successful stages and clears prior failure metadata. Called by: cell operations after durable completion. */
async function stage(context, entry, value) {
  const stages = ['registered', 'created', 'migrated', 'seeded', 'enabled'];
  if (stages.indexOf(entry.stage) > stages.indexOf(value)) value = entry.stage;
  if (entry.id)
    await using(maintenanceUrl(context.state.databases.admin), db =>
      db.none(
        'UPDATE admin.cell_provisioning SET stage=$2,resource_id=$3,failure_code=NULL WHERE cell_id=$1',
        [entry.id, value, entry.renderId || null]
      )
    );
  entry.stage = value;
  await context.save();
}
/** Does: Saves disabled registration before physical resource creation. Called by: cell setup. */
async function register(context, entry) {
  const admin = context.state.databases.admin;
  if (!admin) throw new ProvisioningError('Admin must be prepared first');
  await using(maintenanceUrl(admin), db =>
    db.tx(async tx => {
      await tx.any('SELECT pg_advisory_xact_lock(732,1)');
      const existing = await tx.oneOrNone(
        'SELECT p.* FROM admin.cell_provisioning p WHERE environment=$1 AND name=$2',
        [context.state.environment, entry.name]
      );
      if (existing) {
        if (
          existing.operation_id !== entry.operationId ||
          existing.cell_id !== entry.id
        )
          throw new ProvisioningError(
            'Cell name belongs to another provisioning operation'
          );
        return;
      }
      await tx.none(
        'INSERT INTO admin.cells(id,code,name,enabled) VALUES($1,$2,$2,false)',
        [entry.id, entry.name]
      );
      await tx.none(
        'INSERT INTO admin.cell_provisioning(cell_id,environment,name,database_name,operation_id) VALUES($1,$2,$3,$4,$5)',
        [
          entry.id,
          context.state.environment,
          entry.name,
          entry.database,
          entry.operationId,
        ]
      );
    })
  );
}
/** Does: Checks that a local infrastructure endpoint cannot select the wrong database. Called by: setup before role changes. */
function infrastructure(context) {
  const url = new URL(
    context.env[
      `INFRA_DATABASE_URL_${context.state.environment.toUpperCase()}`
    ] || ''
  );
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !url.hostname ||
    !url.username
  )
    throw new ProvisioningError('Invalid infrastructure connection');
  return url.href;
}
/** Does: Creates one database using saved secrets and immutable operation identity. Called by: setup commands. */
async function setup(context, command) {
  const key = command.target === 'admin' ? 'admin' : command.database;
  let entry = context.state.databases[key];
  if (!entry) {
    entry = {
      database: command.database,
      name: command.name,
      operationId: randomUUID(),
      ...(command.target === 'cell' ? { id: randomUUID() } : {}),
      stage: 'registered',
    };
    context.state.databases[key] = entry;
  }
  if (entry.database !== command.database)
    throw new ProvisioningError('Saved database name differs');
  context.activeEntry = entry;
  passwords(context, entry);
  await context.save();
  if (command.target === 'cell') await register(context, entry);
  let url;
  if (command.environment === 'prod') {
    const call = renderClient(renderSettings(context.env));
    url = await provisionRender(context, entry, call);
  } else {
    url = infrastructure(context);
    const parsed = new URL(url);
    entry.endpoint = parsed.host + '/' + entry.database + parsed.search;
    entry.runtimeEndpoint = entry.endpoint;
  }
  await context.save();
  await prepareRoles(url, entry);
  if (command.environment !== 'prod')
    await createLocal(url, entry, context.save);
  await databasePrivileges(url, entry);
  if (entry.id)
    await using(maintenanceUrl(entry), db =>
      identity(db, entry, command.environment, true)
    );
  await stage(context, entry, 'created');
  if (command.environment === 'dev' && command.target === 'admin')
    await publishLocal(context, {
      ADMIN_DATABASE_DEV: entry.runtimeEndpoint,
      NAP_APP_PSWD_DEV: entry.appPassword,
      NAP_ADMIN_PSWD_DEV: entry.adminPassword,
    });
  return { database: entry.database, cellId: entry.id, stage: entry.stage };
}
/** Does: Applies pending migrations and grants the runtime role its intended access. Called by: explicit migration commands. */
async function migrate(context, command, entry) {
  if (entry.id) {
    await registered(context, entry);
    await using(maintenanceUrl(entry), db =>
      identity(db, entry, command.environment)
    );
  } else
    await using(maintenanceUrl(entry), async db => {
      const actual = await db.one('SELECT current_database() AS name');
      if (actual.name !== entry.database)
        throw new ProvisioningError('Wrong admin database');
      const present = await db.one(
        "SELECT to_regclass('admin.schema_migrations') IS NOT NULL AS present"
      );
      if (present.present) {
        const rows = await db.any('SELECT * FROM admin.schema_migrations');
        if (
          rows.some(row =>
            JSON.stringify(row).match(
              /001-tenants|002-portal_users|006-control-plane|007-rbac|008-cache-revisions/
            )
          )
        )
          throw new ProvisioningError(
            'Historical admin migration ledger requires a separate transition'
          );
      }
    });
  await migrateDatabase(
    command.target,
    maintenanceUrl(entry),
    command.target === 'admin' ? adminModules : cellModules
  );
  const handle =
    command.target === 'admin'
      ? createAdminDatabase(maintenanceUrl(entry), {
          repositories: adminRepositories,
        })
      : createCellDatabase(maintenanceUrl(entry), {
          repositories: cellRepositories,
        });
  try {
    if (command.target === 'admin')
      await handle.db.tenants.grantRuntime('nap_app');
    else {
      await handle.db.employees.grantRuntime('nap_app');
      await handle.none(
        'GRANT USAGE ON SCHEMA reference TO nap_app; GRANT SELECT ON reference.countries,reference.currencies,reference.seed_versions TO nap_app'
      );
    }
  } finally {
    await handle.close();
  }
  await stage(context, entry, 'migrated');
}
/** Does: Verifies the running API sees this physical cell before enabling it. Called by: activation after configuration publication. */
async function activate(context, command, entry) {
  if (!['seeded', 'enabled'].includes(entry.stage))
    throw new ProvisioningError('Migrate and seed before activation');
  await registered(context, entry);
  await using(maintenanceUrl(entry), async db => {
    await identity(db, entry, command.environment);
    if (!(await referenceReady(db)))
      throw new ProvisioningError('Cell reference seeding is incomplete');
  });
  const suffix = command.environment.toUpperCase();
  const origin = new URL(context.env[`API_ORIGIN_${suffix}`] || '');
  if (
    origin.username ||
    origin.password ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash ||
    (command.environment === 'prod' && origin.protocol !== 'https:')
  )
    throw new ProvisioningError('Invalid API origin');
  const cookie = context.env[`OPERATOR_COOKIE_${suffix}`];
  if (!cookie)
    throw new ProvisioningError('Required authenticated operator cookie');
  if (command.environment === 'prod')
    await deployCell(context, entry, renderClient(renderSettings(context.env)));
  else if (command.environment === 'dev') {
    const key = 'CELL_DATABASES_DEV';
    await publishLocal(context, {
      [key]: JSON.stringify({ [entry.id]: entry.runtimeEndpoint }),
    });
  }
  const response = await fetch(
    new URL(
      `/api/admin-tenancy/v1/control/cell-readiness?cell=${entry.id}`,
      origin
    ),
    {
      headers: { Cookie: cookie },
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    }
  );
  if (!response.ok)
    throw new ProvisioningError(
      'API not ready; restart or correct deployment, then rerun activation'
    );
  const result = await response.json();
  if (
    result.data?.cellId !== entry.id ||
    result.data?.database !== entry.database ||
    result.data?.environment !== command.environment ||
    result.data?.operationId !== entry.operationId ||
    result.data?.ready !== true
  )
    throw new ProvisioningError('API cell verification failed');
  await using(maintenanceUrl(context.state.databases.admin), db =>
    db.tx(async tx => {
      await tx.any('SELECT pg_advisory_xact_lock(732,1)');
      await tx.none(
        'UPDATE admin.cells SET enabled=true WHERE id=$1 AND deactivated_at IS NULL',
        [entry.id]
      );
      await tx.none(
        "UPDATE admin.cell_provisioning SET stage='enabled',failure_code=NULL WHERE cell_id=$1",
        [entry.id]
      );
    })
  );
  entry.stage = 'enabled';
  await context.save();
}
/** Does: Runs one explicitly selected provisioning operation. Called by: the CLI and disposable integration tests. */
export async function run(command, context) {
  if (command.operation === 'setup') return setup(context, command);
  const entry =
    command.target === 'admin'
      ? context.state.databases.admin
      : Object.values(context.state.databases).find(e => e.id === command.id);
  if (!entry?.endpoint)
    throw new ProvisioningError('Missing setup state; run setup first');
  if (
    entry.database !==
    (command.target === 'admin'
      ? `nap_${command.environment}_admin`
      : `nap_${command.environment}_cell_${entry.name}`)
  )
    throw new ProvisioningError('Saved target does not match environment');
  context.activeEntry = entry;
  passwords(context, entry);
  if (entry.id) await registered(context, entry);
  if (command.operation === 'migrate') await migrate(context, command, entry);
  if (command.operation === 'bootstrap') {
    const db = createAdminDatabase(maintenanceUrl(entry), {
      repositories: adminRepositories,
    });
    try {
      await bootstrapRoot(
        db,
        bootstrapConfiguration(
          context.env,
          command.resetRoot ? ['--reset-root-password'] : []
        )
      );
    } finally {
      await db.close();
    }
  }
  if (command.operation === 'seed')
    await using(maintenanceUrl(entry), async db => {
      await identity(db, entry, command.environment);
      await seedReference(db);
      await stage(context, entry, 'seeded');
    });
  if (command.operation === 'activate') await activate(context, command, entry);
  return { database: entry.database, cellId: entry.id, stage: entry.stage };
}
/** Does: Runs the selected operator command with safe diagnostics and cleanup. Called by: npm entry points. */
export async function cli(args) {
  let context;
  try {
    const command = argumentsFor(args);
    context = await configuration(command);
    console.log(JSON.stringify(await run(command, context)));
  } catch (error) {
    if (context?.activeEntry) {
      const entry = context.activeEntry;
      entry.failureCode = 'OPERATION_FAILED';
      try {
        await context.save();
        if (entry.id && context.state.databases.admin)
          await using(maintenanceUrl(context.state.databases.admin), db =>
            db.none(
              "UPDATE admin.cell_provisioning SET failure_code='OPERATION_FAILED' WHERE cell_id=$1",
              [entry.id]
            )
          );
      } catch {
        /* Original failure remains the reported failure. */
      }
    }
    console.error(
      error instanceof ProvisioningError
        ? `Database operation failed: ${error.message}. Resources were retained for recovery.`
        : 'Database operation failed; verify credentials, saved state, and readiness. Resources were retained for recovery.'
    );
    process.exitCode = 1;
  } finally {
    await context?.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await cli(process.argv.slice(2));
