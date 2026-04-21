import { describe, it, expect, vi } from 'vitest'
import { parseFilenameFromContentDisposition } from '../utils/exportBacklog'

describe('parseFilenameFromContentDisposition', () => {
  it('returns fallback when header missing', () => {
    expect(parseFilenameFromContentDisposition(null)).toBe('backlog_export.csv')
  })

  it('parses quoted filename', () => {
    expect(
      parseFilenameFromContentDisposition('attachment; filename="backlog_export_PROJ_20250101.csv"'),
    ).toBe('backlog_export_PROJ_20250101.csv')
  })

  it('parses unquoted filename', () => {
    expect(
      parseFilenameFromContentDisposition('attachment; filename=foo.csv'),
    ).toBe('foo.csv')
  })
})

describe('downloadBacklogCsv', () => {
  it('throws when projectKey is empty', async () => {
    const { downloadBacklogCsv } = await import('../utils/exportBacklog')
    await expect(downloadBacklogCsv('', {})).rejects.toThrow()
  })
})
