import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/auth', () => ({ getToken: () => 'tkn', clearToken: vi.fn() }));

import { exportBacklogCsv } from '../lib/api';

describe('exportBacklogCsv', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('forwards params and returns blob', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch' as any).mockResolvedValue(
      new Response('key,summary\n', { status: 200, headers: { 'Content-Type': 'text/csv' } })
    );
    const blob = await exportBacklogCsv({ project_key: 'ABC', status: 'Done' });
    expect(blob).toBeInstanceOf(Blob);
    const url = (fetchSpy.mock.calls[0][0] as string);
    expect(url).toContain('/api/issues/export');
    expect(url).toContain('project_key=ABC');
    expect(url).toContain('status=Done');
  });

  it('throws on non-ok response', async () => {
    vi.spyOn(global, 'fetch' as any).mockResolvedValue(
      new Response(JSON.stringify({ detail: 'nope' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    );
    await expect(exportBacklogCsv()).rejects.toThrow(/nope/);
  });
});
