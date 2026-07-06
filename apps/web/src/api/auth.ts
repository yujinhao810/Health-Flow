import { API_BASE_URL, api, authHeaders, clearAuthToken, withAuthToken } from './client';

export type AuthUser = {
  id: string;
  email: string;
  displayName?: string | null;
  role: 'user' | 'admin' | string;
};

export type UserProfile = AuthUser & {
  avatarUrl?: string | null;
  bio?: string | null;
  birthYear?: number | null;
  gender?: string | null;
  heightCm?: number | null;
  weightKg?: number | null;
  themeMode?: 'light' | 'dark' | 'system' | string;
  locale?: string;
};

export type AuthResult = {
  token: string;
  user: UserProfile;
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
  return api<{ user: UserProfile }>('/auth/me');
}

export function updateProfile(input: Partial<UserProfile>) {
  return api<{ user: UserProfile }>('/auth/profile', { method: 'PATCH', body: JSON.stringify(input) });
}

export async function uploadAvatar(file: File) {
  const form = new FormData();
  form.append('file', file);

  const response = await fetch(`${API_BASE_URL}/auth/avatar`, {
    method: 'POST',
    headers: authHeaders(),
    body: form,
  });

  if (!response.ok) {
    if (response.status === 401) clearAuthToken();
    throw new Error(await response.text());
  }

  return response.json() as Promise<{ user: UserProfile }>;
}

export function getAvatarImageSrc(avatarUrl?: string | null) {
  return avatarUrl ? withAuthToken(avatarUrl) : undefined;
}

export function changePassword(input: { currentPassword: string; newPassword: string }) {
  return api<{ success: true }>('/auth/change-password', { method: 'POST', body: JSON.stringify(input) });
}

export function updatePreferences(input: { themeMode: string; locale?: string }) {
  return api<{ user: UserProfile }>('/auth/preferences', { method: 'PATCH', body: JSON.stringify(input) });
}

export function deleteAccount() {
  return api<{ deleted: true }>('/auth/account', { method: 'DELETE' });
}
