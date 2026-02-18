/**
 * @file NapUsersController — user CRUD with registration, safe archive/restore
 * @module tenants/controllers/napUsersController
 *
 * Overrides:
 *   register → custom registration with bcrypt hashing, address/phone creation
 *   getById  → enriches response with phones and addresses
 *   update   → supports phone / address replacement alongside user field updates
 *   archive  → prevents self-archival and super_user archival
 *   restore  → checks parent tenant is active before restoring
 * Standard POST is disabled; must use /register endpoint.
 * Never returns password_hash in responses.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import bcrypt from 'bcrypt';
import BaseController from '../../../lib/BaseController.js';
import db from '../../../db/db.js';
import logger from '../../../utils/logger.js';
import { invalidateUserPermissions } from '../../../utils/rbacCacheInvalidation.js';

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

  /* ── Helper: insert phone rows for a user ──────────────────────── */

  async #insertPhones(userId, phones, auditUserId) {
    if (!Array.isArray(phones)) return;
    for (const ph of phones) {
      if (!ph.phone_number) continue;
      await db('napUserPhones', 'admin').insert({
        user_id: userId,
        phone_number: ph.phone_number,
        phone_type: ph.phone_type || 'cell',
        is_primary: ph.is_primary ?? false,
        created_by: auditUserId,
      });
    }
  }

  /* ── Helper: insert address rows for a user ────────────────────── */

  async #insertAddresses(userId, addresses, auditUserId) {
    if (!Array.isArray(addresses)) return;
    for (const addr of addresses) {
      if (!addr.address_line_1) continue;
      await db('napUserAddresses', 'admin').insert({
        user_id: userId,
        address_type: addr.address_type || 'home',
        address_line_1: addr.address_line_1 || null,
        address_line_2: addr.address_line_2 || null,
        address_line_3: addr.address_line_3 || null,
        city: addr.city || null,
        state_province: addr.state_province || null,
        postal_code: addr.postal_code || null,
        country_code: addr.country_code || null,
        is_primary: addr.is_primary ?? false,
        created_by: auditUserId,
      });
    }
  }

  /* ── Helper: delete-then-insert replacement for child rows ─────── */

  async #replacePhones(userId, phones, auditUserId) {
    await db.none('DELETE FROM admin.nap_user_phones WHERE user_id = $1', [userId]);
    await this.#insertPhones(userId, phones, auditUserId);
  }

  async #replaceAddresses(userId, addresses, auditUserId) {
    await db.none('DELETE FROM admin.nap_user_addresses WHERE user_id = $1', [userId]);
    await this.#insertAddresses(userId, addresses, auditUserId);
  }

  /**
   * POST /register — register a new user with password hashing.
   * Accepts phones as an array of { phone_number, phone_type, is_primary }
   * OR the legacy flat fields phone_1 / phone_2.
   */
  register = async (req, res) => {
    const {
      tenant_code,
      email,
      password,
      user_name,
      full_name,
      role,
      role_id,
      phone_1,
      phone_1_type,
      phone_2,
      phone_2_type,
      phones: phonesArray,
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

      const auditId = req.user?.id || null;

      // Create phone records — prefer the new array format; fall back to legacy flat fields
      if (Array.isArray(phonesArray) && phonesArray.length) {
        await this.#insertPhones(user.id, phonesArray, auditId);
      } else {
        // Legacy flat fields
        if (phone_1) {
          await db('napUserPhones', 'admin').insert({
            user_id: user.id,
            phone_number: phone_1,
            phone_type: phone_1_type || 'cell',
            is_primary: true,
            created_by: auditId,
          });
        }
        if (phone_2) {
          await db('napUserPhones', 'admin').insert({
            user_id: user.id,
            phone_number: phone_2,
            phone_type: phone_2_type || 'cell',
            is_primary: false,
            created_by: auditId,
          });
        }
      }

      // Create address records if provided
      await this.#insertAddresses(user.id, addresses, auditId);

      // Assign tenant RBAC role if provided
      if (role_id) {
        await db('roleMembers', tenant_code).insert({
          role_id,
          user_id: user.id,
          is_primary: true,
          tenant_code,
          created_by: auditId,
          updated_by: auditId,
        });
        await invalidateUserPermissions(user.id, tenant_code);
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
      logger.error('Error registering user:', { error: err.message });
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

  /**
   * GET /:id — enriches the user record with phones and addresses.
   */
  async getById(req, res) {
    try {
      const record = await this.model('admin').findById(req.params.id);
      if (!record) return res.status(404).json({ error: `${this.errorLabel} not found` });

      const [phones, addresses] = await Promise.all([
        db('napUserPhones', 'admin').findWhere([{ user_id: record.id }]),
        db('napUserAddresses', 'admin').findWhere([{ user_id: record.id }]),
      ]);

      const safe = this.#stripPassword(record);
      res.json({ ...safe, phones: phones || [], addresses: addresses || [] });
    } catch (err) {
      this.handleError(err, res, 'fetching', this.errorLabel);
    }
  }

  async getWhere(req, res) {
    const origJson = res.json.bind(res);
    res.json = (data) => origJson(this.#stripPasswords(data));
    return super.getWhere(req, res);
  }

  /**
   * PUT /update — update user fields plus optional phone/address replacement.
   * Body may include `phones` (array) and/or `addresses` (array) alongside
   * scalar user-column changes.  Child rows are fully replaced (delete + insert).
   */
  async update(req, res) {
    const { phones, addresses, password, ...userChanges } = req.body;
    const auditId = req.user?.id || null;

    try {
      const userId = req.query.id;

      // Handle admin password reset if provided
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
        await db.none(
          'UPDATE admin.nap_users SET password_hash = $/hash/ WHERE id = $/id/',
          { hash, id: userId },
        );
      }

      // Update scalar user columns (if any besides phones/addresses/password)
      if (Object.keys(userChanges).length) {
        const count = await this.model('admin').updateWhere([{ ...req.query }], userChanges);
        if (!count && !password) return res.status(404).json({ error: `${this.errorLabel} not found` });
      }

      // Resolve the target user id for child-row replacement
      if (userId) {
        if (Array.isArray(phones)) {
          await this.#replacePhones(userId, phones, auditId);
        }
        if (Array.isArray(addresses)) {
          await this.#replaceAddresses(userId, addresses, auditId);
        }
      }

      res.json({ message: `${this.errorLabel} updated` });
    } catch (err) {
      if (err.name === 'SchemaDefinitionError') err.message = 'Invalid input data';
      this.handleError(err, res, 'updating', this.errorLabel);
    }
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
        if (target?.role === 'super_user') {
          return res.status(403).json({ message: 'Cannot archive a super_user user' });
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
