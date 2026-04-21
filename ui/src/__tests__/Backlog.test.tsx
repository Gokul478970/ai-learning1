import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/lib/api', () => ({ exportBacklogCsv: vi.fn() }));

import Backlog from '../pages/Backlog';

describe('Backlog page', () => {
  it('renders Import CSV and Export CSV side-by-side', () => {
    render(<Backlog />);
    expect(screen.getByRole('button', { name: /import csv/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /export csv/i })).toBeTruthy();
  });
});
