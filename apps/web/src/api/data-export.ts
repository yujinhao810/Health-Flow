import { API_BASE_URL, authHeaders, clearAuthToken } from './client';

export async function exportHealthData(format: 'json' | 'csv') {
  const response = await fetch(`${API_BASE_URL}/health/export/${format}`, {
    headers: authHeaders(),
  });

  if (!response.ok) {
    if (response.status === 401) clearAuthToken();
    throw new Error(await response.text());
  }

  return response.blob();
}
