import { z } from 'zod';

export const uuidSchema = z.string().uuid();

export const pagingQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type PagingQuery = z.infer<typeof pagingQuerySchema>;

export type ApiResult<T> = {
  data: T;
  requestId?: string;
};
