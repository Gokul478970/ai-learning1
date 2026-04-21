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

export const authDemoLogin = (otp: string) =>
  fetch(`${BASE}/auth/demo-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ otp }),
  }).then(async (r) => {
    const data = await r.json()
    if (!r.ok) throw new Error(data.detail || 'Demo login failed')
    return data
  })

// --- Projects ---
export const getProjects = () => request<any[]>('/projects');
export const getProject = (key: string) => request<any>(`/projects/${key}`);
export const createProject = (data: any) =>
  request<any>('/projects', { method: 'POST', body: JSON.stringify(data) });
export const getProjectIssues = (key: string, params?: Record<string, string>) => {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return request<any>(`/projects/${key}/issues${qs}`);
};
export const getProjectVersions = (key: string) => request<any[]>(`/projects/${key}/versions`);

// --- Issues ---
export const getIssue = (key: string) => request<any>(`/issues/${key}`);
export const createIssue = (data: any) =>
  request<any>('/issues', { method: 'POST', body: JSON.stringify(data) });
export const updateIssue = (key: string, data: any) =>
  request<any>(`/issues/${key}`, { method: 'PATCH', body: JSON.stringify(data) });
export const deleteIssue = (key: string) =>
  request<any>(`/issues/${key}`, { method: 'DELETE' });
export const transitionIssue = (key: string, status: string) =>
  request<any>(`/issues/${key}/transition`, { method: 'POST', body: JSON.stringify({ status }) });
export const addComment = (key: string, body: string) =>
  request<any>(`/issues/${key}/comments`, { method: 'POST', body: JSON.stringify({ body }) });
export const linkIssues = (from_key: string, to_key: string, type: string) =>
  request<any>('/issues/links', { method: 'POST', body: JSON.stringify({ from_key, to_key, type }) });

/**
 * Export backlog as CSV. Returns the Blob and parsed filename.
 * Forwards bearer token and all filter params per the API contract.
 */
export async function exportBacklogCsv(
  params: Record<string, string>,
  signal?: AbortSignal
): Promise<{ blob: Blob; filename: string }> {
  const token = getToken()
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`

  const qs = params && Object.keys(params).length > 0
    ? '?' + new URLSearchParams(params).toString()
    : ''
  const res = await fetch(`${BASE}/issues/backlog/export${qs}`, {
    method: 'GET',
    headers,
    signal,
  })

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
    } catch {
      // response may not be JSON
    }
    throw new Error(detail)
  }

  const cd = res.headers.get('Content-Disposition') || ''
  let filename = 'backlog_export.csv'
  const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd)
  if (m && m[1]) {
    try {
      filename = decodeURIComponent(m[1].trim())
    } catch {
      filename = m[1].trim()
    }
  }
  const blob = await res.blob()
  return { blob, filename }
}

// --- Boards & Sprints ---
export const getBoards = (projectKey?: string) => {
  const qs = projectKey ? `?project_key=${projectKey}` : '';
  return request<any[]>(`/boards${qs}`);
};
export const getBoardSprints = (boardId: string) =>
  request<any[]>(`/boards/${boardId}/sprints`);
export const createSprint = (boardId: string, data: any) =>
  request<any>(`/boards/${boardId}/sprints`, { method: 'POST', body: JSON.stringify(data) });
export const updateSprint = (sprintId: string, data: any) =>
  request<any>(`/sprints/${sprintId}`, { method: 'PATCH', body: JSON.stringify(data) });
export const addIssuesToSprint = (sprintId: string, issue_keys: string[]) =>
  request<any>(`/sprints/${sprintId}/issues`, { method: 'POST', body: JSON.stringify({ issue_keys }) });
export const startSprint = (sprintId: string) =>
  request<any>(`/sprints/${sprintId}/start`, { method: 'POST' });
export const completeSprint = (sprintId: string) =>
  request<any>(`/sprints/${sprintId}/complete`, { method: 'POST' });

// --- Assignments ---
export const getAssignments = (projectKey: string) =>
  request<any[]>(`/projects/${projectKey}/assignments`);
export const createAssignment = (projectKey: string, data: any) =>
  request<any>(`/projects/${projectKey}/assignments`, { method: 'POST', body: JSON.stringify(data) });
export const updateAssignment = (projectKey: string, assignmentId: string, data: any) =>
  request<any>(`/projects/${projectKey}/assignments/${assignmentId}`, { method: 'PATCH', body: JSON.stringify(data) });
export const deleteAssignment = (projectKey: string, assignmentId: string) =>
  request<any>(`/projects/${projectKey}/assignments/${assignmentId}`, { method: 'DELETE' });

// --- Users ---
export const getUsers = () => request<any[]>('/users');
export const getMe = () => request<any>('/users/me');
export const updateMe = (data: any) =>
  request<any>('/users/me', { method: 'PATCH', body: JSON.stringify(data) });

// --- Admin ---
export const adminListUsers = () => request<any[]>('/admin/users');
export const adminUpdateUser = (userId: string, data: any) =>
  request<any>(`/admin/users/${userId}`, { method: 'PATCH', body: JSON.stringify(data) });
export const adminDeleteUser = (userId: string) =>
  request<any>(`/admin/users/${userId}`, { method: 'DELETE' });

// --- Search ---
export const search = (q: string) =>
  request<any>(`/search?q=${encodeURIComponent(q)}`);

// --- Dashboards / Reports ---
export const getDashboard = (projectKey: string) =>
  request<any>(`/projects/${projectKey}/dashboard`);
export const getVelocity = (boardId: string) =>
  request<any>(`/boards/${boardId}/velocity`);
export const getBurndown = (sprintId: string) =>
  request<any>(`/sprints/${sprintId}/burndown`);

// --- CSV Import ---
export const importIssuesCsv = async (projectKey: string, file: File) => {
  const token = getToken()
  const form = new FormData()
  form.append('file', file)
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(`${BASE}/projects/${projectKey}/issues/import`, {
    method: 'POST',
    headers,
    body: form,
  })
  if (res.status === 401) {
    clearSession()
    window.location.reload()
    throw new Error('Session expired')
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || res.statusText)
  }
  return res.json()
}
