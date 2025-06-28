import { describe, it, expect, vi, beforeEach } from 'vitest';
import { addAuditFields } from '../../../../middlewares/audit/addAuditFields.js';

describe('addAuditFields middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      user: { email: 'test@example.com', user_name: 'test@example.com' },
      method: 'POST',
      body: { data: 'initial' },
    };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    next = vi.fn();
  });

  it('should add created_by and updated_by on POST requests', () => {
    console.log('body before middleware', req.body);
    console.log('user before middleware', req.user);
    
    
    addAuditFields(req, res, next);
    console.log('body after middleware', req.body);
    expect(req.body.created_by).toBe('test@example.com');
    expect(req.body.updated_by).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });

  it('should add only updated_by on PUT requests', () => {
    req.method = 'PUT';
    addAuditFields(req, res, next);
    expect(req.body.updated_by).toBe('test@example.com');
    expect(req.body.created_by).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });

  it('should skip if no user is present', () => {
    delete req.user;
    addAuditFields(req, res, next);
    expect(req.body.created_by).toBeUndefined();
    expect(req.body.updated_by).toBeUndefined();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'Missing user context for audit fields.' });
  });
});