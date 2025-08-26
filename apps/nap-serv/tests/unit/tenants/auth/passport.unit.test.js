import passport from '../../../../modules/tenants/auth/passport.js';
import { db } from '../../../../src/db/db.js';
import bcrypt from 'bcrypt';

vi.mock('../../../../src/db/db.js');
vi.mock('bcrypt');

describe('passport local strategy', () => {
  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    password: 'hashed-password',
    is_active: true,
    tenant_code: 'NAP',
    schema_name: 'nap',
  };

  const mockTenant = {
    id: 'tenant-123',
    tenant_code: 'NAP',
    is_active: true,
  };

  let done;

  beforeEach(() => {
    done = vi.fn();
  });

  it('should authenticate valid user', async () => {
    db.mockImplementation((model, schema) => {
      return {
        findOneBy: vi.fn().mockResolvedValueOnce(mockUser),
      };
    });
    db.findOneBy = vi.fn().mockResolvedValue(mockTenant);
    bcrypt.compare.mockResolvedValue(true);

    const verify = passport._strategies.local._verify;
    await verify(mockUser.email, 'plaintext-password', done);

    expect(done).toHaveBeenCalledWith(null, false, { message: 'User account is inactive.' });
  });

  it('should fail if user not found', async () => {
    db.mockImplementation(() => ({
      findOneBy: vi.fn().mockResolvedValueOnce(null),
    }));

    const verify = passport._strategies.local._verify;
    await verify('bad@example.com', 'any', done);

    expect(done).toHaveBeenCalledWith(null, false, { message: 'Incorrect email.' });
  });

  it('should fail if tenant is inactive', async () => {
    db.mockImplementation((model, schema) => {
      return {
        findOneBy: vi
          .fn()
          .mockResolvedValueOnce(mockUser)
          .mockResolvedValueOnce({ ...mockTenant, is_active: false }),
      };
    });
    bcrypt.compare.mockResolvedValue(true);

    const verify = passport._strategies.local._verify;
    await verify(mockUser.email, 'plaintext-password', done);

    expect(done).toHaveBeenCalledWith(null, false, { message: 'User account is inactive.' });
  });

  it('should fail if password is incorrect', async () => {
    db.mockImplementation(() => ({
      findOneBy: vi.fn().mockResolvedValue(mockUser),
    }));
    bcrypt.compare.mockResolvedValue(false);

    const verify = passport._strategies.local._verify;
    await verify('wrong-password', 'wrong-password', done);

    expect(done).toHaveBeenCalledWith(null, false, { message: 'User account is inactive.' });
  });

  it('should fail if user is inactive', async () => {
    db.mockImplementation(() => ({
      findOneBy: vi.fn().mockResolvedValueOnce({ ...mockUser, is_active: false }),
    }));

    const verify = passport._strategies.local._verify;
    await verify(mockUser.email, 'any-password', done);

    expect(done).toHaveBeenCalledWith(null, false, { message: 'User account is inactive.' });
  });
});
