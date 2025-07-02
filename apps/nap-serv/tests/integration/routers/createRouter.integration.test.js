import request from 'supertest';
import express from 'express';
import { db, pgp, DB } from '../../../src/db/db.js';
import dotenv from 'dotenv';
import { TableModel } from 'pg-schemata';
import BaseController from '../../../src/utils/BaseController.js';
import createRouter from '../../../src/utils/createRouter.js';
import { it } from 'vitest';

dotenv.config();

const testSchema = {
  table: 'test_items',
  dbSchema: 'test',
  hasAuditFields: true,
  columns: [
    { name: 'id', type: 'serial' },
    { name: 'name', type: 'varchar(100)', notNull: true },
    { name: 'is_active', type: 'boolean', default: true },
    { name: 'deactivated_at', type: 'timestamptz' },
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
      db['testItem'] = (schema) => {
        return new TestItemModel(DB.db, pgp);
      };
      model = db.testItem;
      
      await model('test').createTable();
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
      req.schema = 'test'; // Set schema for BaseController to use

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
    const inserted = await db.one(
      "SET search_path TO test; INSERT INTO test_items (name, created_by) VALUES ('old', 'test-user') RETURNING id"
    );

    const res = await request(app)
      .put('/items/update?id=' + inserted.id)
      .send({ name: 'new' });
    expect(res.body).not.toBeNull();
    expect(res.statusCode).toBe(200);

    const getRes = await request(app).get('/items/where?id=' + inserted.id);
    expect(getRes.body).toBeDefined();
    expect(getRes.body).not.toHaveLength(0);
    expect(getRes.body[0]).toHaveProperty('name', 'new');
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
      "SET search_path TO test; INSERT INTO test_items (name, is_active, deactivated_at, created_by) VALUES ('inactive', false, now(), 'test-user') RETURNING id"
    );
    const res = await request(app).patch('/items/restore?id=' + inserted.id);
    expect(res.statusCode).toBe(200);
    expect(res.body.message).toMatch(/marked as active/);
  });
});
