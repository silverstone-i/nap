/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { ModuleDescriptor, RepositoryCtor } from 'pg-schemata';

/** Which schema a module's tables live in (ADR-0001). */
export type SchemaScope = 'admin' | 'tenant';

/**
 * A module's registry entry: pg-schemata's migration descriptor plus the two
 * properties ADR-0001 uses in place of folder position. A module owning tables
 * in both scopes registers two descriptors.
 */
export interface NapModule extends ModuleDescriptor {
  /** Schema the module's tables live in. Single-valued by design. */
  schemaScope: SchemaScope;
  /** Whether tenant-level entitlement gates access to the module. */
  licensable: boolean;
}

/**
 * Every module known to the process. Hand-maintained: adding a module touches
 * this file and `apiRoutes.ts`, and nothing else (ADR-0001).
 */
export const moduleRegistry: NapModule[] = [];

/**
 * Modules whose tables belong to the given schema scope. Scope filtering is
 * the registry's job — no migration ever tests which schema it is running in
 * (ADR-0005).
 */
export function modulesForScope(
  scope: SchemaScope,
  modules: readonly NapModule[] = moduleRegistry
): NapModule[] {
  return modules.filter(module => module.schemaScope === scope);
}

/**
 * Flattens every module's models into the single repository map `DB.init`
 * takes. Repository names share one namespace on the db handle, so a name
 * claimed by two modules is a wiring error, not a merge.
 *
 * @throws {Error} When two modules declare the same repository name.
 */
export function collectRepositories(
  modules: readonly NapModule[] = moduleRegistry
): Record<string, RepositoryCtor> {
  const repositories: Record<string, RepositoryCtor> = {};
  const owners = new Map<string, string>();

  for (const module of modules) {
    for (const [name, ctor] of Object.entries(module.models ?? {})) {
      const owner = owners.get(name);
      if (owner !== undefined) {
        throw new Error(
          `Duplicate repository "${name}": declared by both "${owner}" and "${module.name}"`
        );
      }
      owners.set(name, module.name);
      repositories[name] = ctor;
    }
  }

  return repositories;
}
