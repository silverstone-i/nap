/**
 * @file Employees controller — auto-creates a sources record on employee creation
 * @module core/controllers/employeesController
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../lib/BaseController.js';
import db from '../../../db/db.js';

class EmployeesController extends BaseController {
  constructor() {
    super('employees');
  }

  /**
   * POST / — insert an employee and auto-create a linked sources record.
   * Runs inside a transaction so both inserts succeed or both roll back.
   */
  async create(req, res) {
    try {
      const schema = this.getSchema(req);

      const record = await db.tx(async (t) => {
        const employeesModel = this.model(schema);
        employeesModel.tx = t;

        // 1. Insert the employee
        const employee = await employeesModel.insert(req.body);

        // 2. Auto-create a sources record linking to this employee
        const sourcesModel = db('sources', schema);
        sourcesModel.tx = t;
        const source = await sourcesModel.insert({
          tenant_id: employee.tenant_id,
          table_id: employee.id,
          source_type: 'employee',
          label: `${employee.first_name} ${employee.last_name}`,
          created_by: req.body.created_by || null,
        });

        // 3. Link the source back to the employee
        await t.none(
          `UPDATE ${schema}.employees SET source_id = $1, updated_by = $2 WHERE id = $3`,
          [source.id, req.body.created_by || null, employee.id],
        );

        return { ...employee, source_id: source.id };
      });

      res.status(201).json(record);
    } catch (err) {
      if (err.name === 'SchemaDefinitionError') err.message = 'Invalid input data';
      this.handleError(err, res, 'creating', this.errorLabel);
    }
  }
}

const instance = new EmployeesController();
export default instance;
export { EmployeesController };
