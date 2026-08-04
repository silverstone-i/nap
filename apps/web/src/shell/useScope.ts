/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useCallback } from 'react';
import {
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router';
import { getEntity, getProject, defaultEntityId } from '../mocks/data';
import type { Entity, Project } from '../mocks/types';

// The URL is the source of truth for the active entity; localStorage only
// remembers the last explicit switch so entity-less URLs (`/`, unknown
// entities) can land somewhere sensible — see docs/RULES/web-shell.md.
const STORAGE_KEY = 'nap:entity';

/** The last explicitly-switched entity, falling back to the default. */
export function readDefaultEntityId(): string {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && getEntity(stored)) return stored;
  } catch {
    // Storage unavailable (e.g. blocked by browser settings).
  }
  return defaultEntityId;
}

function persistDefaultEntityId(entityId: string) {
  try {
    window.localStorage.setItem(STORAGE_KEY, entityId);
  } catch {
    // Persistence is best-effort; the URL still carries the entity.
  }
}

export interface Scope {
  entity: Entity;
  entityId: string;
  /** Active project filter, or undefined for "all projects". */
  project: Project | undefined;
  projectId: string | undefined;
  /** Switch the active entity: rewrite the URL segment, keep the module path. */
  setEntity: (entityId: string) => void;
  /** Set or clear (undefined) the ?project= filter. */
  setProject: (projectId: string | undefined) => void;
}

/**
 * The single reader of scope state (docs/RULES/web-shell.md): entity from
 * the `:entityId` path segment, project from `?project=`.
 */
export function useScope(): Scope {
  const { entityId = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();

  const entity = getEntity(entityId);
  if (!entity) {
    // EntityRoute redirects unknown entities before pages render.
    throw new Error('useScope must be used under a valid /:entityId route');
  }

  // A ?project= that doesn't belong to the URL's entity (a hand-edited
  // link) is treated as unset — the page falls back to "all projects".
  const requestedProjectId = searchParams.get('project') ?? undefined;
  const project = requestedProjectId
    ? getProject(entityId, requestedProjectId)
    : undefined;
  const projectId = project?.id;

  const setEntity = useCallback(
    (nextEntityId: string) => {
      if (!getEntity(nextEntityId)) return;
      persistDefaultEntityId(nextEntityId);
      // Keep the module path, drop entity-scoped params (?project=,
      // ?invoice=) that don't transfer across entities.
      const modulePath = location.pathname.replace(/^\/[^/]+/, '') || '/inbox';
      const params = new URLSearchParams(searchParams);
      params.delete('project');
      params.delete('invoice');
      const search = params.toString();
      void navigate(
        `/${nextEntityId}${modulePath}${search ? `?${search}` : ''}`
      );
    },
    [location.pathname, navigate, searchParams]
  );

  const setProject = useCallback(
    (nextProjectId: string | undefined) => {
      setSearchParams(params => {
        if (nextProjectId) params.set('project', nextProjectId);
        else params.delete('project');
        return params;
      });
    },
    [setSearchParams]
  );

  return { entity, entityId, project, projectId, setEntity, setProject };
}
