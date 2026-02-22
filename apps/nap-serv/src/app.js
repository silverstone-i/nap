/**
 * @file Express application setup — middleware chain and health endpoint
 * @module nap-serv/app
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();

const defaultOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
const allowedOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

// Middleware
app.use(
  cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : defaultOrigin,
    credentials: true,
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(morgan('dev'));

// Health check (before auth)
app.get('/api/health', (_req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

// Root route
app.get('/', (_req, res) => {
  res.send('NAP API is running');
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// Global error handler
app.use(errorHandler);

export default app;
