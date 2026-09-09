/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { AuditFields, SoftDelete } from '../../../db/rowFields.js';
import { TableModel } from 'pg-schemata';
import type { DbConnection, Database, TableSchema } from 'pg-schemata';

/** Does: Describes stored employees values. Used by: its repository and services. */
export type EmployeesRow = {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  email: string;
  is_app_user: boolean;
} & AuditFields &
  SoftDelete;
/** Does: Defines app.employees. Used by: the Employees repository. */
export const schema: TableSchema = {
  dbSchema: 'app',
  table: 'employees',
  hasAuditFields: {
    enabled: true,
    userFields: {
      type: 'uuid',
    },
  },
  softDelete: true,
  columns: [
    {
      name: 'id',
      type: 'uuid',
      notNull: true,

      immutable: true,
    },
    {
      name: 'tenant_id',
      type: 'uuid',
      notNull: true,
      immutable: true,
    },
    {
      name: 'code',
      type: 'text',
      notNull: true,
    },
    {
      name: 'name',
      type: 'text',
      notNull: true,
    },
    {
      name: 'email',
      type: 'text',
      notNull: true,
    },
    {
      name: 'is_app_user',
      type: 'boolean',
      notNull: true,
      default: true,
    },
  ],
  constraints: {
    primaryKey: ['id'],
    checks: [],
    indexes: [
      {
        columns: ['tenant_id', 'code'],
        unique: true,
        where: 'deactivated_at IS NULL',
      },
    ],
    foreignKeys: [],
    unique: [['tenant_id', 'id']],
  },
};
/** Does: Persists employees records. Called by: transaction-bound services. */
export class Employees extends TableModel<EmployeesRow> {
  /** Does: Binds the model to a connection. Called by: repository composition. */
  constructor(db: DbConnection, pgp: Database['pgp']) {
    super(db, pgp, schema);
  }

  /** Does: Grants runtime cell operations without ownership or RLS bypass. Called by: cell migration script. */
  async grantRuntime(role: string) {
    await this.db.none(
      'GRANT USAGE ON SCHEMA app,cell TO $1:name; GRANT SELECT,INSERT,UPDATE ON app.employees,app.clients,app.vendors,app.vendor_contacts,cell.tenants,cell.tenant_user_bindings,cell.entitlement_projections,app.companies,app.roles,app.role_assignments,app.assignment_companies,app.projects,app.assignment_projects TO $1:name; GRANT SELECT,INSERT ON app.access_events TO $1:name',
      [role]
    );
  }
}
