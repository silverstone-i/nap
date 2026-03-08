/**
 * @file NapUsersController — user CRUD with registration, safe archive/restore
 * @module tenants/controllers/napUsersController
 *
 * nap_users is a pure identity table (id, tenant_id, entity_type, entity_id,
 * email, password_hash, status). No role, user_name, full_name, or tenant_code
 * columns — those live on entity records (Phase 5).
 *
 * Overrides:
 *   register → validates tenant active, bcrypt hashes password, creates nap_user
 *   getById  → strips password_hash
 *   update   → supports password reset via raw SQL
 *   archive  → prevents self-archival, sets status='locked', cascades to linked entity
 *   restore  → checks parent tenant is active, sets status='active', cascades to linked entity
 * Standard POST is disabled; must use /register endpoint.
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import bcrypt from 'bcrypt';
import BaseController from '../../../lib/BaseController.js';
import db, { pgp } from '../../../db/db.js';
import logger from '../../../lib/logger.js';

class NapUsersController extends BaseController {
  constructor() {
    super('napUsers');
  }

  /**
   * Override getSchema — nap_users always live in the admin schema.
   */
  getSchema(_req) {
    return 'admin';
  }

  /* ── Helpers ──────────────────────────────────────────────── */

  #stripPassword(record) {
    if (!record) return record;
    const { password_hash: _ph, ...safe } = record;
    return safe;
  }

  #stripPasswords(data) {
    if (Array.isArray(data)) return data.map((r) => this.#stripPassword(r));
    if (data?.rows) return { ...data, rows: data.rows.map((r) => this.#stripPassword(r)) };
    return this.#stripPassword(data);
  }

  /**
   * POST /register — register a new user with password hashing.
   *
   * Body: { tenant_code, email, password }
   * Entity validation deferred to Phase 5 when entity tables exist.
   */
  register = async (req, res) => {
    const { tenant_code, email, password } = req.body;

    if (!tenant_code || !email || !password) {
      return res.status(400).json({ error: 'tenant_code, email, and password are required' });
    }

    try {
      // Validate tenant exists and is active
      const tenant = await db('tenants', 'admin').findOneBy([
        { tenant_code: tenant_code.toUpperCase(), deactivated_at: null },
      ]);

      if (!tenant) {
        return res.status(400).json({ error: 'Invalid or inactive tenant' });
      }

      // Hash password
      const rounds = parseInt(process.env.BCRYPT_ROUNDS || '12', 10);
      const password_hash = await bcrypt.hash(password, rounds);

      // Create user record (pure identity table)
      const user = await db('napUsers', 'admin').insert({
        tenant_id: tenant.id,
        email,
        password_hash,
        status: 'active',
        created_by: req.user?.id || null,
      });

      // Return user without password_hash
      const { password_hash: _ph, ...safeUser } = user;
      res.status(201).json({ message: 'User registered successfully', user: safeUser });
    } catch (err) {
      if (err.code === '23505') {
        return res.status(409).json({ error: 'Email already in use' });
      }
      if (err.name === 'SchemaDefinitionError') {
        return res.status(400).json({ error: 'Invalid input data', details: err.cause });
      }
      logger.error('Error registering user:', { error: err.message });
      res.status(500).json({ error: 'Error registering user' });
    }
  };

  /**
   * Override GET / to strip password_hash from results
   */
  async get(req, res) {
    const origJson = res.json.bind(res);
    res.json = (data) => origJson(this.#stripPasswords(data));
    return super.get(req, res);
  }

  /**
   * GET /:id — fetch user record, strip password_hash
   */
  async getById(req, res) {
    try {
      const record = await this.model('admin').findById(req.params.id);
      if (!record) return res.status(404).json({ error: `${this.errorLabel} not found` });
      res.json(this.#stripPassword(record));
    } catch (err) {
      this.handleError(err, res, 'fetching', this.errorLabel);
    }
  }

  /**
   * Override GET /where to strip password_hash from results
   */
  async getWhere(req, res) {
    const origJson = res.json.bind(res);
    res.json = (data) => origJson(this.#stripPasswords(data));
    return super.getWhere(req, res);
  }

  /**
   * PUT /update — update user fields. Password reset via raw SQL to avoid
   * ColumnSet reset of all columns.
   */
  async update(req, res) {
    const { password, ...userChanges } = req.body;

    try {
      const userId = req.query.id;

      // Handle password reset if provided
      let pwUpdated = false;
      if (password) {
        const pwRules = [
          { test: (p) => p.length >= 8, msg: 'at least 8 characters' },
          { test: (p) => /[A-Z]/.test(p), msg: 'an uppercase letter' },
          { test: (p) => /[a-z]/.test(p), msg: 'a lowercase letter' },
          { test: (p) => /[0-9]/.test(p), msg: 'a digit' },
          { test: (p) => /[^A-Za-z0-9]/.test(p), msg: 'a special character' },
        ];
        const failures = pwRules.filter((r) => !r.test(password)).map((r) => r.msg);
        if (failures.length) {
          return res.status(400).json({ error: `Password must contain ${failures.join(', ')}` });
        }
        const rounds = parseInt(process.env.BCRYPT_ROUNDS || '12', 10);
        const hash = await bcrypt.hash(password, rounds);
        const pwResult = await db.result(
          'UPDATE admin.nap_users SET password_hash = $/hash/, updated_by = $/updatedBy/, updated_at = now() WHERE id = $/id/ AND deactivated_at IS NULL',
          { hash, id: userId, updatedBy: req.user?.id || null },
        );
        pwUpdated = pwResult.rowCount > 0;
      }

      // Update scalar user columns via raw SQL to avoid ColumnSet resetting
      // entity_type / entity_id to NULL (their schema defaults).
      // Only 'status' is an allowed mutable field from the UI.
      const ALLOWED_FIELDS = new Set(['status']);
      const safeChanges = Object.entries(userChanges).filter(([k]) => ALLOWED_FIELDS.has(k));

      if (safeChanges.length) {
        const setClauses = safeChanges.map(([k], i) => `${pgp.as.name(k)} = $${i + 1}`);
        setClauses.push(`updated_by = $${safeChanges.length + 1}`);
        setClauses.push(`updated_at = now()`);
        const values = [...safeChanges.map(([, v]) => v), req.user?.id || null, userId];

        const count = await db.result(
          `UPDATE admin.nap_users SET ${setClauses.join(', ')} WHERE id = $${safeChanges.length + 2} AND deactivated_at IS NULL`,
          values,
        );
        if (!count.rowCount && !pwUpdated) return res.status(404).json({ error: `${this.errorLabel} not found or deactivated` });
      } else if (password && !pwUpdated) {
        return res.status(404).json({ error: `${this.errorLabel} not found or deactivated` });
      }

      res.json({ message: `${this.errorLabel} updated` });
    } catch (err) {
      if (err.name === 'SchemaDefinitionError') err.message = 'Invalid input data';
      this.handleError(err, res, 'updating', this.errorLabel);
    }
  }

  /**
   * DELETE /archive — prevents self-archival, sets status='locked',
   * cascades to archive linked entity (e.g. employee) in tenant schema.
   */
  async archive(req, res) {
    const targetId = req.query.id;
    const targetEmail = req.query.email;

    // Prevent self-archival
    if (targetId && targetId === req.user?.id) {
      return res.status(403).json({ error: 'Cannot archive the currently logged-in user' });
    }
    if (targetEmail && targetEmail === req.user?.email) {
      return res.status(403).json({ error: 'Cannot archive the currently logged-in user' });
    }

    try {
      // Look up the nap_user to cascade to linked entity
      const filter = targetId ? { id: targetId } : targetEmail ? { email: targetEmail } : { ...req.query };
      const napUser = await this.model('admin').findOneBy([filter]);
      if (!napUser) return res.status(404).json({ error: `${this.errorLabel} not found or already inactive` });

      // Archive the nap_user with status='locked'
      await db.none(
        `UPDATE admin.nap_users
         SET deactivated_at = NOW(), status = 'locked', updated_by = $1, updated_at = NOW()
         WHERE id = $2`,
        [req.user?.id || null, napUser.id],
      );

      // Cascade to linked entity in tenant schema
      if (napUser.entity_type && napUser.entity_id) {
        await this.#archiveLinkedEntity(napUser, req);
      }

      res.status(200).json({ message: `${this.errorLabel} marked as inactive` });
    } catch (err) {
      this.handleError(err, res, 'archiving', this.errorLabel);
    }
  }

  /**
   * PATCH /restore — checks parent tenant is active, sets status='active',
   * cascades to restore linked entity in tenant schema.
   */
  async restore(req, res) {
    const filter = req.query.email
      ? { email: req.query.email }
      : req.query.id
        ? { id: req.query.id }
        : null;
    if (!filter) {
      return res.status(400).json({ error: 'email or id query parameter required' });
    }

    try {
      const user = await this.model('admin').findOneBy([filter], { includeDeactivated: true });
      if (!user) return res.status(404).json({ error: 'User not found' });

      // Check parent tenant is active
      const tenant = await db('tenants', 'admin').findOneBy([{ id: user.tenant_id }]);
      if (!tenant) {
        return res.status(403).json({ error: 'Tenant is deactivated. Restore the tenant first.' });
      }

      // Restore user with status='active'
      await db.none(
        `UPDATE admin.nap_users
         SET deactivated_at = NULL, status = 'active', updated_by = $1, updated_at = NOW()
         WHERE id = $2`,
        [req.user?.id || null, user.id],
      );

      // Cascade to restore linked entity in tenant schema
      if (user.entity_type && user.entity_id) {
        await this.#restoreLinkedEntity(user, tenant, req);
      }

      res.status(200).json({ message: `${this.errorLabel} marked as active` });
    } catch (err) {
      this.handleError(err, res, 'restoring', this.errorLabel);
    }
  }

  /* ── Private helpers ──────────────────────────────────── */

  /**
   * Archive the entity (e.g. employee) linked to a nap_user in its tenant schema.
   */
  async #archiveLinkedEntity(napUser, req) {
    const tenant = await db('tenants', 'admin').findOneBy([{ id: napUser.tenant_id }]);
    if (!tenant?.schema_name) return;

    const table = this.#entityTable(napUser.entity_type);
    if (!table) return;

    await db.none(
      `UPDATE ${pgp.as.name(tenant.schema_name)}.${pgp.as.name(table)}
       SET deactivated_at = NOW(), updated_by = $1, updated_at = NOW()
       WHERE id = $2 AND deactivated_at IS NULL`,
      [req.user?.id || null, napUser.entity_id],
    );
    logger.info(`Cascaded archive to ${tenant.schema_name}.${table} ${napUser.entity_id}`);
  }

  /**
   * Restore the entity (e.g. employee) linked to a nap_user in its tenant schema.
   */
  async #restoreLinkedEntity(napUser, tenant, req) {
    if (!tenant?.schema_name) return;

    const table = this.#entityTable(napUser.entity_type);
    if (!table) return;

    await db.none(
      `UPDATE ${pgp.as.name(tenant.schema_name)}.${pgp.as.name(table)}
       SET deactivated_at = NULL, updated_by = $1, updated_at = NOW()
       WHERE id = $2 AND deactivated_at IS NOT NULL`,
      [req.user?.id || null, napUser.entity_id],
    );
    logger.info(`Cascaded restore to ${tenant.schema_name}.${table} ${napUser.entity_id}`);
  }

  /**
   * Map entity_type to its table name.
   */
  #entityTable(entityType) {
    const map = { employee: 'employees', vendor: 'vendors', client: 'clients', contact: 'contacts' };
    return map[entityType] || null;
  }
}

const instance = new NapUsersController();

export { NapUsersController };
export default instance;
