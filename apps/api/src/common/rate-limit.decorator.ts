import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_KEY = 'rate-limit';

export type RateLimitOptions = {
  limit: number;
  windowMs: number;
};

export const RateLimit = (limit: number, windowMs: number) =>
  SetMetadata(RATE_LIMIT_KEY, { limit, windowMs } satisfies RateLimitOptions);
