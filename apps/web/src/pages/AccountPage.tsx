/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { Navigate, useLocation } from 'react-router';

/**
 * Does: Redirects existing account bookmarks to password management.
 * Called by: the legacy account route.
 */
export function AccountPage() {
  const location = useLocation();
  return <Navigate replace to={'/account/password' + location.search} />;
}
