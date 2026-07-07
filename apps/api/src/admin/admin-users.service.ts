import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma, User } from '@prisma/client';
import { hashPassword } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import type { ListAdminUsersDto, ResetAdminUserPasswordDto, UpdateAdminUserDto } from './dto/admin-users.dto';

@Injectable()
export class AdminUsersService {
  constructor(private readonly prisma: PrismaService) {}

  async listUsers(input: ListAdminUsersDto) {
    const search = input.search?.trim();
    const where: Prisma.UserWhereInput | undefined = search
      ? {
          OR: [
            { email: { contains: search, mode: 'insensitive' } },
            { displayName: { contains: search, mode: 'insensitive' } },
          ],
        }
      : undefined;

    const users = await this.prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return { users: users.map((user) => this.serializeUser(user)) };
  }

  async updateUser(adminUserId: string, targetUserId: string, input: UpdateAdminUserDto) {
    const target = await this.getTargetUser(targetUserId);

    if (input.disabled === true) {
      if (target.id === adminUserId) throw new BadRequestException('不能禁用当前登录的管理员账号');
      if (target.role === 'admin') await this.ensureAnotherEnabledAdmin(target.id);
    }

    if (input.role === 'user' && target.role === 'admin') {
      if (target.id === adminUserId) throw new BadRequestException('不能把当前登录的管理员降为普通用户');
      await this.ensureAnotherEnabledAdmin(target.id);
    }

    const user = await this.prisma.user.update({
      where: { id: target.id },
      data: {
        role: input.role,
        disabledAt: input.disabled === undefined ? undefined : input.disabled ? new Date() : null,
        tokenVersion: input.disabled === undefined ? undefined : { increment: 1 },
      },
    });

    return { user: this.serializeUser(user) };
  }

  async resetPassword(targetUserId: string, input: ResetAdminUserPasswordDto) {
    const target = await this.getTargetUser(targetUserId);
    const user = await this.prisma.user.update({
      where: { id: target.id },
      data: { passwordHash: hashPassword(input.password), tokenVersion: { increment: 1 } },
    });

    return { user: this.serializeUser(user) };
  }

  private async getTargetUser(id: string) {
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException('用户不存在');
    return target;
  }

  private async ensureAnotherEnabledAdmin(targetUserId: string) {
    const count = await this.prisma.user.count({
      where: {
        id: { not: targetUserId },
        role: 'admin',
        disabledAt: null,
      },
    });
    if (count === 0) throw new BadRequestException('至少需要保留一个可用的管理员账号');
  }

  private serializeUser(user: User) {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      disabledAt: user.disabledAt?.toISOString() ?? null,
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  }
}
