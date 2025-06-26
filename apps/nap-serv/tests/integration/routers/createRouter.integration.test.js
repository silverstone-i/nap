import request from 'supertest';
import express from 'express';
import { db, pgp } from '../../../src/db/db.js';
import dotenv from 'dotenv';
import { TableModel } from 'pg-schemata';
import BaseController from '../../../src/utils/BaseController.js';
import createRouter from '../../../src/utils/createRouter.js';

dotenv.config();

const testSchema = {
  table: 'test_items',
  dbSchema: 'test',
  hasAuditFields: true,
  columns: [
    { name: 'id', type: 'serial' },
    { name: 'name', type: 'varchar(100)', notNull: true },
    { name: 'is_active', type: 'boolean', default: true },
  ],
  constraints: {
    primaryKey: ['id'],
  },
};

class TestItemModel extends TableModel {
  constructor(db, pgp) {
    super(db, pgp, testSchema);
  }
}

describe('BaseController + createRouter integration', () => {
  let app;
  let model;

  beforeEach(async () => {
    await db.none('DROP SCHEMA IF EXISTS test CASCADE; CREATE SCHEMA test');

    try {
      model = new TestItemModel(db, pgp);
      await model.createTable();
      db['testItem'] = model; // assign to db under name used by BaseController
    } catch (err) {
      console.error('Error creating test table:', err);
      throw err;
    }

    const controller = new BaseController('testItem'); // pass model name
    const router = createRouter(controller);

    app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.user = {
        user_id: 'test-user',
        user_name: 'test-user',
        email: 'test@example.com',
      };
      next();
    });
    app.use('/items', router);
  });

  it('should create a record', async () => {
    const res = await request(app).post('/items').send({ name: 'example' });
    expect(res.statusCode).toBe(201);
    expect(res.body.name).toBe('example');
    expect(res.body.created_by).toBe('test-user');
  });

  it('should get all records', async () => {
    await db.none("SET search_path TO test; INSERT INTO test_items (name, created_by) VALUES ('a', 'test-user')");
    const res = await request(app).get('/items');
    expect(res.statusCode).toBe(200);
    expect(res.body.rows).toHaveLength(1);
  });

  it('should update a record', async () => {
    const inserted = await db.one("SET search_path TO test; INSERT INTO test_items (name, created_by) VALUES ('old', 'test-user') RETURNING id");
    const res = await request(app)
      .put('/items/update?id=' + inserted.id)
      .send({ name: 'new' });
    expect(res.statusCode).toBe(200);
    expect(res.body.name).toBe('new');
  });

  it('should soft delete a record', async () => {
    const inserted = await db.one(
      "SET search_path TO test; INSERT INTO test_items (name, created_by) VALUES ('to-delete', 'test-user') RETURNING id"
    );
    const res = await request(app).delete('/items/remove?id=' + inserted.id);
    expect(res.statusCode).toBe(200);
    expect(res.body.message).toMatch(/marked as inactive/);
  });

  it('should restore a record', async () => {
    const inserted = await db.one(
      "SET search_path TO test; INSERT INTO test_items (name, is_active, created_by) VALUES ('inactive', false, 'test-user') RETURNING id"
    );
    const res = await request(app).patch('/items/restore?id=' + inserted.id);
    expect(res.statusCode).toBe(200);
    expect(res.body.message).toMatch(/marked as active/);
  });
});
