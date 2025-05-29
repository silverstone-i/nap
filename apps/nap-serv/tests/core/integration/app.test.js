import request from 'supertest';
import app from '../../../src/app.js';

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
});
