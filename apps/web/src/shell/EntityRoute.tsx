/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { Navigate, useParams } from 'react-router';
import { getEntity } from '../mocks/data';
import { readDefaultEntityId } from './useScope';
import { AppShell } from './AppShell';

/**
 * Guards the `:entityId` segment: unknown entity ids (including old
 * entity-less URLs like `/inbox`, whose first segment parses as an entity)
 * redirect to the default entity's inbox.
 */
export function EntityRoute() {
  const { entityId = '' } = useParams();
  if (!getEntity(entityId)) {
    return <Navigate to={`/${readDefaultEntityId()}/inbox`} replace />;
  }
  return <AppShell />;
}

/** `/` lands on the default (last-used) entity's inbox. */
export function RootRedirect() {
  return <Navigate to={`/${readDefaultEntityId()}/inbox`} replace />;
}

/** Index and unknown-module fallback within a valid entity. */
export function EntityInboxRedirect() {
  const { entityId = '' } = useParams();
  return <Navigate to={`/${entityId}/inbox`} replace />;
}
