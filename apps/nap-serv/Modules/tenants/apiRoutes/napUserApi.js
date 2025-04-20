

import { Router } from 'express';
import NapUserController from '../controllers/NapUserController.js';

const router = Router();

// Create a new user
router.post('/users', NapUserController.create);

// Retrieve all users
router.get('/users', NapUserController.getAll);

// Retrieve a single user by id
router.get('/users/:id', NapUserController.getById);

// Update a user by id
router.put('/users/:id', NapUserController.update);

// Delete a user by id
router.delete('/users/:id', NapUserController.remove);

export default router;