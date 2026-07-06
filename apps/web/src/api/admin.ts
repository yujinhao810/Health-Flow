import { api } from './client';

export type AdminUser = {
  id: string;
  email: string;
  displayName?: string | null;
  role: 'user' | 'admin' | string;
  disabledAt?: string | null;
  lastLoginAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export function listAdminUsers(search?: string) {
  const query = search?.trim();
  return api<{ users: AdminUser[] }>(`/admin/users${query ? `?search=${encodeURIComponent(query)}` : ''}`);
}

export function updateAdminUser(id: string, input: { role?: 'user' | 'admin'; disabled?: boolean }) {
  return api<{ user: AdminUser }>(`/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
}

export function resetAdminUserPassword(id: string, password: string) {
  return api<{ user: AdminUser }>(`/admin/users/${id}/reset-password`, { method: 'POST', body: JSON.stringify({ password }) });
}
