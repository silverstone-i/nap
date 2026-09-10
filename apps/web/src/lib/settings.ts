/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
/**
 * Does: Returns the list default documented in the user settings register.
 * Called by: shell provisioning lists without persisted preferences.
 */
export function defaultRowsPerPage() {
  return 25;
}
