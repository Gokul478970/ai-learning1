import { getToken, clearSession } from '@/lib/auth'

const BASE = '/api'

/**
 * Parse filename from Content-Disposition header. Falls back to default.
 */
export function parseFilenameFromContentDisposition(
  header: string | null,
  fallback: string = 'backlog_export.csv',
): string {
  if (!header) return fallback
  // RFC 5987: filename*=UTF-8''...
  const starMatch = /filename\*=(?:UTF-8'')?([^;]+)/i.exec(header)
  if (starMatch && starMatch[1]) {
    try {
      return decodeURIComponent(starMatch[1].trim().replace(/^"|"$/g, ''))
    } catch {
      // fall through
    }
  }
  const match = /filename="?([^";]+)"?/i.exec(header)
  if (match && match[1]) return match[1].trim()
  return fallback
}

/**
 * Trigger a browser download of the given Blob using an anchor + object URL.
 */
export function triggerCsvBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Revoke shortly after click so browser has time to start download.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/**
 * Sentinel thrown on 401 so callers (e.g. ExportCSVButton) can suppress
 * the transient error message while the page reloads.
 */
export class SessionExpiredError extends Error {
  constructor() {
    super('Session expired')
    this.name = 'SessionExpiredError'
  }
}

/**
 * Call the backend backlog CSV export endpoint and trigger a download.
 * Forwards the current project key + active filters as query params.
 *
 * On 401: clears session and reloads the page (consistent with api.ts);
 * throws SessionExpiredError which the UI swallows silently.
 */
export async function downloadBacklogCsv(
  projectKey: string,
  filters: Record<string, string | undefined | null>,
): Promise<void> {
  if (!projectKey) throw new Error('No project selected')

  // Build query string, dropping empty/null/undefined values.
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(filters || {})) {
    if (v !== undefined && v !== null && String(v).length > 0) {
      qs.append(k, String(v))
    }
  }
  const query = qs.toString()
  const url = `${BASE}/projects/${encodeURIComponent(projectKey)}/issues/export${
    query ? `?${query}` : ''
  }`

  const token = getToken()
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`

  let res: Response
  try {
    res = await fetch(url, { method: 'GET', headers })
  } catch (e: any) {
    throw new Error(e?.message || 'Network error while exporting backlog')
  }

  if (res.status === 401) {
    // Consistent with ui/src/lib/api.ts pattern.
    clearSession()
    try {
      window.location.reload()
    } catch {
      // ignore in non-browser/test envs
    }
    // Throw a sentinel so the caller can suppress UI error surfacing.
    throw new SessionExpiredError()
  }

  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json()
      if (body && typeof body.detail === 'string') detail = body.detail
    } catch {
      // body was not JSON; keep statusText
    }
    throw new Error(detail || `Export failed (${res.status})`)
  }

  const blob = await res.blob()
  const filename = parseFilenameFromContentDisposition(
    res.headers.get('Content-Disposition'),
    'backlog_export.csv',
  )
  triggerCsvBlobDownload(blob, filename)
}
