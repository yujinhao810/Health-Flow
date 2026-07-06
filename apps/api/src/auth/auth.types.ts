import type { Request } from 'express';

export type AuthUser = {
  id: string;
  email: string;
  displayName?: string | null;
  role: string;
  avatarUrl?: string | null;
  bio?: string | null;
  birthYear?: number | null;
  gender?: string | null;
  heightCm?: number | null;
  weightKg?: number | null;
  themeMode?: string;
  locale?: string;
};

export type AuthenticatedRequest = Request & {
  user: AuthUser;
};
