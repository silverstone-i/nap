'use strict';

import express from 'express';
import { withMeta } from '../../../../src/utils/routeMeta.js';
import { rbac } from '../../../../middlewares/rbac/rbac.js';

const router = express.Router();
const base = { module: 'ar', router: 'invoices' };

// Placeholder handlers
const getInvoice = (req, res) => res.json({ id: req.params.id });
const approveInvoice = (req, res) => res.json({ approved: true, id: req.params.id });

router.get('/:id', withMeta({ ...base, action: 'get', desired: 'view' }), rbac('view'), getInvoice);
router.post('/:id/approve', withMeta({ ...base, action: 'approve', desired: 'full' }), rbac('full'), approveInvoice);

export default router;
