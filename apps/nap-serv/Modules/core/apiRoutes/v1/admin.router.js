'use strict';

import express from 'express';
import { assumeTenant, exitAssumption } from '../../controllers/admin.controller.js';

const router = express.Router();

router.post('/assume-tenant', assumeTenant);
router.post('/exit-assumption', exitAssumption);

export default router;
