import assert from 'node:assert/strict';
import test from 'node:test';
import { AuthService } from '../src/auth/auth.service';

const user = {
  id: 'user-1',
  email: 'person@example.com',
  passwordHash: 'scrypt:old:invalid',
  tokenVersion: 0,
  displayName: 'Person',
  role: 'user',
  disabledAt: null,
  lastLoginAt: null,
  avatarUrl: null,
  bio: null,
  birthYear: null,
  gender: null,
  heightCm: null,
  weightKg: null,
  themeMode: 'system',
  locale: 'zh-CN',
  createdAt: new Date(),
  updatedAt: new Date(),
};

test('password reset request does not disclose whether an email exists', async () => {
  let mailSent = false;
  const prisma = {
    user: { findUnique: async () => null },
    passwordResetToken: { findFirst: async () => null },
  };
  const mailer = { send: async () => void (mailSent = true) };
  const service = createAuthService(prisma, mailer);

  const result = await service.requestPasswordReset({ email: 'missing@example.com' });

  assert.equal(result.message, '如果该邮箱已注册，我们会发送一封密码重置邮件');
  assert.equal(mailSent, false);
});

test('a reset link changes the password once and invalidates the old password', async () => {
  const mutableUser = { ...user };
  let resetRecord:
    | {
        id: string;
        userId: string;
        tokenHash: string;
        expiresAt: Date;
        usedAt: Date | null;
        user: typeof mutableUser;
      }
    | undefined;
  let resetUrl = '';

  const transaction = {
    passwordResetToken: {
      deleteMany: async () => ({ count: resetRecord ? 1 : 0 }),
      create: async ({ data }: { data: { userId: string; tokenHash: string; expiresAt: Date } }) => {
        resetRecord = { id: 'reset-1', ...data, usedAt: null, user: mutableUser };
        return resetRecord;
      },
      updateMany: async ({ where, data }: { where: { id?: string; usedAt?: null }; data: { usedAt: Date } }) => {
        if (where.id && resetRecord?.usedAt) return { count: 0 };
        if (resetRecord) resetRecord.usedAt = data.usedAt;
        return { count: 1 };
      },
    },
    user: {
      update: async ({ data }: { data: { passwordHash: string; tokenVersion: { increment: number } } }) => {
        mutableUser.passwordHash = data.passwordHash;
        mutableUser.tokenVersion += data.tokenVersion.increment;
        return mutableUser;
      },
    },
  };
  const prisma = {
    user: {
      findUnique: async () => mutableUser,
      update: async () => mutableUser,
    },
    passwordResetToken: {
      findFirst: async () => null,
      findUnique: async ({ where }: { where: { tokenHash: string } }) => {
        if (!resetRecord || resetRecord.tokenHash !== where.tokenHash) return null;
        return resetRecord;
      },
      deleteMany: async () => ({ count: 1 }),
    },
    $transaction: async (operation: (client: typeof transaction) => Promise<unknown>) => operation(transaction),
  };
  const mailer = { send: async (_email: string, url: string) => void (resetUrl = url) };
  const service = createAuthService(prisma, mailer);

  await service.requestPasswordReset({ email: mutableUser.email });
  const token = new URL(resetUrl).searchParams.get('resetToken');
  assert.ok(token);

  await service.resetPassword({ token, newPassword: 'new-password-123' });
  assert.equal(mutableUser.tokenVersion, 1);
  assert.match(mutableUser.passwordHash, /^scrypt:/);
  await assert.rejects(service.login({ email: mutableUser.email, password: 'old-password-123' }), /邮箱或密码不正确/);
  await assert.doesNotReject(service.login({ email: mutableUser.email, password: 'new-password-123' }));
  await assert.rejects(service.resetPassword({ token, newPassword: 'another-password-123' }), /无效或已过期/);
});

function createAuthService(prisma: object, mailer: object) {
  const config = {
    get: (key: string) => {
      const values: Record<string, string> = {
        WEB_BASE_URL: 'http://localhost:5173',
        CORS_ORIGIN: 'http://localhost:5173',
        JWT_SECRET: 'test-jwt-secret',
        JWT_ACCESS_TTL: '30d',
      };
      return values[key];
    },
  };

  return new AuthService(prisma as never, config as never, mailer as never);
}
