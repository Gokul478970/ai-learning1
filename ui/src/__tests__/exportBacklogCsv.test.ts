import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../lib/auth', () => ({
  getToken: () => 'test-token',
  clearSession: vi.fn(),
}))

describe('exportBacklogCsv', () => {
  const originalFetch = global.fetch
  beforeEach(() => { vi.resetModules() })
  afterEach(() => { global.fetch = originalFetch })

  it('sends GET with bearer token and forwards all filter params', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'attachment; filename=backlog_export.csv' },
      blob: async () => new Blob(['key,summary\n']),
    })
    global.fetch = fetchMock as any
    const { exportBacklogCsv } = await import('../lib/api')
    const res = await exportBacklogCsv({ project_key: 'ABC', status: 'Open', assignee: 'a@b.c' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/api/issues/backlog/export')
    expect(url).toContain('project_key=ABC')
    expect(url).toContain('status=Open')
    expect(url).toContain('assignee=a%40b.c')
    expect(init.method).toBe('GET')
    expect(init.headers.Authorization).toBe('Bearer test-token')
    expect(res.filename).toBe('backlog_export.csv')
  })

  it('falls back to backlog_export.csv when Content-Disposition missing', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      blob: async () => new Blob(['']),
    })
    global.fetch = fetchMock as any
    const { exportBacklogCsv } = await import('../lib/api')
    const res = await exportBacklogCsv({})
    expect(res.filename).toBe('backlog_export.csv')
  })

  it('throws on non-2xx response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      headers: { get: () => null },
      json: async () => ({ detail: 'boom' }),
    })
    global.fetch = fetchMock as any
    const { exportBacklogCsv } = await import('../lib/api')
    await expect(exportBacklogCsv({})).rejects.toThrow(/boom/)
  })
})
