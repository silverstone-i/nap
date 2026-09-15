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

- **ENTRY-001:** PRD 0009 SHELL-003/004 owns current product entry and the
  static Dashboard. It replaces the original holding page; its historical
  brand verification remains recorded below.
- **ENTRY-002:** A visibly labeled System / Light / Dark selector applies the
  specification's theme preference contract before page content renders.
  Missing or invalid stored preferences use system. Storage failures leave
  selection usable in memory. System changes affect only system preference;
  subscriptions are removed when their owner unmounts.
- **ENTRY-003:** Routed entry pages use accessible loading and failure states
  under SHELL-005. Page-render and import failures show “We couldn’t load this
  page.” and a Retry button that reloads the current URL. Raw errors are not shown.
- **ENTRY-004:** Unknown URLs show “Page not found” and a link to `/`.
  Loading, error, and unknown-page views share the brand and active theme.
- **ENTRY-005:** The supplied favicon assets and manifest are served locally.
  Fonts load through the links documented by the brand reference, with its
  system fallback stacks. No font request is required for page functionality.

## Boundaries and interfaces

The theme provider exposes preference, resolved mode, and a preference setter.
This brand capability owns no API or database behavior. Authentication and
product navigation are owned by PRDs 0003/0009. It introduces no offline or
service-worker behavior. Gold on these views is confined to the wordmark dot.

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

## Product entry amendment — accepted

ENTRY-001/003 reference the current product-entry contract in PRD 0009.
This retained amendment anchor records the replacement of the holding page.
ENTRY-002 theme behavior and ENTRY-004/005 shared recovery/assets remain owned
here. SHELL-001 adds tenant branding and relocates the small NAP wordmark in the
product frame without changing existing brand tokens or historical evidence.

See [PRD 0009](0009-product-shell-and-navigation.md) and
[ADR 0010](../ADRs/0010-product-shell-and-vendor-selection.md).
Owner accepted this amendment with PRD 0009 implementation on 2026-09-10.
Its implementation evidence is tracked in the shell delivery plan, separately
from the earlier Verified status.

## Revisions

Historical entries below record the state at each delivery date. Current
requirements are in the subject sections above.

| Date       | Change                                                                                                   |
| ---------- | -------------------------------------------------------------------------------------------------------- |
| 2026-09-07 | Accepted the owner-approved minimal holding-page design.                                                 |
| 2026-09-07 | Marked Verified after merge, CI, and brand-discipline tests.                                             |
| 2026-09-09 | Added proposed shell-related amendment for review; preserved accepted baseline and verification history. |
| 2026-09-10 | Accepted shell integration with PRD 0009 implementation; historical verification preserved.              |

Revision 2026-09-15: consolidated current requirements and references; repaired revision tables without changing historical evidence or runtime behavior.
