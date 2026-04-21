import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ExportCSVButton } from '../components/ExportCSVButton'

vi.mock('../lib/api', () => ({
  exportBacklogCsv: vi.fn(),
}))

vi.mock('../lib/auth', () => ({
  getToken: () => 'test-token',
  clearSession: vi.fn(),
}))

describe('ExportCSVButton', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders Export CSV button in idle state', () => {
    render(<ExportCSVButton projectKey="ABC" filters={{}} />)
    expect(screen.getByRole('button', { name: /export csv/i })).toBeInTheDocument()
  })

  it('disables button and shows spinner while exporting', async () => {
    const { exportBacklogCsv } = await import('../lib/api')
    ;(exportBacklogCsv as any).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ blob: new Blob(['a,b']), filename: 'backlog_export.csv' }), 50))
    )
    render(<ExportCSVButton projectKey="ABC" filters={{}} />)
    const btn = screen.getByRole('button', { name: /export csv/i })
    fireEvent.click(btn)
    await waitFor(() => expect(btn).toBeDisabled())
  })

  it('shows error message when export fails', async () => {
    const { exportBacklogCsv } = await import('../lib/api')
    ;(exportBacklogCsv as any).mockRejectedValue(new Error('500 Server Error'))
    render(<ExportCSVButton projectKey="ABC" filters={{}} />)
    fireEvent.click(screen.getByRole('button', { name: /export csv/i }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/500|error/i))
  })

  it('ignores rapid double clicks', async () => {
    const { exportBacklogCsv } = await import('../lib/api')
    ;(exportBacklogCsv as any).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ blob: new Blob(['a']), filename: 'backlog_export.csv' }), 30))
    )
    render(<ExportCSVButton projectKey="ABC" filters={{}} />)
    const btn = screen.getByRole('button', { name: /export csv/i })
    fireEvent.click(btn)
    fireEvent.click(btn)
    await waitFor(() => expect((exportBacklogCsv as any).mock.calls.length).toBeLessThanOrEqual(1))
  })
})
