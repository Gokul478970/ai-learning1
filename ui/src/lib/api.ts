import { getToken, clearSession } from './auth'

const BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string>),
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  if (res.status === 401) {
    clearSession()
    window.location.reload()
    throw new Error('Session expired')
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || res.statusText);
  }
  return res.json();
}

// Binary/blob request (used for file downloads like CSV export)
async function requestBlob(path: string, accept?: string): Promise<Blob> {
  const token = getToken()
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`
  if (accept) headers['Accept'] = accept

  const res = await fetch(`${BASE}${path}`, { method: 'GET', headers })
  if (res.status === 401) {
    clearSession()
    window.location.reload()
    throw new Error('Session expired')
  }
  if (!res.ok) {
    let detail = res.statusText
    try {
      const err = await res.json()
      detail = err.detail || detail
    } catch { /* non-json */ }
    throw new Error(detail)
  }
  return res.blob()
}

// --- Auth (no token needed) ---
export const authRegister = (email: string) =>
  fetch(`${BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  }).then(async (r) => {
    const data = await r.json()
    if (!r.ok) throw new Error(data.detail || 'Registration failed')
    return data
  })

export const authVerifyOtp = (email: string, otp: string, password: string, display_name?: string, role?: string) =>
  fetch(`${BASE}/auth/verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, otp, password, display_name: display_name || '', role: role || 'Dev' }),
  }).then(async (r) => {
    const data = await r.json()
    if (!r.ok) throw new Error(data.detail || 'Verification failed')
    return data
  })

export const authLogin = (email: string, password: string) =>
  fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  }).then(async (r) => {
    const data = await r.json()
    if (!r.ok) throw new Error(data.detail || 'Login failed')
    return data
  })

// --- Backlog CSV export ---
export type BacklogExportFilters = {
  project_id?: string | null
  status?: string | null
  assignee?: string | null
  priority?: string | null
  issue_type?: string | null
  sprint?: string | null
  epic?: string | null
}

export const exportBacklogCsv = (filters: BacklogExportFilters = {}): Promise<Blob> => {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(filters)) {
    if (v !== undefined && v !== null && v !== '') {
      params.append(k, String(v))
    }
  }
  const qs = params.toString()
  const path = `/issues/export-csv${qs ? `?${qs}` : ''}`
  return requestBlob(path, 'text/csv')
}

export { request, requestBlob }
