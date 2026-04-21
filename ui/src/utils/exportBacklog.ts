// CSV export column order must match backend CSV_HEADER in api/routes/issues.py
export const BACKLOG_CSV_COLUMNS = [
  'key',
  'summary',
  'issue_type',
  'status',
  'priority',
  'assignee',
  'sprint',
] as const

export const BACKLOG_EXPORT_FILENAME = 'backlog_export.csv'

/**
 * Trigger a browser download for a Blob by creating a temporary object URL
 * and clicking a hidden <a download> element. The object URL is revoked afterwards.
 */
export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  } finally {
    // Revoke on next tick to let the browser start the download first
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }
}
