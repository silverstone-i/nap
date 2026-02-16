/**
 * @file NapUsersController — user CRUD with registration, safe archive/restore
 * @module tenants/controllers/napUsersController
 *
 * Overrides:
 *   register → custom registration with bcrypt hashing, address/phone creation
 *   archive → prevents self-archival and super_user archival
 *   restore → checks parent tenant is active before restoring
 * Standard POST is disabled; must use /register endpoint.
 * Never returns password_hash in responses.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import bcrypt from 'bcrypt';
import BaseController from '../../../lib/BaseController.js';
import db from '../../../db/db.js';

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

  /**
   * POST /register — register a new user with password hashing
   */
  register = async (req, res) => {
    const {
      tenant_code,
      email,
      password,
      user_name,
      full_name,
      role,
      phone_1,
      phone_1_type,
      phone_2,
      phone_2_type,
      addresses,
      tax_id,
      notes,
    } = req.body;

    if (!tenant_code || !email || !password || !user_name) {
      return res.status(400).json({ message: 'Missing required fields: tenant_code, email, password, user_name' });
    }

    try {
      // Validate tenant exists and is active
      const tenant = await db('tenants', 'admin').findOneBy([
        { tenant_code, deactivated_at: { $is: null } },
      ]);

      if (!tenant) {
        return res.status(400).json({ message: 'Invalid or inactive tenant' });
      }

      const rounds = parseInt(process.env.BCRYPT_ROUNDS || '12', 10);
      const password_hash = await bcrypt.hash(password, rounds);

      // Create user record
      const user = await db('napUsers', 'admin').insert({
        tenant_id: tenant.id,
        tenant_code,
        email,
        password_hash,
        user_name,
        full_name: full_name || null,
        role: role || 'member',
        status: 'active',
        tax_id: tax_id || null,
        notes: notes || null,
        created_by: req.user?.id || null,
      });

      // Create phone records if provided
      if (phone_1) {
        await db('napUserPhones', 'admin').insert({
          user_id: user.id,
          phone_number: phone_1,
          phone_type: phone_1_type || 'cell',
          is_primary: true,
          created_by: req.user?.id || null,
        });
      }
      if (phone_2) {
        await db('napUserPhones', 'admin').insert({
          user_id: user.id,
          phone_number: phone_2,
          phone_type: phone_2_type || 'cell',
          is_primary: false,
          created_by: req.user?.id || null,
        });
      }

      // Create address records if provided
      if (Array.isArray(addresses)) {
        for (const addr of addresses) {
          await db('napUserAddresses', 'admin').insert({
            user_id: user.id,
            address_type: addr.address_type || 'home',
            address_line_1: addr.address_line_1 || null,
            address_line_2: addr.address_line_2 || null,
            address_line_3: addr.address_line_3 || null,
            city: addr.city || null,
            state_province: addr.state_province || null,
            postal_code: addr.postal_code || null,
            country_code: addr.country_code || null,
            is_primary: addr.is_primary || false,
            created_by: req.user?.id || null,
          });
        }
      }

      // Return user without password_hash
      const { password_hash: _ph, ...safeUser } = user;
      res.status(201).json({ message: 'User registered successfully', user: safeUser });
    } catch (err) {
      if (err.code === '23505') {
        return res.status(409).json({ message: 'Email already in use' });
      }
      if (err.name === 'SchemaDefinitionError') {
        return res.status(400).json({ message: 'Invalid input data', details: err.cause });
      }
      res.status(500).json({ message: 'Error registering user' });
    }
  };

  /**
   * Override GET / and GET /where to strip password_hash from results
   */
  async get(req, res) {
    const origJson = res.json.bind(res);
    res.json = (data) => origJson(this.#stripPasswords(data));
    return super.get(req, res);
  }

  async getById(req, res) {
    const origJson = res.json.bind(res);
    res.json = (data) => origJson(this.#stripPassword(data));
    return super.getById(req, res);
  }

  async getWhere(req, res) {
    const origJson = res.json.bind(res);
    res.json = (data) => origJson(this.#stripPasswords(data));
    return super.getWhere(req, res);
  }

  /**
   * DELETE /archive — prevents self-archival and super_user archival
   */
  async archive(req, res) {
    // Prevent self-archival
    const targetEmail = req.query.email;
    const targetId = req.query.id;

    if (targetEmail && targetEmail === req.user?.email) {
      return res.status(403).json({ message: 'Cannot archive the currently logged-in user' });
    }
    if (targetId && targetId === req.user?.id) {
      return res.status(403).json({ message: 'Cannot archive the currently logged-in user' });
    }

    // Prevent archival of super_user role holders
    if (targetId || targetEmail) {
      try {
        const filter = targetId ? { id: targetId } : { email: targetEmail };
        const target = await this.model('admin').findOneBy([filter]);
        if (target?.role === 'super_admin') {
          return res.status(403).json({ message: 'Cannot archive a super_admin user' });
        }
      } catch {
        /* proceed, will fail below if not found */
      }
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
    // Find the user to restore (including deactivated)
    const filter = req.query.email ? { email: req.query.email } : req.query.id ? { id: req.query.id } : null;
    if (!filter) {
      return res.status(400).json({ message: 'email or id query parameter required' });
    }

    try {
      const user = await this.model('admin').findOneBy([filter], { includeDeactivated: true });
      if (!user) return res.status(404).json({ message: 'User not found' });

      // Check parent tenant is active
      const tenant = await db('tenants', 'admin').findOneBy([{ tenant_code: user.tenant_code }]);
      if (!tenant) {
        return res.status(403).json({ message: 'Tenant is deactivated. Restore the tenant first.' });
      }
    } catch (err) {
      return res.status(500).json({ message: 'Error finding user for restore' });
    }

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

  // --- Private helpers ---

  #stripPassword(record) {
    if (!record || typeof record !== 'object') return record;
    const { password_hash: _ph, ...safe } = record;
    return safe;
  }

  #stripPasswords(data) {
    if (Array.isArray(data)) return data.map((r) => this.#stripPassword(r));
    // cursor-based pagination — pg-schemata returns { rows: [...], nextCursor, ... }
    if (data?.rows && Array.isArray(data.rows)) {
      return { ...data, rows: data.rows.map((r) => this.#stripPassword(r)) };
    }
    if (data?.records) {
      return { ...data, records: data.records.map((r) => this.#stripPassword(r)) };
    }
    if (data?.data && Array.isArray(data.data)) {
      return { ...data, data: data.data.map((r) => this.#stripPassword(r)) };
    }
    return data;
  }
}

const instance = new NapUsersController();

export { NapUsersController };
export default instance;
