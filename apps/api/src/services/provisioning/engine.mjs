/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import {
  ProvisioningError,
  adminDatabaseName,
  passwords,
  publishLocal,
  roleUrl,
} from './config.mjs';
import { randomUUID } from 'node:crypto';
import {
  using,
  prepareRoles,
  createLocal,
  databasePrivileges,
  identity,
  maintenanceUrl,
} from './postgres.mjs';
import { renderSettings, renderClient, provisionRender } from './render.mjs';
import { migrateDatabase } from '../../db/migrate.js';
import { adminModules } from '../../db/admin/modules.js';
import { cellModules } from '../../db/cell/modules.js';
import { createAdminDatabase } from '../../db/admin/index.js';
import { adminRepositories } from '../../db/admin/repositories.js';
import { createCellDatabase } from '../../db/cell/index.js';
import { cellRepositories } from '../../db/cell/repositories.js';
import {
  bootstrapConfiguration,
  bootstrapRoot,
} from '../../services/bootstrap.js';
import {
  seedReference,
  referenceReady,
} from '../../modules/reference-data/seed.js';

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
/**
 * Does: Registers a disabled cell or verifies its existing operation identity.
 * Called by: cell setup before creating the database.
 */
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
        'INSERT INTO admin.cells(id,database_name,enabled) VALUES($1,$2,false)',
        [entry.id, entry.database]
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
/**
 * Does: Builds the local setup connection from the endpoint and admin password.
 * Called by: local database setup before checking roles or creating databases.
 */
function localSetupUrl(context, entry) {
  const key = `SETUP_DATABASE_${context.state.environment.toUpperCase()}`;
  if (!context.env[key]) throw new ProvisioningError(`Required ${key}`);
  return roleUrl(context.env[key], 'nap_admin', entry.adminPassword);
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
  if ((entry.requestedDatabase ?? entry.database) !== command.database)
    throw new ProvisioningError('Saved database name differs');
  context.activeEntry = entry;
  passwords(context, entry);
  await context.save();
  if (command.target === 'cell') await register(context, entry);
  let url;
  if (command.environment === 'prod') {
    const call = renderClient(
      renderSettings(context.env),
      fetch,
      context.signal
    );
    url = await provisionRender(context, entry, call);
    await context.prepareMaintenance?.(entry, url);
  } else {
    url = localSetupUrl(context, entry);
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
/**
 * Does: Publishes a prepared cell and verifies its live pool before enabling it.
 * Called by: the API operation runner after migration and seeding.
 */
async function activate(context, command, entry) {
  if (!['seeded', 'enabled'].includes(entry.stage))
    throw new ProvisioningError('Migrate and seed before activation');
  await registered(context, entry);
  await using(maintenanceUrl(entry), async db => {
    await identity(db, entry, command.environment);
    for (const module of cellModules) {
      const applied = await db.any(
        'SELECT migration_id FROM $1:name.schema_migrations WHERE module_name=$2',
        [module.schema, module.name]
      );
      if (
        module.migrations.some(
          migration => !applied.some(row => row.migration_id === migration.id)
        )
      )
        throw new ProvisioningError('Cell migrations are incomplete');
    }
    if (!(await referenceReady(db)))
      throw new ProvisioningError('Cell reference seeding is incomplete');
  });
  await context.publish(entry);
  await context.load(entry);
  await using(maintenanceUrl(context.state.databases.admin), async db => {
    await db.none(
      'UPDATE admin.cells SET enabled=true WHERE id=$1 AND deactivated_at IS NULL',
      [entry.id]
    );
  });
  await stage(context, entry, 'enabled');
}
/** Does: Runs one explicitly selected provisioning operation. Called by: the CLI and disposable integration tests. */
export async function run(command, context) {
  if (command.target === 'admin')
    command = {
      ...command,
      database: adminDatabaseName(command.environment, context.env),
    };
  if (command.operation === 'setup') return setup(context, command);
  const entry =
    command.target === 'admin'
      ? context.state.databases.admin
      : Object.values(context.state.databases).find(e => e.id === command.id);
  if (!entry?.endpoint)
    throw new ProvisioningError('Missing setup state; run setup first');
  if (
    (entry.requestedDatabase ?? entry.database) !==
    (command.target === 'admin'
      ? command.database
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
