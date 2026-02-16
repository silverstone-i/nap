/**
 * @file TenantsController — tenant CRUD with provisioning, cascade archive/restore
 * @module tenants/controllers/tenantsController
 *
 * Overrides:
 *   create → inserts tenant record, provisions schema, seeds RBAC, creates admin user
 *   archive → cascades deactivation to all tenant users; rejects root tenant (NAP)
 *   restore → reactivates tenant and all associated users
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import bcrypt from 'bcrypt';
import BaseController from '../../../lib/BaseController.js';
import db from '../../../db/db.js';
import { provisionTenant } from '../../../services/tenantProvisioning.js';
import logger from '../../../utils/logger.js';

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
      billing_email,
      notes,
      admin_email,
      admin_user_name,
      admin_password,
    } = req.body;

    if (!tenant_code || !company) {
      return res.status(400).json({ error: 'tenant_code and company are required' });
    }
    if (!admin_email || !admin_password || !admin_user_name) {
      return res.status(400).json({ error: 'admin_email, admin_user_name, and admin_password are required' });
    }

    const schemaName = (schema_name || tenant_code).toLowerCase();

    try {
      // 1. Insert tenant record
      const tenant = await db('tenants', 'admin').insert({
        tenant_code: tenant_code.toUpperCase(),
        company,
        schema_name: schemaName,
        status: status || 'active',
        tier: tier || 'starter',
        region: region || null,
        allowed_modules: allowed_modules || [],
        max_users: max_users || 5,
        billing_email: billing_email || null,
        notes: notes || null,
        created_by: req.user?.id || null,
      });

      // 2. Provision tenant schema (create schema, run migrations, seed RBAC)
      try {
        await provisionTenant({ schemaName, createdBy: req.user?.id || null });
      } catch (provisionErr) {
        logger.error(`Schema provisioning failed for "${schemaName}":`, { error: provisionErr.message });
        // Rollback: remove the tenant record
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

      // 3. Create admin user for the tenant
      const rounds = parseInt(process.env.BCRYPT_ROUNDS || '12', 10);
      const passwordHash = await bcrypt.hash(admin_password, rounds);

      const adminUser = await db('napUsers', 'admin').insert({
        tenant_id: tenant.id,
        tenant_code: tenant_code.toUpperCase(),
        email: admin_email,
        user_name: admin_user_name,
        password_hash: passwordHash,
        role: 'admin',
        status: 'active',
        tenant_role: 'admin',
        created_by: req.user?.id || null,
      });

      // Return the created tenant with admin user id
      res.status(201).json({ ...tenant, admin_user: adminUser.id });
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

    // Check if this is the root tenant
    const tenantCode = req.query.tenant_code?.toUpperCase?.() || req.query.id;
    if (tenantCode === napsoftTenant) {
      return res.status(403).json({ error: 'Cannot archive the root NapSoft tenant.' });
    }

    // If archiving by id, look up the tenant to check if it's root
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

    req.body.deactivated_at = new Date();

    try {
      // Archive the tenant
      const count = await this.model('admin').updateWhere([{ ...req.query }], req.body);
      if (!count) return res.status(404).json({ error: `${this.errorLabel} not found or already inactive` });

      // Cascade: deactivate all users belonging to this tenant
      const tenantFilter = req.query.tenant_code
        ? { tenant_code: req.query.tenant_code }
        : req.query.id
          ? { tenant_id: req.query.id }
          : {};

      if (Object.keys(tenantFilter).length > 0) {
        await db('napUsers', 'admin').updateWhere([tenantFilter], {
          deactivated_at: new Date(),
          updated_by: req.user?.id || null,
        });
      }

      res.status(200).json({ message: `${this.errorLabel} marked as inactive` });
    } catch (err) {
      this.handleError(err, res, 'archiving', this.errorLabel);
    }
  }

  /**
   * PATCH /restore — reactivate tenant and all associated users
   */
  async restore(req, res) {
    req.body.deactivated_at = null;
    const filters = [{ deactivated_at: { $not: null } }, { ...req.query }];

    try {
      // Restore the tenant
      const count = await this.model('admin').updateWhere(filters, req.body, { includeDeactivated: true });
      if (!count) return res.status(404).json({ error: `${this.errorLabel} not found or already active` });

      // Cascade: reactivate all users belonging to this tenant
      const tenantFilter = req.query.tenant_code
        ? { tenant_code: req.query.tenant_code }
        : req.query.id
          ? { tenant_id: req.query.id }
          : {};

      if (Object.keys(tenantFilter).length > 0) {
        await db('napUsers', 'admin').updateWhere(
          [{ deactivated_at: { $not: null } }, tenantFilter],
          { deactivated_at: null, updated_by: req.user?.id || null },
          { includeDeactivated: true },
        );
      }

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
}

const instance = new TenantsController();

export { TenantsController };
export default instance;
