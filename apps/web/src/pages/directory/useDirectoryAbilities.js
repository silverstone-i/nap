/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useCapabilities } from '../../auth/useCapabilities.js';

/**
 * What the session may do in the business directory (M0005 §4). Hiding is
 * cosmetic; the server decides every request.
 * @returns {{write: boolean, labels: boolean, readTaxIds: boolean, writeTaxIds: boolean, onError: (err: unknown) => void}}
 */
export function useDirectoryAbilities() {
  const { can, onError } = useCapabilities();
  return {
    write: can('business-directory::directory::write'),
    labels: can('business-directory::labels::write'),
    readTaxIds: can('business-directory::tax-ids::read'),
    writeTaxIds: can('business-directory::tax-ids::write'),
    onError,
  };
}
