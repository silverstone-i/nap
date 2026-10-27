/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/** Longest stored `User-Agent`, from M0001-14-R001. */
export const USER_AGENT_MAX_LENGTH = 512;

/**
 * Browser rules, first match wins (M0001-14-R003). Order matters: Edge and
 * Opera also send `Chrome/`, and Chrome also sends `Safari/`.
 */
const BROWSERS = [
  ['Edge', /\b(?:Edg|EdgA|EdgiOS)\//],
  ['Opera', /\bOPR\//],
  ['Firefox', /\b(?:Firefox|FxiOS)\//],
  ['Chrome', /\b(?:Chrome|CriOS)\//],
  ['Safari', /^(?=.*\bVersion\/)(?=.*\bSafari\/)/],
];

/**
 * OS rules, first match wins (M0001-14-R003). iOS and Android before macOS
 * and Linux, whose tokens their user agents also carry.
 */
const SYSTEMS = [
  ['iOS', /\b(?:iPhone|iPad)\b/],
  ['Android', /\bAndroid\b/],
  ['Windows', /\bWindows\b/],
  ['ChromeOS', /\bCrOS\b/],
  ['macOS', /\b(?:Mac OS X|Macintosh)\b/],
  ['Linux', /\bLinux\b/],
];

/**
 * Reduce a `User-Agent` header to the form a session stores.
 * @param {unknown} value Raw header value.
 * @returns {string|null} Trimmed and capped, or `null` when absent or blank.
 */
export function truncateUserAgent(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, USER_AGENT_MAX_LENGTH) : null;
}

/**
 * The browser label for a stored user agent (M0001-14-R003).
 * @param {string|null|undefined} userAgent
 * @returns {string|null} "<Browser> on <OS>", the browser alone when the OS
 *   is unknown, or `null` when nothing was stored.
 */
export function describeUserAgent(userAgent) {
  if (!userAgent) return null;
  const browser =
    BROWSERS.find(([, pattern]) => pattern.test(userAgent))?.[0] ??
    'Unknown browser';
  const system = SYSTEMS.find(([, pattern]) => pattern.test(userAgent))?.[0];
  return system ? `${browser} on ${system}` : browser;
}
