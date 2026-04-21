import { useState, useCallback } from 'react'
import { Loader2, Download } from 'lucide-react'
import { exportBacklogCsv, type BacklogExportFilters } from '@/lib/api'
import { triggerBlobDownload, BACKLOG_EXPORT_FILENAME } from '@/utils/exportBacklog'

export interface ExportCSVButtonProps {
  /** Current project key (maps to backend project_id filter). */
  projectKey?: string | null
  /** Currently applied backlog filters; forwarded as query params. */
  filters?: Omit<BacklogExportFilters, 'project_id'>
  /** Optional className to override/extend default button styling. */
  className?: string
  /** Called with an error message when export fails. */
  onError?: (message: string) => void
  /** Optional label override (default: "Export CSV"). */
  label?: string
}

/**
 * Export CSV button for the Backlog page. Fetches the filtered backlog as a CSV
 * from the backend and triggers a browser download. Disables itself while
 * the download is in progress to prevent duplicate requests.
 */
export function ExportCSVButton({
  projectKey,
  filters,
  className,
  onError,
  label = 'Export CSV',
}: ExportCSVButtonProps) {
  const [loading, setLoading] = useState(false)

  const handleClick = useCallback(async () => {
    if (loading) return
    setLoading(true)
    try {
      const blob = await exportBacklogCsv({
        project_id: projectKey ?? undefined,
        ...(filters || {}),
      })
      triggerBlobDownload(blob, BACKLOG_EXPORT_FILENAME)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Export failed'
      if (onError) onError(message)
      else console.error('Backlog CSV export failed:', message)
    } finally {
      setLoading(false)
    }
  }, [loading, projectKey, filters, onError])

  const defaultClass =
    'inline-flex items-center gap-2 rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed'

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      aria-disabled={loading}
      aria-busy={loading}
      className={className ?? defaultClass}
      title="Export current backlog view to CSV"
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        <Download className="h-4 w-4" aria-hidden="true" />
      )}
      <span>{loading ? 'Exporting…' : label}</span>
    </button>
  )
}

export default ExportCSVButton
