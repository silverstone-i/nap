import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import app, { globalErrorHandler } from '../../../src/app.js';

// beforeAll(() => {
//   jest.spyOn(console, 'log').mockImplementation(() => {});
//   jest.spyOn(console, 'error').mockImplementation(() => {});
// });

// afterAll(() => {
//   console.log.mockRestore();
//   console.error.mockRestore();
// });

describe('App Integration Tests', () => {
  test('GET / should return API running message', async () => {
    const res = await request(app).get('/');
    expect(res.statusCode).toBe(200);
    expect(res.text).toBe('API is running');
  });

  test('GET /nonexistent should return 404', async () => {
    const res = await request(app).get('/nonexistent');
    expect(res.statusCode).toBe(404);
    expect(res.text).toBe('Not Found');
  });

  test('CORS headers should be set', async () => {
    const res = await request(app).options('/');
    expect(res.headers['access-control-allow-origin']).toBeDefined();
  });

  test('Global error handler should catch errors and return 500', async () => {
    const testApp = express();

    testApp.get('/error-test', (req, res, next) => {
      next(new Error('Test error'));
    });

    testApp.use((err, req, res, next) => {
      console.error(err.stack);
      res.status(500).send('Something broke!');
    });

    const res = await request(testApp).get('/error-test');
    expect(res.statusCode).toBe(500);
    expect(res.text).toBe('Something broke!');
  });

  test('Directly invoke global error handler middleware', () => {
    const err = new Error('Direct test error');
    const req = {};
    const res = { status: jest.fn().mockReturnThis(), send: jest.fn() };
    const next = jest.fn();

    globalErrorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.send).toHaveBeenCalledWith('Something broke!');
  });
});