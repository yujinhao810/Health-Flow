import { api } from './client';

export type AuthUser = {
  id: string;
  email: string;
  displayName?: string | null;
};

export type AuthResult = {
  token: string;
  user: AuthUser;
};

export type LoginInput = {
  email: string;
  password: string;
};

export type RegisterInput = LoginInput & {
  displayName?: string;
};

export function login(input: LoginInput) {
  return api<AuthResult>('/auth/login', { method: 'POST', body: JSON.stringify(input) });
}

export function register(input: RegisterInput) {
  return api<AuthResult>('/auth/register', { method: 'POST', body: JSON.stringify(input) });
}

export function getCurrentUser() {
  return api<{ user: AuthUser }>('/auth/me');
}
