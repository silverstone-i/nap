'use strict';

/*
 * Auto-generates CRUD unit tests for a controller based on a schema definition.
 */

import { jest } from '@jest/globals';
import { runControllerCrudUnitTests } from './runControllerCrudUnitTests.js';
import { TableModel } from 'pg-schemata';
import { db, pgp } from '../../src/db/db.js';

/**
 * Generates standardized CRUD unit tests for a given schema and controller class.
 * @param {object} schema - The schema definition (must include `table`).
 * @param {Function} ControllerClass - The controller class constructor.
 * @param {object} [options] - Optional overrides and custom tests.
 * @param {object} [options.mockOverrides] - Functions to override or extend default mocks.
 * @param {Function} [options.extraTests] - Additional custom tests to run.
 */
export function generateCrudTestsForSchema(
  schema,
  ControllerClass,
  options = {}
) {
  const model = options.useRealModel
    ? new TableModel(db, pgp, schema)
    : {
        insert: jest.fn(),
        findAll: jest.fn(),
        findById: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        ...(options.mockOverrides || {}),
      };

  class TestController extends ControllerClass {
    constructor() {
      super();
      this.model = model;
    }
  }
  const controller = new TestController();

  if (options.useRealModel) {
    controller.model = model;
  }

  runControllerCrudUnitTests({
    name: schema.table,
    controller,
    model,
    extraTests: options.extraTests || (() => {}),
  });
}
