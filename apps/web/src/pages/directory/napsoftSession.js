/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Whether the session is acting in the Napsoft tenant.
 * @param {object} session
 * @returns {boolean}
 */
export function isNapsoftSelected(session) {
  return (
    session.selectedTenant != null &&
    session.selectedTenant.id === session.capabilities?.napsoftTenant?.id
  );
}
