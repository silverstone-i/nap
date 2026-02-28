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
 *   archive  → prevents self-archival
 *   restore  → checks parent tenant is active before restoring
 * Standard POST is disabled; must use /register endpoint.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import bcrypt from 'bcrypt';
import BaseController from '../../../lib/BaseController.js';
import db from '../../../db/db.js';
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
        await db.none('UPDATE admin.nap_users SET password_hash = $/hash/ WHERE id = $/id/', { hash, id: userId });
      }

      // Update scalar user columns (if any besides password)
      if (Object.keys(userChanges).length) {
        const count = await this.model('admin').updateWhere([{ ...req.query }], userChanges);
        if (!count && !password) return res.status(404).json({ error: `${this.errorLabel} not found` });
      }

      res.json({ message: `${this.errorLabel} updated` });
    } catch (err) {
      if (err.name === 'SchemaDefinitionError') err.message = 'Invalid input data';
      this.handleError(err, res, 'updating', this.errorLabel);
    }
  }

  /**
   * DELETE /archive — prevents self-archival
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

    req.body.deactivated_at = new Date();

    try {
      const count = await this.model('admin').updateWhere([{ ...req.query }], req.body);
      if (!count) return res.status(404).json({ error: `${this.errorLabel} not found or already inactive` });
      res.status(200).json({ message: `${this.errorLabel} marked as inactive` });
    } catch (err) {
      this.handleError(err, res, 'archiving', this.errorLabel);
    }
  }

  /**
   * PATCH /restore — checks parent tenant is active before restoring user
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

      // Restore user
      req.body.deactivated_at = null;
      const count = await this.model('admin').updateWhere(
        [{ deactivated_at: { $not: null } }, filter],
        req.body,
        { includeDeactivated: true },
      );
      if (!count) return res.status(404).json({ error: `${this.errorLabel} not found or already active` });

      res.status(200).json({ message: `${this.errorLabel} marked as active` });
    } catch (err) {
      this.handleError(err, res, 'restoring', this.errorLabel);
    }
  }
}

const instance = new NapUsersController();

export { NapUsersController };
export default instance;
