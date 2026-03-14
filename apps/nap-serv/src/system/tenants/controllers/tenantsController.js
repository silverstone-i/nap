/**
 * @file TenantsController — tenant CRUD with provisioning, cascade archive/restore
 * @module tenants/controllers/tenantsController
 *
 * Overrides:
 *   create → inserts tenant record, provisions schema, seeds RBAC, creates admin user
 *   archive → cascades deactivation to all tenant users; rejects root tenant (NAP)
 *   restore → reactivates tenant (users remain archived until individually restored)
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import bcrypt from 'bcrypt';
import BaseController from '../../../lib/BaseController.js';
import db, { pgp } from '../../../db/db.js';
import { provisionTenant } from '../../../services/tenantProvisioning.js';
import logger from '../../../lib/logger.js';

class TenantsController extends BaseController {
  constructor() {
    super('tenants');
  }

  /**
   * Override getSchema — tenants always live in the admin schema.
   */
  getSchema(_req) {
    return 'admin';
  }

  /**
   * POST / — create tenant, provision schema, create admin user
   *
   * Body: { tenant_code, company, schema_name?, status?, tier?, region?,
   *         allowed_modules?, max_users?, notes?,
   *         admin_email, admin_password }
   */
  async create(req, res) {
    const {
      tenant_code,
      company,
      schema_name,
      status,
      tier,
      region,
      allowed_modules,
      max_users,
      notes,
      admin_first_name,
      admin_last_name,
      admin_email,
      admin_password,
    } = req.body;

    if (!tenant_code || !company) {
      return res.status(400).json({ error: 'tenant_code and company are required' });
    }
    if (!admin_first_name || !admin_last_name) {
      return res.status(400).json({ error: 'admin_first_name and admin_last_name are required' });
    }
    if (!admin_email || !admin_password) {
      return res.status(400).json({ error: 'admin_email and admin_password are required' });
    }

    const schemaName = (schema_name || tenant_code).toLowerCase();

    const SCHEMA_NAME_RE = /^[a-z][a-z0-9_]*$/;
    if (!SCHEMA_NAME_RE.test(schemaName) || schemaName.length > 63) {
      return res.status(400).json({
        error: 'schema_name must start with a letter, contain only lowercase letters/digits/underscores, and not exceed 63 characters',
      });
    }

    const upperCode = tenant_code.toUpperCase();

    try {
      // 1. Insert tenant record
      const tenant = await db('tenants', 'admin').insert({
        tenant_code: upperCode,
        company,
        schema_name: schemaName,
        status: status || 'active',
        tier: tier || 'starter',
        region: region || null,
        allowed_modules: allowed_modules || [],
        max_users: max_users || 5,
        notes: notes || null,
        created_by: req.user?.id || null,
      });

      // 2. Provision tenant schema (create schema, run migrations, seed RBAC)
      try {
        await provisionTenant({ schemaName, tenantCode: upperCode, createdBy: req.user?.id || null });
      } catch (provisionErr) {
        logger.error(`Schema provisioning failed for "${schemaName}":`, { error: provisionErr.message });
        // Rollback: soft-delete the tenant record
        try {
          await db('tenants', 'admin').updateWhere(
            [{ id: tenant.id }],
            { deactivated_at: new Date(), updated_by: req.user?.id || null },
          );
        } catch {
          /* best effort */
        }
        return res.status(500).json({ error: `Schema provisioning failed: ${provisionErr.message}` });
      }

      // 3. Create admin employee + nap_users login in a single transaction
      //    PRD §3.2.1: employee record first (roles + is_app_user), then
      //    nap_users linked via entity_type/entity_id.
      const rounds = parseInt(process.env.BCRYPT_ROUNDS || '12', 10);
      const passwordHash = await bcrypt.hash(admin_password, rounds);
      const actorId = req.user?.id || null;
      const sch = pgp.as.name(schemaName);

      const adminUser = await db.tx(async (t) => {
        // 3a. Create employee record in the tenant schema
        const emp = await t.one(
          `INSERT INTO ${sch}.employees
             (tenant_id, first_name, last_name, email, roles, is_app_user, is_primary_contact, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING *`,
          [tenant.id, admin_first_name, admin_last_name, admin_email, '{admin}', true, true, actorId],
        );

        // 3b. Create nap_users login linked to the employee
        const user = await t.one(
          `INSERT INTO admin.nap_users
             (tenant_id, entity_type, entity_id, email, password_hash, status, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING *`,
          [tenant.id, 'employee', emp.id, admin_email, passwordHash, 'active', actorId],
        );

        return user;
      });

      // Return the created tenant with admin user id
      res.status(201).json({ ...tenant, admin_user_id: adminUser.id });
    } catch (err) {
      this.handleError(err, res, 'creating', this.errorLabel);
    }
  }

  /**
   * DELETE /archive — soft-delete tenant and cascade to all users.
   * Rejects archival of the root tenant (NAP).
   */
  async archive(req, res) {
    const napsoftTenant = (process.env.NAPSOFT_TENANT || 'NAP').toUpperCase();

    // Check by tenant_code query param
    const tenantCode = req.query.tenant_code?.toUpperCase?.();
    if (tenantCode === napsoftTenant) {
      return res.status(403).json({ error: 'Cannot archive the root NapSoft tenant.' });
    }

    // Check by id if provided
    if (req.query.id) {
      try {
        const t = await this.model('admin').findById(req.query.id);
        if (t && t.tenant_code?.toUpperCase() === napsoftTenant) {
          return res.status(403).json({ error: 'Cannot archive the root NapSoft tenant.' });
        }
      } catch {
        /* proceed, will fail on updateWhere if not found */
      }
    }

    const now = new Date();
    req.body.deactivated_at = now;

    try {
      // Archive the tenant
      const count = await this.model('admin').updateWhere([{ ...req.query }], req.body);
      if (!count) return res.status(404).json({ error: `${this.errorLabel} not found or already inactive` });

      // Cascade: deactivate and lock all currently-active users
      if (req.query.id) {
        await db.none(
          `UPDATE admin.nap_users SET deactivated_at = $1, status = 'locked', updated_by = $2
           WHERE tenant_id = $3 AND deactivated_at IS NULL`,
          [now, req.user?.id || null, req.query.id],
        );
      } else if (req.query.tenant_code) {
        await db.none(
          `UPDATE admin.nap_users SET deactivated_at = $1, status = 'locked', updated_by = $2
           WHERE tenant_id = (SELECT id FROM admin.tenants WHERE tenant_code = $3)
             AND deactivated_at IS NULL`,
          [now, req.user?.id || null, req.query.tenant_code],
        );
      }

      res.status(200).json({ message: `${this.errorLabel} marked as inactive` });
    } catch (err) {
      this.handleError(err, res, 'archiving', this.errorLabel);
    }
  }

  /**
   * PATCH /restore — reactivate tenant only (users remain archived)
   */
  async restore(req, res) {
    req.body.deactivated_at = null;
    const filters = [{ deactivated_at: { $not: null } }, { ...req.query }];

    try {
      const count = await this.model('admin').updateWhere(filters, req.body, { includeDeactivated: true });
      if (!count) return res.status(404).json({ error: `${this.errorLabel} not found or already active` });

      res.status(200).json({ message: `${this.errorLabel} marked as active` });
    } catch (err) {
      this.handleError(err, res, 'restoring', this.errorLabel);
    }
  }

  /**
   * GET /:id/modules — get tenant's allowed modules
   */
  async getAllowedModules(req, res) {
    try {
      const tenant = await this.model('admin').findById(req.params.id);
      if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
      res.json({ allowed_modules: tenant.allowed_modules });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * GET /:id/contacts — primary and billing contacts with their primary phone/address
   *
   * Queries the tenant's schema for employees flagged as is_primary_contact
   * or is_billing_contact, joining their primary phone number and address
   * via the polymorphic sources table.
   */
  async getContacts(req, res) {
    try {
      const tenant = await this.model('admin').findById(req.params.id);
      if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

      const sch = pgp.as.name(tenant.schema_name);

      const contacts = await db.any(
        `SELECT e.id, e.first_name, e.last_name, e.email,
                e.is_primary_contact, e.is_billing_contact,
                pn.phone_number AS primary_phone, pn.phone_type AS primary_phone_type,
                a.address_line_1, a.address_line_2, a.city,
                a.state_province, a.postal_code, a.country_code
         FROM ${sch}.employees e
         LEFT JOIN ${sch}.sources s
           ON s.table_id = e.id AND s.source_type = 'employee' AND s.deactivated_at IS NULL
         LEFT JOIN ${sch}.phone_numbers pn
           ON pn.source_id = s.id AND pn.is_primary = true AND pn.deactivated_at IS NULL
         LEFT JOIN ${sch}.addresses a
           ON a.source_id = s.id AND a.is_primary = true AND a.deactivated_at IS NULL
         WHERE (e.is_primary_contact = true OR e.is_billing_contact = true)
           AND e.deactivated_at IS NULL`,
      );

      const primary = contacts.filter((c) => c.is_primary_contact);
      const billing = contacts.filter((c) => c.is_billing_contact);

      res.json({ primary, billing });
    } catch (err) {
      this.handleError(err, res, 'fetching contacts for', this.errorLabel);
    }
  }
}

const instance = new TenantsController();

export { TenantsController };
export default instance;
