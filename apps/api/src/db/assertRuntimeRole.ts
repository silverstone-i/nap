/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Startup verification that a handle is connected as a least-privileged
 * runtime role (ARCH-019).
 *
 * A role that owns tenant tables, or that holds SUPERUSER or BYPASSRLS, is not
 * subject to the policies those tables force. Configuration mistakes of that
 * kind are silent at request time and total in effect, so they fail startup
 * instead.
 */

/** Raised when a runtime connection is not least-privileged. */
export class RuntimeRoleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RuntimeRoleError';
  }
}

/** The read-only query surface {@link assertRuntimeRole} needs. */
export interface RoleQueryExecutor {
  one<T = unknown>(query: string, values?: unknown): Promise<T>;
  any<T = unknown>(query: string, values?: unknown): Promise<T[]>;
}

/** Options accepted by {@link assertRuntimeRole}. */
export interface AssertRuntimeRoleOptions {
  /** Schemas whose table ownership disqualifies the role. */
  schemas: readonly string[];
}

interface RoleAttributes {
  role: string;
  is_superuser: boolean;
  bypasses_rls: boolean;
}

interface OwnedTable {
  qualified_name: string;
}

/**
 * Verifies the connected role neither bypasses nor can disable RLS.
 *
 * Reads only; nothing is modified. Safe to call from a readiness check, which
 * is the only database work application startup performs (ARCH-025).
 *
 * @param db - Handle to check, connected as the runtime role.
 * @param options - Schemas whose ownership is checked.
 * @throws {RuntimeRoleError} If the role is a superuser, bypasses RLS, or owns
 *   a table in one of the given schemas.
 */
export async function assertRuntimeRole(
  db: RoleQueryExecutor,
  options: AssertRuntimeRoleOptions
): Promise<void> {
  const attributes = await db.one<RoleAttributes>(
    `SELECT current_user::text AS role,
            rolsuper      AS is_superuser,
            rolbypassrls  AS bypasses_rls
       FROM pg_roles
      WHERE rolname = current_user`
  );

  const violations: string[] = [];

  if (attributes.is_superuser) violations.push('holds SUPERUSER');
  if (attributes.bypasses_rls) violations.push('holds BYPASSRLS');

  if (options.schemas.length > 0) {
    const owned = await db.any<OwnedTable>(
      `SELECT n.nspname || '.' || c.relname AS qualified_name
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind IN ('r', 'p')
          AND n.nspname = ANY($1)
          AND pg_get_userbyid(c.relowner) = current_user
        ORDER BY 1`,
      [options.schemas]
    );

    if (owned.length > 0) {
      violations.push(
        `owns ${owned.length} table(s): ${owned
          .map(table => table.qualified_name)
          .join(', ')}`
      );
    }
  }

  if (violations.length > 0) {
    throw new RuntimeRoleError(
      `Runtime role ${attributes.role} ${violations.join(' and ')}; ` +
        'it must not be able to bypass or disable row-level security'
    );
  }
}
