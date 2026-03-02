# ADR-0019: Cross-Module Posting Contract via Barrel Exports

**Status**: Accepted
**Date**: 2025-03-01

## Context

Several modules (AP, AR, Projects) import services from other modules:

- **AP and AR** import GL posting functions (`postAPInvoice`, `postAPPayment`, `postARInvoice`, `postARReceipt`) from `accounting/services/postingService.js`
- **AP, AR, and Projects** import `allocateNumber` from `core/services/numberingService.js`

These cross-boundary imports reached directly into sibling module internals, creating tight coupling to specific file paths. If the accounting module refactored its internal file structure, all consumers would break.

## Decision

### Barrel exports define the stable API surface

Each module that exposes cross-boundary services now has a `services/index.js` barrel file:

- `system/core/services/index.js` exports `{ allocateNumber }`
- `modules/accounting/services/index.js` exports `{ postAPInvoice, postAPPayment, postARInvoice, postARReceipt, postActualCost }`

Cross-boundary consumers import from the barrel:

```js
import { postAPInvoice } from '../../accounting/services/index.js';
import { allocateNumber } from '../../../system/core/services/index.js';
```

### Intra-module imports stay direct

Consumers within the same module (e.g., `accounting/controllers/journalEntriesController.js` importing from `../services/postingService.js`) keep their direct imports. The barrel is only for cross-boundary consumers.

### Accounting as a foundation module

The accounting module functions as a foundation — AP, AR, and activities modules depend on it for GL posting. The barrel export makes this dependency explicit and stable. The same pattern applies to core services (numbering, RBAC seeding).

## Consequences

- **Stable API surface**: Internal file renames or splits in accounting or core don't break consumers
- **Explicit contracts**: The barrel's export list documents exactly what is public
- **No runtime cost**: ES module re-exports are resolved statically by Node.js
- **Convention**: New cross-boundary services should be added to the relevant barrel
