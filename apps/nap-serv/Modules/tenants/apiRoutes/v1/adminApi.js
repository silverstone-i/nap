import express from 'express';
import { getAllSchemas, switchSchema } from '../../controllers/admin.controller.js';

const router = express.Router();

router.get('/schemas', getAllSchemas);
router.post('/switch-schema/:schema', switchSchema);

export default router;
