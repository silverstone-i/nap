/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { ReadController } from './ReadController.js';
import type { Repositories } from './modelContract.js';

/**
 * Does: Marks a controller whose repository may be written, so createRouter
 * builds the write routes as well as the read routes.
 * Used by: createRouter, which checks for it; a module's controller class
 * extends it for a writable table.
 * Why: the repository must be a TableModel; createRouter checks that at
 * construction so a projection cannot be exposed for writing.
 */
export class WriteController<
  N extends string,
  R extends Repositories<N> = Repositories<N>,
> extends ReadController<N, R> {}
