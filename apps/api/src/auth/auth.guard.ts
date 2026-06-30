import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import type { AuthUser } from './auth.types';

type RequestWithUser = Request & {
  user?: AuthUser;
};

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const token = readBearerToken(request);
    if (!token) throw new UnauthorizedException('请先登录');

    const user = await this.auth.getUserFromToken(token);
    if (!user) throw new UnauthorizedException('登录已失效，请重新登录');

    request.user = user;
    return true;
  }
}

function readBearerToken(request: Request) {
  const header = request.header('authorization');
  const match = header?.match(/^Bearer\s+(.+)$/i);
  if (match?.[1]) return match[1];

  const token = request.query.token;
  return typeof token === 'string' ? token : undefined;
}
