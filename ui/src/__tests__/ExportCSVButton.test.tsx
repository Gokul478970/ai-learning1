import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/lib/api', () => ({
  exportBacklogCsv: vi.fn(async () => new Blob(['key,summary\n'], { type: 'text/csv' })),
}));

import ExportCSVButton from '../components/ExportCSVButton';
import { exportBacklogCsv } from '@/lib/api';

describe('ExportCSVButton', () => {
  beforeEach(() => { (exportBacklogCsv as any).mockClear(); });

  it('renders with accessible name', () => {
    render(<ExportCSVButton />);
    expect(screen.getByRole('button', { name: /export csv/i })).toBeTruthy();
  });

  it('disables while in flight and ignores double-click', async () => {
    render(<ExportCSVButton projectKey="ABC" />);
    const btn = screen.getByRole('button', { name: /export csv/i });
    fireEvent.click(btn);
    fireEvent.click(btn);
    await waitFor(() => expect((exportBacklogCsv as any).mock.calls.length).toBe(1));
  });

  it('surfaces error on failure', async () => {
    (exportBacklogCsv as any).mockRejectedValueOnce(new Error('boom'));
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    render(<ExportCSVButton />);
    fireEvent.click(screen.getByRole('button', { name: /export csv/i }));
    await waitFor(() => expect(alertSpy).toHaveBeenCalled());
    alertSpy.mockRestore();
  });
});
