/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { seedPlatformPolicy } from './platform.js';
import { z } from 'zod';
import { withAdminTransaction } from '../db/withAdminTransaction.js';
import { hashPassword } from '../util/password.js';
import { passwordOptions, placeholder } from '../util/authConfig.js';
import { requestContext } from '../util/requestContext.js';
import type { AdminHandle } from '../db/admin/repositories.js';

/**
 * Does: Reads root seed inputs and the explicit recovery flag.
 * Called by: the bootstrap script before database access.
 */
export function bootstrapConfiguration(env: NodeJS.ProcessEnv, args: string[]) {
  if (
    args.length > 1 ||
    (args.length === 1 && args[0] !== '--reset-root-password')
  )
    throw new Error('Invalid bootstrap arguments');
  const values = z
    .object({
      tenantCode: z.string().trim().min(1).max(16),
      company: z.string().trim().min(1).max(128),
      email: z.string().trim().toLowerCase().pipe(z.email().max(128)),
      password: z
        .string()
        .min(12)
        .max(128)
        .refine(value => !placeholder(value)),
    })
    .parse({
      tenantCode: env.ROOT_TENANT_CODE,
      company: env.ROOT_COMPANY,
      email: env.ROOT_EMAIL,
      password: env.ROOT_PASSWORD,
    });
  return { ...values, reset: args.length === 1, hashing: passwordOptions(env) };
}

/**
 * Does: Creates the operator tenant and immutable root once, or explicitly resets root credentials.
 * Called by: the operator bootstrap script and disposable-database tests.
 */
export async function bootstrapRoot(
  db: AdminHandle,
  config: ReturnType<typeof bootstrapConfiguration>
) {
  return requestContext.run({ requestId: 'bootstrap' }, () =>
    withAdminTransaction(db, async tx => {
      await tx.tenants.lockBootstrap();
      await seedPlatformPolicy(tx);
      let tenant = await tx.tenants.findOneBy({
        tenant_code: config.tenantCode,
      });
      if (!tenant)
        tenant = await tx.tenants.insert({
          tenant_code: config.tenantCode,
          company: config.company,
          status: 'active',
        });
      if (tenant.status !== 'active')
        throw new Error('Bootstrap tenant is not active');
      let identity = await tx.portal_users.findOneBy({ is_root: true });
      if (identity && identity.email !== config.email)
        throw new Error('Root configuration differs from existing identity');
      if (!identity) {
        identity = await tx.portal_users.insert({
          email: config.email,
          password_hash: await hashPassword(config.password, config.hashing),
          status: 'active',
          is_root: true,
        });
      } else {
        await tx.portal_users.lockIdentity(identity.id);
        if (config.reset) {
          await tx.portal_users.update(identity.id, {
            updated_by: null,
            password_hash: await hashPassword(config.password, config.hashing),
          });
          await tx.sessions.revokeOthers(identity.id);
        }
      }
      const existing = await tx.portal_user_tenants.findWhere({
        portal_user_id: identity.id,
      });
      if (
        existing.some(
          item => item.tenant_id !== tenant.id || item.status !== 'active'
        )
      )
        throw new Error('Root membership differs from bootstrap configuration');
      if (existing.length === 0)
        await tx.portal_user_tenants.insert({
          portal_user_id: identity.id,
          ready: true,
          tenant_id: tenant.id,
          status: 'active',
        });
      return { actorId: identity.id, tenantId: tenant.id };
    })
  );
}
