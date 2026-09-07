# Brand, theme, and web entry surface

## Features to implement

- [x] Shared brand colors, typography, and MUI theme.
- [x] Persistent System, Light, and Dark selection.
- [x] Accessible HTML wordmark with the approved gold dot.
- [x] Responsive holding page with the accepted copy.
- [x] Route loading, error recovery, and unknown-page states.
- [x] Supplied favicons, manifest, and font loading.
- [x] Automated tests and real-browser verification.

## Accepted design and changes

Implements [PRD 0001](../PRDs/0001-brand-theme-and-web-entry-surface.md),
ENTRY-001–ENTRY-005. Replace the bare NAP heading with a routed holding page.
Add the shared theme, styles, preference provider, and presentation components
within the specification's existing web layers. Keep the provider outside
route errors. Use existing React Router, MUI, and Emotion dependencies.

## Delivery and recovery

One coherent change; no API, database, security boundary, or migration changes.
No commit, push, PR creation, or deployment is included in this task. A later
single PR can deliver the capability. Revert that change or redeploy the prior
static web build to recover; the local theme preference is harmless to older
clients. Main risks are dark-mode contrast, blocked storage/fonts, and stale
lazy chunks; acceptance tests and full-reload Retry cover those cases.

## Verification

Run web tests and typechecking first, then lint, format check, typecheck, tests,
build, licenses, and diff check on the pinned Node version. Inspect mobile and
desktop in both modes, keyboard focus, overflow, font fallback, assets, and
console errors. Record results here and in the roadmap; local completion is
Implemented, not Verified.

## Local evidence — 2026-09-07

- Node 24.19.0: lint, format:check, typecheck, build, licenses, and diff check passed.
- Full suite: 196 tests passed (17 toolchain, 148 API, 19 web, 12 shared).
- Browser: desktop 1280×720 and mobile 375×667, both modes; 320×280 scroll
  access; visible keyboard focus; persisted selection after reload; unknown-page
  home navigation; no normal-navigation console errors or warnings.
- Production preview without font links confirmed readable system-font fallback.
  Served favicon and manifest assets match the supplied originals.
- Rendered text contrast against the page: light mode minimum 5.71:1,
  dark mode minimum 7.64:1; wordmark 10.40:1 and 5.48:1 respectively.
- Page-loading, import failure, render failure, and Retry covered by route tests.
- No dependencies, API contracts, database schemas, or deployment settings changed.
  Capability is Implemented; merge and CI evidence remain pending.
