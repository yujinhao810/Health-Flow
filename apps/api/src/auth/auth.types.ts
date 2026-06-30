import type { Request } from 'express';

export type AuthUser = {
  id: string;
  email: string;
  displayName?: string | null;
};

export type AuthenticatedRequest = Request & {
  user: AuthUser;
};
