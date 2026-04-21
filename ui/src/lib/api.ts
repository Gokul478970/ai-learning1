import { getToken, clearToken } from './auth';

export const BASE = (import.meta as any).env?.VITE_API_BASE ?? '';

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function handleAuthFailure(res: Response): Promise<void> {
  if (res.status === 401) {
    try { clearToken(); } catch { /* noop */ }
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  }
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = { ...(init.headers as Record<string, string> | undefined), ...authHeaders() };
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  if (!res.ok) {
    await handleAuthFailure(res);
  }
  return res;
}

export interface ExportBacklogParams {
  project_key?: string;
  status?: string;
  issue_type?: string;
  assignee?: string;
  sprint_id?: string;
  labels?: string;
}

export async function exportBacklogCsv(params: ExportBacklogParams = {}): Promise<Blob> {
  const qs = new URLSearchParams();
  (Object.keys(params) as (keyof ExportBacklogParams)[]).forEach((k) => {
    const v = params[k];
    if (v !== undefined && v !== null && v !== '') qs.append(k, String(v));
  });
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  const res = await apiFetch(`/api/issues/export${suffix}`, {
    method: 'GET',
    headers: { Accept: 'text/csv' },
  });
  if (!res.ok) {
    let detail = `Export failed (${res.status})`;
    try {
      const data = await res.json();
      if (data && typeof data.detail === 'string') detail = data.detail;
    } catch { /* body may not be JSON */ }
    throw new Error(detail);
  }
  return await res.blob();
}
