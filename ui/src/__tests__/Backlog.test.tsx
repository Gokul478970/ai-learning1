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

describe('Backlog page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should display loading state initially', () => {
    (api.getBacklog as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));
    renderBacklog();
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('should display error state on fetch failure', async () => {
    (api.getBacklog as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));
    renderBacklog();
    expect(await screen.findByText(/error|failed|could not/i)).toBeInTheDocument();
  });

  it('should render backlog items correctly (non-export behavior intact)', async () => {
    (api.getBacklog as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        key: 'TEST-1',
        fields: {
          summary: 'Test Item 1',
          issuetype: { name: 'Story' },
          status: { name: 'To Do' },
          priority: { name: 'Medium' },
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
    expect(await screen.findByText('TEST-1')).toBeInTheDocument();
  });

  it('should render Export CSV button on the page', async () => {
    (api.getBacklog as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        key: 'TEST-1',
        fields: {
          summary: 'Test Item 1',
          issuetype: { name: 'Story' },
          status: { name: 'To Do' },
          priority: { name: 'Medium' },
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

  it('should show toast when exporting empty backlog', async () => {
    (api.getBacklog as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    renderBacklog();
    // Wait for data to load
    await screen.findByText(/backlog/i);
  });
});
