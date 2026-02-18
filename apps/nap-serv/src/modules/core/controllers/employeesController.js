/**
 * @file Employees controller — auto-creates a sources record on employee creation,
 *       manages is_app_user lifecycle (provision/archive/restore nap_users records)
 * @module core/controllers/employeesController
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import bcrypt from 'bcrypt';
import crypto from 'node:crypto';
import BaseController from '../../../lib/BaseController.js';
import db from '../../../db/db.js';
import { invalidateUserPermissions } from '../../../utils/rbacCacheInvalidation.js';
import logger from '../../../utils/logger.js';

class EmployeesController extends BaseController {
  constructor() {
    super('employees');
  }

  /**
   * POST / — insert an employee and auto-create a linked sources record.
   * If is_app_user is true, also provisions a nap_users login account.
   */
  async create(req, res) {
    try {
      const schema = this.getSchema(req);

      // Inject tenant_id from authenticated session
      if (!req.body.tenant_id && req.user?.tenant_id) {
        req.body.tenant_id = req.user.tenant_id;
      }

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

      // 4. If is_app_user, create the nap_users login record
      if (record.is_app_user && record.email) {
        await this.#provisionAppUser(record, schema, req);
      }

      res.status(201).json(record);
    } catch (err) {
      if (err.name === 'SchemaDefinitionError') err.message = 'Invalid input data';
      this.handleError(err, res, 'creating', this.errorLabel);
    }
  }

  /**
   * PUT /update — update employee and manage is_app_user toggle.
   */
  async update(req, res) {
    const schema = this.getSchema(req);
    const employeeId = req.query.id;

    if (!employeeId) {
      return res.status(400).json({ error: 'id query parameter is required' });
    }

    try {
      // Fetch employee BEFORE update to detect is_app_user toggle
      const before = await this.model(schema).findById(employeeId);
      if (!before) return res.status(404).json({ error: `${this.errorLabel} not found` });

      // Apply the standard update
      const count = await this.model(schema).updateWhere([{ id: employeeId }], req.body);
      if (!count) return res.status(404).json({ error: `${this.errorLabel} not found` });

      // Detect is_app_user toggle
      const wasAppUser = !!before.is_app_user;
      const isNowAppUser = req.body.is_app_user !== undefined ? !!req.body.is_app_user : wasAppUser;
      const email = req.body.email || before.email;

      if (!wasAppUser && isNowAppUser) {
        // Toggled ON: provision or restore nap_user
        if (!email) {
          return res.status(400).json({ error: 'Email is required to enable app user access' });
        }
        const updatedEmployee = { ...before, ...req.body, id: before.id, email };
        await this.#provisionAppUser(updatedEmployee, schema, req);
      } else if (wasAppUser && !isNowAppUser) {
        // Toggled OFF: archive the linked nap_user
        await this.#archiveAppUser(before.id, req);
      }

      res.json({ updatedRecords: count });
    } catch (err) {
      if (err.name === 'SchemaDefinitionError') err.message = 'Invalid input data';
      this.handleError(err, res, 'updating', this.errorLabel);
    }
  }

  /**
   * DELETE /archive — soft-delete employee, cascade to nap_users if is_app_user.
   */
  async archive(req, res) {
    const schema = this.getSchema(req);
    const employeeId = req.query.id;

    req.body.deactivated_at = new Date();
    try {
      // Cascade to nap_user before archiving employee
      if (employeeId) {
        const employee = await this.model(schema).findById(employeeId);
        if (employee?.is_app_user) {
          await this.#archiveAppUser(employee.id, req);
        }
      }

      const filters = Array.isArray(req.query) ? req.query : [{ ...req.query }];
      const count = await this.model(schema).updateWhere(filters, req.body);
      if (!count) return res.status(404).json({ error: `${this.errorLabel} not found or already inactive` });
      res.status(200).json({ message: `${this.errorLabel} marked as inactive` });
    } catch (err) {
      this.handleError(err, res, 'archiving', this.errorLabel);
    }
  }

  /**
   * PATCH /restore — reactivate employee, cascade to nap_users if is_app_user.
   */
  async restore(req, res) {
    const schema = this.getSchema(req);
    const employeeId = req.query.id;

    req.body.deactivated_at = null;
    const filters = [{ deactivated_at: { $not: null } }, { ...req.query }];

    try {
      const count = await this.model(schema).updateWhere(filters, req.body, { includeDeactivated: true });
      if (!count) return res.status(404).json({ error: `${this.errorLabel} not found or already active` });

      // Cascade restore to nap_user if employee is an app user
      if (employeeId) {
        const employee = await this.model(schema).findById(employeeId);
        if (employee?.is_app_user) {
          await this.#restoreAppUser(employee.id, req);
        }
      }

      res.status(200).json({ message: `${this.errorLabel} marked as active` });
    } catch (err) {
      this.handleError(err, res, 'restoring', this.errorLabel);
    }
  }

  /**
   * Create or restore a nap_users record for an employee gaining app access.
   */
  async #provisionAppUser(employee, schemaName, req) {
    const tenantCode = req.user?.tenant_code;
    if (!tenantCode) throw new Error('Tenant context required to provision app user');

    const tenant = await db.oneOrNone(
      `SELECT id, tenant_code FROM admin.tenants
       WHERE UPPER(tenant_code) = $1 AND deactivated_at IS NULL`,
      [tenantCode.toUpperCase()],
    );
    if (!tenant) throw new Error('Tenant not found or inactive');

    // Check if an archived nap_user already exists for this employee
    const existing = await db.oneOrNone(
      `SELECT id, deactivated_at FROM admin.nap_users WHERE employee_id = $1`,
      [employee.id],
    );

    const tempPassword = crypto.randomBytes(12).toString('base64url');
    const rounds = parseInt(process.env.BCRYPT_ROUNDS || '12', 10);
    const passwordHash = await bcrypt.hash(tempPassword, rounds);

    if (existing) {
      // Restore the archived record
      await db.none(
        `UPDATE admin.nap_users
         SET deactivated_at = NULL, status = 'invited',
             password_hash = $1, email = $2, full_name = $3,
             updated_by = $4
         WHERE id = $5`,
        [
          passwordHash,
          employee.email,
          `${employee.first_name} ${employee.last_name}`,
          req.user?.id || null,
          existing.id,
        ],
      );
      logger.info(`Restored nap_user ${existing.id} for employee ${employee.id}`);
      return existing.id;
    }

    // Create a new nap_users record
    const user = await db('napUsers', 'admin').insert({
      tenant_id: tenant.id,
      tenant_code: tenant.tenant_code,
      email: employee.email,
      user_name: employee.email,
      full_name: `${employee.first_name} ${employee.last_name}`,
      password_hash: passwordHash,
      role: 'member',
      status: 'invited',
      employee_id: employee.id,
      created_by: req.user?.id || null,
    });

    logger.info(`Provisioned nap_user ${user.id} for employee ${employee.id}`);
    return user.id;
  }

  /**
   * Archive (soft-delete) the nap_users record linked to an employee.
   */
  async #archiveAppUser(employeeId, req) {
    const napUser = await db.oneOrNone(
      `SELECT id FROM admin.nap_users WHERE employee_id = $1 AND deactivated_at IS NULL`,
      [employeeId],
    );
    if (napUser) {
      await db.none(
        `UPDATE admin.nap_users SET deactivated_at = NOW(), updated_by = $1 WHERE id = $2`,
        [req.user?.id || null, napUser.id],
      );
      const tenantCode = req.user?.tenant_code;
      if (tenantCode) {
        await invalidateUserPermissions(napUser.id, tenantCode.toLowerCase());
      }
      logger.info(`Archived nap_user ${napUser.id} for employee ${employeeId}`);
    }
  }

  /**
   * Restore the nap_users record linked to an employee.
   */
  async #restoreAppUser(employeeId, req) {
    const napUser = await db.oneOrNone(
      `SELECT id FROM admin.nap_users WHERE employee_id = $1 AND deactivated_at IS NOT NULL`,
      [employeeId],
    );
    if (napUser) {
      await db.none(
        `UPDATE admin.nap_users SET deactivated_at = NULL, updated_by = $1 WHERE id = $2`,
        [req.user?.id || null, napUser.id],
      );
      logger.info(`Restored nap_user ${napUser.id} for employee ${employeeId}`);
    }
  }
}

const instance = new EmployeesController();
export default instance;
export { EmployeesController };
