
export type BacklogItem = {
  key: string
  fields?: {
    summary?: string
    issuetype?: { name?: string }
    status?: { name?: string }
    priority?: { name?: string }
    assignee?: { displayName?: string } | null
    reporter?: { displayName?: string } | null
    customfield_10001?: number | null
    sprint?: string | { name?: string } | null
    labels?: string[]
    components?: Array<{ name?: string }>
    fixVersions?: Array<{ name?: string }>
    created?: string
    updated?: string
    description?: string
  }
}

export const EXPORT_COLUMNS = [
  'Issue Key',
  'Summary',
  'Issue Type',
  'Status',
  'Priority',
  'Assignee',
  'Reporter',
  'Story Points',
  'Sprint',
  'Labels',
  'Components',
  'Fix Version/s',
  'Created',
  'Updated',
  'Description',
]

export function stripHtml(input: string): string {
  return (input || '').replace(/<[^>]*>/g, '')
}

export function mapIssueToRow(issue: BacklogItem): Record<string, string | number> {
  const f = issue.fields || {}
  const sprint = typeof f.sprint === 'string' ? f.sprint : (f.sprint?.name || '')
  return {
    'Issue Key': issue.key || '',
    'Summary': f.summary || '',
    'Issue Type': f.issuetype?.name || '',
    'Status': f.status?.name || '',
    'Priority': f.priority?.name || '',
    'Assignee': f.assignee?.displayName || '',
    'Reporter': f.reporter?.displayName || '',
    'Story Points': f.customfield_10001 ?? '',
    'Sprint': sprint,
    'Labels': (f.labels || []).join(', '),
    'Components': (f.components || []).map((c) => c.name || '').filter(Boolean).join(', '),
    'Fix Version/s': (f.fixVersions || []).map((v) => v.name || '').filter(Boolean).join(', '),
    'Created': f.created || '',
    'Updated': f.updated || '',
    'Description': stripHtml(f.description || ''),
  }
}

/**
 * Generate the export filename with the pattern backlog-export-YYYY-MM-DD.csv
 * Uses UTC date methods to match the backend's UTC-based filename generation.
 */
export function getExportFilename(date?: Date, extension: 'csv' | 'xlsx' = 'xlsx'): string {
  const d = date || new Date();
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `backlog-export-${year}-${month}-${day}.${extension}`;
}

/**
 * Legacy XLSX export function. The XLSX library is loaded dynamically on
 * demand so it does not increase the initial bundle size.
 */
export async function exportBacklogToXlsx(items: BacklogItem[], onEmpty?: () => void): Promise<boolean> {
  if (!items || items.length === 0) {
    onEmpty?.()
    return false
  }

  const XLSX = await import('xlsx')
  const rows = items.map(mapIssueToRow)
  const ws = XLSX.utils.json_to_sheet(rows, { header: EXPORT_COLUMNS })
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Backlog')
  XLSX.writeFile(wb, getExportFilename(undefined, 'xlsx'))
  return true
}

