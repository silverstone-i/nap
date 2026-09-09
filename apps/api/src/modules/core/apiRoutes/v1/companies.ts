/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import {
  createRouter,
  standardActions,
} from '../../../../framework/createRouter.js';
import { WriteController } from '../../../../framework/WriteController.js';
import { resourcePolicy } from '../../../../services/authorization.js';
import type { CellHandle } from '../../../../db/cell/repositories.js';
/** Does: Registers scoped companies operations. Called by: route composition. */
export default function companiesRouter(db: CellHandle) {
  return createRouter(new WriteController(db, 'companies'), {
    module: 'core',
    router: 'companies',
    routes: Object.fromEntries(
      standardActions.map(a => [
        a,
        ['list', 'read', 'create', 'update', 'archive'].includes(a),
      ])
    ),
    authorize: (tx, session, action) =>
      resourcePolicy(tx, session, 'core::companies', action),
  });
}
