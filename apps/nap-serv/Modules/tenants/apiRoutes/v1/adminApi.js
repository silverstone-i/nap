import express from 'express';
import { getAllSchemas, switchSchema } from '../../controllers/admin.controller.js';
import authenticateJwt from '../../middlewares/authenticateJwt.js';

const router = express.Router();

// router.use(authenticateJwt);
router.get('/schemas', getAllSchemas);
router.post('/switch-schema/:schema', switchSchema);

export default router;
