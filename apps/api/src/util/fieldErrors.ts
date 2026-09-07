/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { z } from 'zod';
import type { ApiError } from '@nap/shared';

/**
 * Does: Represents the per-field messages an INVALID_INPUT response carries,
 * keyed by dotted field path.
 * Used by: HttpError, validateBody, and the framework's input checks.
 */
export type FieldErrors = NonNullable<ApiError['fieldErrors']>;

/**
 * Does: Turns the problems a schema found into a map from field path to the
 * messages for that path.
 * Called by: validateBody and the framework, when input fails its schema.
 * Why: paths are joined with "." and a problem with the input as a whole uses
 * the key "", so a client can match each message to a form field. Messages
 * are Zod's own: they describe the schema and the received type and never
 * echo the received value or anything from the server.
 */
export function toFieldErrors(issues: readonly z.core.$ZodIssue[]) {
  const fieldErrors: FieldErrors = {};
  for (const issue of issues) {
    const path = issue.path.map(segment => String(segment)).join('.');
    (fieldErrors[path] ??= []).push(issue.message);
  }
  return fieldErrors;
}

/**
 * Does: Builds a field-error map holding one fixed message for one path.
 * Called by: middleware and the framework when they refuse one input by hand.
 * Why: the message is fixed text chosen by the caller, never the received
 * value, so a refusal cannot echo client input.
 */
export function fieldError(path: string, message: string): FieldErrors {
  return { [path]: [message] };
}
