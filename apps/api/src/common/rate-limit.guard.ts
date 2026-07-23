import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { RATE_LIMIT_KEY, RateLimitOptions } from './rate-limit.decorator';

type Bucket = { count: number; expiresAt: number };

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, Bucket>();
  private requestsSinceCleanup = 0;

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const options = this.reflector.getAllAndOverride<RateLimitOptions>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!options) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const now = Date.now();
    const key = `${request.ip || request.socket.remoteAddress || 'unknown'}:${request.method}:${request.route?.path || request.path}`;
    const bucket = this.buckets.get(key);

    if (!bucket || bucket.expiresAt <= now) {
      this.buckets.set(key, { count: 1, expiresAt: now + options.windowMs });
    } else {
      bucket.count += 1;
      if (bucket.count > options.limit) {
        throw new HttpException('请求过于频繁，请稍后再试', HttpStatus.TOO_MANY_REQUESTS);
      }
    }

    this.requestsSinceCleanup += 1;
    if (this.requestsSinceCleanup >= 100) {
      for (const [bucketKey, value] of this.buckets) {
        if (value.expiresAt <= now) this.buckets.delete(bucketKey);
      }
      this.requestsSinceCleanup = 0;
    }
    return true;
  }
}
