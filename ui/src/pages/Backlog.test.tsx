import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom';

// Mock the API module
vi.mock('../lib/api', () => ({
  api: {
    getBacklog: vi.fn(),
    getEpics: vi.fn().mockResolvedValue([]),
    getSprints: vi.fn().mockResolvedValue([]),
    getProject: vi.fn().mockResolvedValue({ key: 'TEST', name: 'Test Project' }),
  },
}));

import { api } from '../lib/api';

function renderBacklog() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  // Dynamically import to get the real Backlog page
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Backlog } = require('../pages/Backlog');

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/projects/TEST/backlog']}>
        <Routes>
          <Route path="/projects/:projectKey/backlog" element={<Backlog />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('Backlog page - Export CSV integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the Backlog heading with export button', async () => {
    (api.getBacklog as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        key: 'TEST-1',
        fields: {
          summary: 'A backlog item',
          issuetype: { name: 'Story' },
          status: { name: 'Open' },
          priority: { name: 'High' },
          assignee: null,
          reporter: null,
          labels: [],
          components: [],
          fixVersions: [],
          created: '2024-01-01',
          updated: '2024-01-02',
          description: null,
        },
      },
    ]);
    renderBacklog();
    expect(await screen.findByRole('button', { name: /export csv/i })).toBeInTheDocument();
  });

  it('renders export button that is keyboard focusable', async () => {
    (api.getBacklog as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        key: 'TEST-2',
        fields: {
          summary: 'Another item',
          issuetype: { name: 'Bug' },
          status: { name: 'Open' },
          priority: { name: 'Low' },
          assignee: null,
          reporter: null,
          labels: [],
          components: [],
          fixVersions: [],
          created: '2024-01-01',
          updated: '2024-01-02',
          description: null,
        },
      },
    ]);
    renderBacklog();
    const btn = await screen.findByRole('button', { name: /export csv/i });
    expect(btn).not.toBeDisabled();
    expect(btn.getAttribute('type')).toBe('button');
  });

  it('shows loading state initially', () => {
    (api.getBacklog as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));
    renderBacklog();
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });
});
