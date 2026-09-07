# 0001 — Brand, theme, and web entry surface

**Design:** Accepted (owner approved implementation plan, 2026-09-07).
**Implementation:** Verified in [PR #10](https://github.com/silverstone-i/nap/pull/10).

## Authority

Implements `ARCH-001`, `ARCH-003`, and `ARCH-051` in the
[platform specification](../specs/nap-platform-specification.md).
Its [web structure](../specs/nap-platform-specification.md#web-structure) and
[web shared behavior](../specs/nap-platform-specification.md#web-shared-behavior)
govern placement, styling, routing, and theme preference.
[BRAND.md](../branding/BRAND.md) owns all brand values and visual specifications.

## Accepted behavior

- **ENTRY-001:** `/` presents an accessible HTML wordmark, the heading
  “Project-first accounting & ERP,” and “Application under development.”
  Content is centered with bounded width, responsive padding, and natural
  scrolling on short screens.
- **ENTRY-002:** A visibly labeled System / Light / Dark selector applies the
  specification's theme preference contract before page content renders.
  Missing or invalid stored preferences use system. Storage failures leave
  selection usable in memory. System changes affect only system preference;
  subscriptions are removed when their owner unmounts.
- **ENTRY-003:** The entry page is lazy-loaded with an accessible loading state.
  Page-render and import failures show “We couldn’t load this page.” and a
  “Retry” button that reloads the current URL. Raw errors are never rendered.
- **ENTRY-004:** Unknown URLs show “Page not found” and a link to `/`.
  Loading, error, and unknown-page views share the brand and active theme.
- **ENTRY-005:** The supplied favicon assets and manifest are served locally.
  Fonts load through the links documented by the brand reference, with its
  system fallback stacks. No font request is required for page functionality.

## Boundaries and interfaces

The theme provider exposes preference, resolved mode, and a preference setter.
There are no API, database, authentication, product navigation, tenant URL,
product shell, or offline/service-worker additions. Existing transport behavior
is unchanged. Gold on these views is confined to the wordmark dot.

## Acceptance evidence

Tests cover all ENTRY requirements, storage and operating-system behavior,
loading and failure recovery, semantic content, and theme mapping. Browser
inspection covers mobile/desktop, both modes, keyboard focus, overflow,
contrast, font fallback, assets, and console errors. Repository checks must
pass; Verified requires merged code and passing CI.

## Local evidence

Node 24.19.0 passed the repository checks on 2026-09-07: 196 tests,
lint, format:check, typecheck, build, licenses, and diff check. The 19 web tests
cover preference and route behaviors. Browser verification covered 1280×720
and 375×667 layouts in both modes, plus scrolling at 320×280, keyboard focus,
reload persistence, font fallback without external font stylesheets, production
assets, and unknown-page recovery. Rendered text contrast exceeded 4.5:1 in
both themes; normal page navigation produced no console warnings or errors.

## Merge and CI evidence

[PR #10](https://github.com/silverstone-i/nap/pull/10) merged on 2026-09-07
with the `changelog`, `checks`, and `release` workflows passing. Tests added on
2026-09-07 prove no hex literal exists outside the token module and gold is
confined to the wordmark dot.

## Revisions

| Date       | Change                                                       |
| ---------- | ------------------------------------------------------------ |
| 2026-09-07 | Accepted the owner-approved minimal holding-page design.     |
| 2026-09-07 | Marked Verified after merge, CI, and brand-discipline tests. |
