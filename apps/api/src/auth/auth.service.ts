import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { User } from '@prisma/client';
import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { mkdir, rm, stat, writeFile } from 'fs/promises';
import { extname, join, resolve } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from './auth.types';
import {
  ChangePasswordDto,
  ForgotPasswordDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
  UpdatePreferencesDto,
  UpdateProfileDto,
} from './dto/auth.dto';
import { PasswordResetMailer } from './password-reset-mailer.service';

const PASSWORD_PREFIX = 'scrypt';
const JWT_ALGORITHM = 'HS256';
const DEFAULT_JWT_ACCESS_TTL = '30d';
const DEFAULT_ADMIN_EMAIL = 'admin@healthflow.local';
const DEFAULT_ADMIN_PASSWORD = '12345678';
const DEFAULT_ADMIN_DISPLAY_NAME = 'admin';
const DEFAULT_AVATAR_DIR = resolve(process.cwd(), 'storage', 'avatars');
const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;
const PASSWORD_RESET_COOLDOWN_MS = 60 * 1000;
const PASSWORD_RESET_RESPONSE = '如果该邮箱已注册，我们会发送一封密码重置邮件';
const AVATAR_MIME_TYPES = new Map([
  ['image/png', '.png'],
  ['image/jpeg', '.jpg'],
  ['image/webp', '.webp'],
  ['image/gif', '.gif'],
]);

type JwtHeader = {
  alg: typeof JWT_ALGORITHM;
  typ: 'JWT';
};

type AccessTokenPayload = {
  sub: string;
  email: string;
  role: string;
  tokenVersion: number;
  iat: number;
  exp: number;
};

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly passwordResetMailer: PasswordResetMailer,
  ) {}

  async onModuleInit() {
    await this.ensureDefaultAdmin();
  }

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
          tokenVersion: { increment: 1 },
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
    if (user.disabledAt) throw new UnauthorizedException('账号已被禁用，请联系管理员');

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return this.toAuthResult(updated);
  }

  async requestPasswordReset(input: ForgotPasswordDto) {
    const email = normalizeEmail(input.email);
    const user = await this.prisma.user.findUnique({ where: { email } });
    const response = { message: PASSWORD_RESET_RESPONSE };

    if (!user?.passwordHash || user.disabledAt) return response;

    const recentToken = await this.prisma.passwordResetToken.findFirst({
      where: {
        userId: user.id,
        usedAt: null,
        createdAt: { gt: new Date(Date.now() - PASSWORD_RESET_COOLDOWN_MS) },
      },
      select: { id: true },
    });
    if (recentToken) return response;

    const token = randomBytes(32).toString('base64url');
    const tokenHash = hashResetToken(token);
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);

    const resetRecord = await this.prisma.$transaction(async (transaction) => {
      await transaction.passwordResetToken.deleteMany({ where: { userId: user.id } });
      return transaction.passwordResetToken.create({
        data: { userId: user.id, tokenHash, expiresAt },
      });
    });

    const webBaseUrl = (this.config.get<string>('WEB_BASE_URL') || this.config.get<string>('CORS_ORIGIN') || 'http://localhost:5173').replace(
      /\/$/,
      '',
    );
    const resetUrl = `${webBaseUrl}/?resetToken=${encodeURIComponent(token)}`;

    try {
      await this.passwordResetMailer.send(user.email, resetUrl, token);
    } catch (error) {
      await this.prisma.passwordResetToken.deleteMany({ where: { id: resetRecord.id } });
      this.logger.error(`Unable to send password reset email to ${user.email}`, error instanceof Error ? error.stack : undefined);
    }

    return response;
  }

  async resetPassword(input: ResetPasswordDto) {
    const tokenRecord = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashResetToken(input.token) },
      include: { user: true },
    });
    const now = new Date();

    if (!tokenRecord || tokenRecord.usedAt || tokenRecord.expiresAt <= now || tokenRecord.user.disabledAt) {
      throw new BadRequestException('重置链接无效或已过期，请重新申请');
    }

    await this.prisma.$transaction(async (transaction) => {
      const consumed = await transaction.passwordResetToken.updateMany({
        where: { id: tokenRecord.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (consumed.count !== 1) throw new BadRequestException('重置链接无效或已过期，请重新申请');

      await transaction.user.update({
        where: { id: tokenRecord.userId },
        data: { passwordHash: hashPassword(input.newPassword), tokenVersion: { increment: 1 } },
      });
      await transaction.passwordResetToken.updateMany({
        where: { userId: tokenRecord.userId, usedAt: null },
        data: { usedAt: now },
      });
    });

    return { success: true as const };
  }

  async getUserFromToken(token: string) {
    const payload = this.verifyToken(token);
    if (!payload) return null;

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) return null;
    if (user.disabledAt) return null;
    if (user.tokenVersion !== payload.tokenVersion) return null;

    return this.serializeUser(user);
  }

  async updateProfile(userId: string, input: UpdateProfileDto) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        displayName: input.displayName !== undefined ? input.displayName.trim() || null : undefined,
        bio: input.bio !== undefined ? input.bio.trim() || null : undefined,
        birthYear: input.birthYear,
        gender: input.gender,
        heightCm: input.heightCm,
        weightKg: input.weightKg,
      },
    });

    return { user: this.serializeUser(user) };
  }

  async uploadAvatar(userId: string, file: Express.Multer.File | undefined) {
    if (!file) throw new BadRequestException('请选择头像图片');

    const extension = AVATAR_MIME_TYPES.get(file.mimetype);
    if (!extension) throw new BadRequestException('头像仅支持 PNG、JPG、WEBP 或 GIF 图片');

    const maxBytes = this.config.get<number>('MAX_AVATAR_BYTES') ?? 2 * 1024 * 1024;
    if (file.size > maxBytes) throw new BadRequestException(`头像不能超过 ${Math.round(maxBytes / 1024 / 1024)} MB`);

    const userDir = this.getAvatarUserDir(userId);
    const filename = `${randomBytes(16).toString('hex')}${extension}`;
    await rm(userDir, { recursive: true, force: true });
    await mkdir(userDir, { recursive: true });
    await writeFile(join(userDir, filename), file.buffer);

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: `/auth/avatar/${filename}` },
    });

    return { user: this.serializeUser(user) };
  }

  async getAvatarFile(user: AuthUser, filename: string) {
    if (!isSafeAvatarFilename(filename) || user.avatarUrl !== `/auth/avatar/${filename}`) {
      throw new NotFoundException('Avatar not found');
    }

    const mimeType = getAvatarMimeType(filename);
    if (!mimeType) throw new NotFoundException('Avatar not found');
    const storagePath = join(this.getAvatarUserDir(user.id), filename);

    try {
      const fileStat = await stat(storagePath);
      if (!fileStat.isFile()) throw new Error('Avatar path is not a file');
    } catch {
      throw new NotFoundException('Avatar not found');
    }

    return {
      storagePath,
      mimeType,
    };
  }

  async changePassword(userId: string, input: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.passwordHash || !verifyPassword(input.currentPassword, user.passwordHash)) {
      throw new UnauthorizedException('当前密码不正确');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: hashPassword(input.newPassword), tokenVersion: { increment: 1 } },
    });

    return { success: true as const };
  }

  async updatePreferences(userId: string, input: UpdatePreferencesDto) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        themeMode: input.themeMode,
        locale: input.locale,
      },
    });

    return { user: this.serializeUser(user) };
  }

  async deleteAccount(userId: string) {
    await this.prisma.user.delete({ where: { id: userId } });
    return { deleted: true as const };
  }

  private toAuthResult(user: User) {
    return {
      token: this.signToken(user),
      user: this.serializeUser(user),
    };
  }

  private serializeUser(user: User) {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      avatarUrl: user.avatarUrl,
      bio: user.bio,
      birthYear: user.birthYear,
      gender: user.gender,
      heightCm: user.heightCm,
      weightKg: user.weightKg,
      themeMode: user.themeMode,
      locale: user.locale,
    };
  }

  private async ensureDefaultAdmin() {
    const existing = await this.prisma.user.findUnique({ where: { email: DEFAULT_ADMIN_EMAIL } });

    if (existing) {
      await this.prisma.user.update({
        where: { id: existing.id },
        data: {
          displayName: existing.displayName || DEFAULT_ADMIN_DISPLAY_NAME,
          role: 'admin',
          disabledAt: null,
          passwordHash: existing.passwordHash || hashPassword(DEFAULT_ADMIN_PASSWORD),
        },
      });
      await this.ensureDefaultLlmConfig(existing.id);
      return;
    }

    const user = await this.prisma.user.create({
      data: {
        email: DEFAULT_ADMIN_EMAIL,
        displayName: DEFAULT_ADMIN_DISPLAY_NAME,
        role: 'admin',
        passwordHash: hashPassword(DEFAULT_ADMIN_PASSWORD),
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

    await this.ensureDefaultLlmConfig(user.id);
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

  private signToken(user: User) {
    const issuedAt = Math.floor(Date.now() / 1000);
    const expiresIn = parseDurationSeconds(this.config.get<string>('JWT_ACCESS_TTL') || DEFAULT_JWT_ACCESS_TTL);
    const header: JwtHeader = { alg: JWT_ALGORITHM, typ: 'JWT' };
    const payload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      tokenVersion: user.tokenVersion,
      iat: issuedAt,
      exp: issuedAt + expiresIn,
    };
    const encodedHeader = encodeJwtPart(header);
    const encodedPayload = encodeJwtPart(payload);
    const unsignedToken = `${encodedHeader}.${encodedPayload}`;
    return `${unsignedToken}.${this.sign(unsignedToken)}`;
  }

  private verifyToken(token: string) {
    const [encodedHeader, encodedPayload, signature, extra] = token.split('.');
    if (!encodedHeader || !encodedPayload || !signature || extra) return null;

    const expected = this.sign(`${encodedHeader}.${encodedPayload}`);
    if (!safeEqual(signature, expected)) return null;

    const header = decodeJwtPart<Partial<JwtHeader>>(encodedHeader);
    if (!header || header.alg !== JWT_ALGORITHM || header.typ !== 'JWT') return null;

    const payload = decodeJwtPart<Partial<AccessTokenPayload>>(encodedPayload);
    if (!payload) return null;
    if (typeof payload.sub !== 'string') return null;
    if (typeof payload.email !== 'string') return null;
    if (typeof payload.role !== 'string') return null;
    if (typeof payload.tokenVersion !== 'number') return null;
    if (typeof payload.iat !== 'number' || typeof payload.exp !== 'number') return null;
    if (Math.floor(Date.now() / 1000) >= payload.exp) return null;

    return payload as AccessTokenPayload;
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

  private getAvatarUserDir(userId: string) {
    return join(resolve(this.config.get<string>('AVATAR_DIR') || DEFAULT_AVATAR_DIR), userId);
  }
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function hashResetToken(token: string) {
  return createHash('sha256').update(token).digest('base64url');
}

function encodeJwtPart(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function decodeJwtPart<T>(value: string): T | null {
  try {
    return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as T;
  } catch {
    return null;
  }
}

function parseDurationSeconds(value: string) {
  const match = value.trim().match(/^(\d+)([smhd])?$/i);
  if (!match) throw new BadRequestException('JWT_ACCESS_TTL must use a value like 15m, 12h, 30d, or seconds');

  const amount = Number(match[1]);
  const unit = match[2]?.toLowerCase() ?? 's';
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new BadRequestException('JWT_ACCESS_TTL must be a positive duration');
  }

  const multipliers: Record<string, number> = {
    s: 1,
    m: 60,
    h: 60 * 60,
    d: 24 * 60 * 60,
  };

  return amount * multipliers[unit];
}

export function hashPassword(password: string) {
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

function isSafeAvatarFilename(filename: string) {
  return /^[a-f0-9]{32}\.(png|jpe?g|webp|gif)$/i.test(filename);
}

function getAvatarMimeType(filename: string) {
  const extension = extname(filename).toLowerCase();
  if (extension === '.png') return 'image/png';
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
  if (extension === '.webp') return 'image/webp';
  if (extension === '.gif') return 'image/gif';
  return undefined;
}
