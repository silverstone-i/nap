/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { z } from 'zod';
import { QueryModel, TableModel } from 'pg-schemata';
import { listParameterNames } from '@nap/shared';
import type { CellDatabase } from '../db/cell/index.js';

/**
 * Does: Represents one database row as the framework handles it: column
 * names to values, with no fixed shape.
 * Used by: every framework file and the controller base classes.
 */
export type Row = Record<string, unknown>;

/**
 * Does: Represents the repositories a controller's cell handle must carry:
 * the one named repository, as a read model at least.
 * Used by: the controller base classes and createRouter.
 */
export type Repositories<N extends string> = Record<N, QueryModel<Row>>;

const auditColumns = ['created_at', 'created_by', 'updated_at', 'updated_by'];
const reserved = new Set<string>(listParameterNames);

/**
 * Does: Represents what the framework knows about a controller's model once
 * its schema has been read: its key, columns, which columns clients may not
 * write, whether it soft-deletes, and the schemas that validate its records.
 * Used by: createRouter and every framework operation.
 * Why: it is built once at router construction so a defective model fails
 * startup, and it is the only view of the model the request path needs.
 */
export type ModelContract = {
  readonly repository: string;
  readonly primaryKey: string;
  readonly columns: ReadonlySet<string>;
  readonly managed: ReadonlySet<string>;
  readonly immutable: ReadonlySet<string>;
  readonly softDelete: boolean;
  readonly writable: boolean;
  readonly itemSchema: z.ZodType;
  readonly insertSchema?: z.ZodType;
  readonly updateSchema?: z.ZodType;
  readonly columnSchema: (name: string) => z.ZodType;
};

/**
 * Does: Reads a repository's table schema from the cell handle and returns
 * the model contract the framework works from.
 * Called by: createRouter, once per router at construction.
 * Why: this is the one place the framework touches a repository on the root
 * handle, and it reads metadata only; every query runs on the repository the
 * tenant transaction carries. A read-only projection has no generated
 * validators, so it must declare its own item schema, and its columns are
 * then checked against that schema.
 * @throws If the repository is missing, its primary key is not one column,
 * it lacks tenant_id, a column is named like a list parameter, or no item
 * schema can be found.
 */
export function describeModel<N extends string, R extends Repositories<N>>(
  cellDb: CellDatabase<R>,
  repository: N,
  itemSchema?: z.ZodType
): ModelContract {
  const model: unknown = cellDb.db[repository];
  if (!(model instanceof QueryModel)) {
    throw new Error(`Repository is not registered: ${repository}`);
  }
  const schema = model.schema;
  const primaryKey = schema.constraints?.primaryKey;
  if (!primaryKey || primaryKey.length !== 1 || !primaryKey[0]) {
    throw new Error(`Model needs a single-column primary key: ${repository}`);
  }
  const columns = new Set(schema.columns.map(column => column.name));
  if (!columns.has('tenant_id')) {
    throw new Error(`Model is not tenant-owned: ${repository}`);
  }
  for (const column of columns) {
    if (reserved.has(column)) {
      throw new Error(`Column is named like a list parameter: ${column}`);
    }
  }
  const softDelete = schema.softDelete === true;
  const managed = new Set(['tenant_id']);
  for (const column of auditColumns)
    if (columns.has(column)) managed.add(column);
  if (softDelete) managed.add('deactivated_at');
  const immutable = new Set([
    ...managed,
    primaryKey[0],
    ...schema.columns.filter(column => column.immutable).map(c => c.name),
  ]);
  const validators = schema.validators;
  const base = validators?.baseValidator;
  const item = itemSchema ?? base;
  if (!item) {
    throw new Error(`Model declares no item schema: ${repository}`);
  }
  // Per-column schemas come from the generated base validator, which knows
  // the database types, and otherwise from the declared item schema, which
  // is all a read-only projection has.
  const shape: Record<string, unknown> =
    base instanceof z.ZodObject
      ? base.shape
      : item instanceof z.ZodObject
        ? item.shape
        : {};
  return {
    repository,
    primaryKey: primaryKey[0],
    columns,
    managed,
    immutable,
    softDelete,
    writable: model instanceof TableModel,
    itemSchema: item,
    insertSchema: validators?.insertValidator,
    updateSchema: validators?.updateValidator,
    columnSchema: name => {
      const column = shape[name];
      return column instanceof z.ZodType ? column : z.string();
    },
  };
}
