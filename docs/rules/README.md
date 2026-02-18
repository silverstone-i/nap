# NAP Business Rules Registry

This directory contains the authoritative source of business rules for the NAP platform.
Each file covers one domain. Rules are written in plain English and linked to the code
or database constraints that enforce them.

## How to Use This Registry

- **When implementing a feature:** Check the relevant domain file before writing validation logic.
- **When changing behavior:** Update the rule here in the same PR as the code change.
- **When reviewing code:** Reference the rule ID in PR comments (e.g., `BR-RBAC-004`).
- **When writing code comments:** Cite the rule ID inline (e.g., `// BR-RBAC-004: super_user bypasses all checks`).

## Rule ID Format

`BR-{DOMAIN}-{NUMBER}`

Example: `BR-RBAC-004`, `BR-AP-012`, `BR-GL-003`

## Domain Files

| Domain | File | Rule Count | Status |
|---|---|---|---|
| RBAC (Auth & Permissions) | [rbac.md](./rbac.md) | 36 | Active |
| UI Visibility (cross-cutting) | [ui-visibility.md](./ui-visibility.md) | 1 | Active |
| AP (Accounts Payable) | ap.md | — | Not started |
| AR (Accounts Receivable) | ar.md | — | Not started |
| General Ledger | gl.md | — | Not started |
| Project / Budget Management | projects.md | — | Not started |
| Procurement / BOM | procurement.md | — | Not started |
| Cashflow / Profitability | cashflow.md | — | Not started |
| Tenant Management | tenants.md | — | Not started |

## Conventions

- Rules are **append-only** within a file — never delete or renumber an existing rule.
- If a rule changes, mark the old rule as superseded and add a new one.
- Each rule must state what enforces it (middleware, DB constraint, service layer, etc.).
- ADR references are included where a rule traces back to an architectural decision.
- The Changelog at the bottom of each file tracks when rules were added or changed.
