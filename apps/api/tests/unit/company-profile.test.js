/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  approveTaxIdRequest,
  getCompanyProfile,
  submitTaxId,
} from '../../src/modules/business-directory/domain/companyProfile.js';

const context = (isNapsoft, allowed = false) => ({
  tenant: { id: randomUUID(), isNapsoft },
  actorId: randomUUID(),
  can: async () => allowed,
});

describe('company profile authorization (I0013 §4)', () => {
  it('AC07: refuses tax ID changes without company-profile::write', async () => {
    await expect(
      submitTaxId(context(false), {
        taxId: '12-3456789',
        taxIdFormatId: randomUUID(),
      })
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('keeps the company profile to customer tenants and approval to Napsoft', async () => {
    expect(() => getCompanyProfile(context(true, true))).toThrow(
      expect.objectContaining({ code: 'INVALID_STATE' })
    );
    await expect(
      approveTaxIdRequest(context(false, true), randomUUID(), {
        taxIdFormatId: randomUUID(),
      })
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });
  });
});
