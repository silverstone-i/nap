/**
 * @file Admin controller — schema listing and impersonation per PRD §3.2.3
 * @module tenants/controllers/adminController
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import db from '../../../db/db.js';
import { getRedis } from '../../../utils/redis.js';

/**
 * GET /schemas — list all tenant schemas (NapSoft users)
 * Returns full tenant objects for the UI tenant picker.
 */
export async function getAllSchemas(req, res) {
  try {
    const tenants = await db('tenants', 'admin').findWhere(
      [{ status: 'active' }],
      'AND',
      { columnWhitelist: ['id', 'tenant_code', 'schema_name', 'company', 'status'] },
    );
    return res.json(tenants);
  } catch {
    return res.status(500).json({ error: 'Database error' });
  }
}

/**
 * POST /impersonate — start impersonating a target user
 * Body: { target_user_id, reason? }
 */
export async function startImpersonation(req, res) {
  const impersonatorId = req.user?.id;
  if (!impersonatorId) return res.status(401).json({ error: 'Unauthorized' });

  const { target_user_id, reason } = req.body || {};
  if (!target_user_id) return res.status(400).json({ error: 'target_user_id required' });

  try {
    // Look up target user
    const targetUser = await db('napUsers', 'admin').findOneBy([{ id: target_user_id }]);
    if (!targetUser) return res.status(404).json({ error: 'Target user not found' });

    // Check no active session exists for this impersonator
    const redis = await getRedis();
    const existing = await redis.get(`imp:${impersonatorId}`);
    if (existing) {
      return res.status(409).json({ error: 'Active impersonation session already exists. Exit first.' });
    }

    // Insert audit log
    const log = await db('impersonationLogs', 'admin').insert({
      impersonator_id: impersonatorId,
      target_user_id,
      target_tenant_code: targetUser.tenant_code,
      reason: reason || null,
      created_by: impersonatorId,
    });

    // Store in Redis for authRedis middleware to detect
    const impData = {
      logId: log.id,
      targetUserId: targetUser.id,
      targetTenantCode: targetUser.tenant_code?.toLowerCase(),
      targetSchemaName: targetUser.tenant_code?.toLowerCase(),
      targetUser: {
        id: targetUser.id,
        email: targetUser.email,
        user_name: targetUser.user_name,
        role: targetUser.role,
        status: targetUser.status,
        tenant_code: targetUser.tenant_code,
      },
    };
    await redis.set(`imp:${impersonatorId}`, JSON.stringify(impData));

    return res.json({
      message: 'Impersonation started',
      target_user: impData.targetUser,
      log_id: log.id,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to start impersonation' });
  }
}

/**
 * POST /exit-impersonation — end the current impersonation session
 */
export async function endImpersonation(req, res) {
  const impersonatorId = req.user?.id;
  if (!impersonatorId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const redis = await getRedis();
    const impData = await redis.get(`imp:${impersonatorId}`);
    if (!impData) {
      return res.json({ message: 'No active impersonation session' });
    }

    const { logId } = JSON.parse(impData);

    // Update audit log with ended_at
    if (logId) {
      await db.none(
        'UPDATE admin.impersonation_logs SET ended_at = NOW() WHERE id = $/id/ AND ended_at IS NULL',
        { id: logId },
      );
    }

    // Remove Redis key
    await redis.del(`imp:${impersonatorId}`);

    return res.json({ message: 'Impersonation ended' });
  } catch {
    return res.status(500).json({ error: 'Failed to end impersonation' });
  }
}

/**
 * GET /impersonation-status — check if user has an active impersonation session
 */
export async function getImpersonationStatus(req, res) {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const redis = await getRedis();
    const impData = await redis.get(`imp:${userId}`);
    if (!impData) {
      return res.json({ active: false });
    }

    const parsed = JSON.parse(impData);
    return res.json({
      active: true,
      target_user: parsed.targetUser,
      log_id: parsed.logId,
    });
  } catch {
    return res.json({ active: false });
  }
}

export default { getAllSchemas, startImpersonation, endImpersonation, getImpersonationStatus };
