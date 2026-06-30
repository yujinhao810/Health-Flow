import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto, RegisterDto } from './dto/auth.dto';

const PASSWORD_PREFIX = 'scrypt';
const TOKEN_PREFIX = 'v1';
const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 30;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async register(input: RegisterDto) {
    const email = normalizeEmail(input.email);
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing?.passwordHash) throw new BadRequestException('这个邮箱已经注册过了，请直接登录');
    if (existing) {
      const user = await this.prisma.user.update({
        where: { id: existing.id },
        data: {
          displayName: input.displayName?.trim() || existing.displayName || email.split('@')[0],
          passwordHash: hashPassword(input.password),
        },
      });

      await this.ensureDefaultLlmConfig(user.id);
      return this.toAuthResult(user);
    }

    const user = await this.prisma.user.create({
      data: {
        email,
        displayName: input.displayName?.trim() || email.split('@')[0],
        passwordHash: hashPassword(input.password),
        llmConfigs: {
          create: {
            provider: 'mock',
            model: 'mock-health-assistant',
            enabled: true,
            ragEnabled: true,
            ragTopK: 5,
          },
        },
      },
    });

    return this.toAuthResult(user);
  }

  async login(input: LoginDto) {
    const email = normalizeEmail(input.email);
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user?.passwordHash || !verifyPassword(input.password, user.passwordHash)) {
      throw new UnauthorizedException('邮箱或密码不正确');
    }

    return this.toAuthResult(user);
  }

  async getUserFromToken(token: string) {
    const payload = this.verifyToken(token);
    if (!payload) return null;

    const user = await this.prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user) return null;

    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
    };
  }

  private toAuthResult(user: { id: string; email: string; displayName: string | null }) {
    return {
      token: this.signToken(user.id),
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
      },
    };
  }

  private async ensureDefaultLlmConfig(userId: string) {
    const existing = await this.prisma.userLlmConfig.findFirst({ where: { userId, enabled: true } });
    if (existing) return;

    await this.prisma.userLlmConfig.create({
      data: {
        userId,
        provider: 'mock',
        model: 'mock-health-assistant',
        enabled: true,
        ragEnabled: true,
        ragTopK: 5,
      },
    });
  }

  private signToken(userId: string) {
    const expiresAt = Date.now() + TOKEN_TTL_MS;
    const payload = Buffer.from(JSON.stringify({ userId, expiresAt })).toString('base64url');
    const signature = this.sign(payload);
    return [TOKEN_PREFIX, payload, signature].join('.');
  }

  private verifyToken(token: string) {
    const [prefix, payload, signature] = token.split('.');
    if (prefix !== TOKEN_PREFIX || !payload || !signature) return null;

    const expected = this.sign(payload);
    if (!safeEqual(signature, expected)) return null;

    try {
      const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { userId?: unknown; expiresAt?: unknown };
      if (typeof parsed.userId !== 'string' || typeof parsed.expiresAt !== 'number') return null;
      if (Date.now() > parsed.expiresAt) return null;
      return { userId: parsed.userId };
    } catch {
      return null;
    }
  }

  private sign(payload: string) {
    return createHmac('sha256', this.getTokenSecret()).update(payload).digest('base64url');
  }

  private getTokenSecret() {
    const secret = this.config.get<string>('JWT_SECRET') || this.config.get<string>('ENCRYPTION_KEY');
    if (!secret || secret.length < 8) {
      throw new BadRequestException('JWT_SECRET must be configured before using account login');
    }
    return secret;
  }
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function hashPassword(password: string) {
  const salt = randomBytes(16).toString('base64url');
  const hash = scryptSync(password, salt, 64).toString('base64url');
  return [PASSWORD_PREFIX, salt, hash].join(':');
}

function verifyPassword(password: string, stored: string) {
  const [prefix, salt, hash] = stored.split(':');
  if (prefix !== PASSWORD_PREFIX || !salt || !hash) return false;

  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'base64url');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function safeEqual(a: string, b: string) {
  const actual = Buffer.from(a);
  const expected = Buffer.from(b);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
