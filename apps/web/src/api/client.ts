const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api';
const AUTH_TOKEN_KEY = 'healthflow.authToken';
export const AUTH_CHANGED_EVENT = 'healthflow-auth-changed';

export function getAuthToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function setAuthToken(token: string) {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
}

export function clearAuthToken() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
}

export function authHeaders(): Record<string, string> {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set('Content-Type', 'application/json');
  const token = getAuthToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    if (response.status === 401) clearAuthToken();
    const responseBody = await response.text();
    throw new Error(readApiError(responseBody));
  }

  return response.json() as Promise<T>;
}

function readApiError(responseBody: string) {
  try {
    const parsed = JSON.parse(responseBody) as { message?: string | string[] };
    if (Array.isArray(parsed.message)) return parsed.message.join('；');
    if (typeof parsed.message === 'string') return parsed.message;
  } catch {
    // Non-JSON upstream errors are shown as-is.
  }
  return responseBody || '请求失败，请稍后重试';
}

export function withAuthToken(url: string) {
  const token = getAuthToken();
  const apiUrl = withApiBaseUrl(url);
  if (!token) return apiUrl;
  const separator = apiUrl.includes('?') ? '&' : '?';
  return `${apiUrl}${separator}token=${encodeURIComponent(token)}`;
}

function withApiBaseUrl(url: string) {
  if (/^https?:\/\//i.test(url) || !url.startsWith('/')) return url;

  const base = API_BASE_URL.replace(/\/$/, '');
  if (!base || base === '/') return url;
  if (url === base || url.startsWith(`${base}/`)) return url;

  return `${base}${url}`;
}

export { API_BASE_URL };
