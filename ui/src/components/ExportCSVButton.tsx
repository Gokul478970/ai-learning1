import { useEffect, useRef, useState } from 'react'
import { Loader2, Download } from 'lucide-react'
import { exportBacklogCsv } from '@/lib/api'

interface ExportCSVButtonProps {
  projectKey?: string
  filters?: Record<string, string | undefined>
  className?: string
}

export function ExportCSVButton({ projectKey, filters, className }: ExportCSVButtonProps) {
  const [isExporting, setIsExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (abortRef.current) abortRef.current.abort()
    }
  }, [])

  const buildParams = (): Record<string, string> => {
    const params: Record<string, string> = {}
    if (projectKey) params.project_key = projectKey
    if (filters) {
      for (const [k, v] of Object.entries(filters)) {
        if (v !== undefined && v !== null && v !== '') params[k] = String(v)
      }
    }
    return params
  }

  const handleClick = async () => {
    if (isExporting) return
    setIsExporting(true)
    setError(null)
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const { blob, filename } = await exportBacklogCsv(buildParams(), controller.signal)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename || 'backlog_export.csv'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (e: any) {
      if (e?.name === 'AbortError') return
      if (mountedRef.current) {
        setError(e?.message || 'Export failed')
      }
    } finally {
      if (mountedRef.current) setIsExporting(false)
    }
  }

  const baseClass =
    className ||
    'inline-flex items-center gap-2 px-3 py-2 rounded-md border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed'

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={isExporting}
        aria-busy={isExporting}
        aria-label="Export CSV"
        className={baseClass}
      >
        {isExporting ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            <span>Exporting…</span>
          </>
        ) : (
          <>
            <Download className="w-4 h-4" aria-hidden="true" />
            <span>Export CSV</span>
          </>
        )}
      </button>
      {error && (
        <span role="alert" className="text-sm text-red-600 ml-2">
          {error}
        </span>
      )}
    </>
  )
}

export default ExportCSVButton
