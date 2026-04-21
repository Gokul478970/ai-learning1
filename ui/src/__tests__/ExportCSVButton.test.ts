import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ExportCSVButton from '../components/ExportCSVButton';
import type { BacklogItem } from '../utils/exportBacklog';

// Mock the exportBacklog utility
vi.mock('../utils/exportBacklog', () => ({
  exportBacklogToXlsx: vi.fn().mockReturnValue(true),
}));

describe('ExportCSVButton', () => {
  it('should render the Export CSV button with correct text', () => {
    render(React.createElement(ExportCSVButton, { items: [] }));
    const button = screen.getByRole('button', { name: /export csv/i });
    expect(button).toBeDefined();
    expect(button.textContent).toContain('Export CSV');
  });

  it('should have aria-label for accessibility', () => {
    render(React.createElement(ExportCSVButton, { items: [] }));
    const button = screen.getByRole('button', { name: /export csv/i });
    expect(button.getAttribute('aria-label')).toBe('Export CSV');
  });

  it('should be keyboard focusable', () => {
    render(React.createElement(ExportCSVButton, { items: [] }));
    const button = screen.getByRole('button', { name: /export csv/i });
    button.focus();
    expect(document.activeElement).toBe(button);
  });

  it('should call onEmpty when items array is empty', () => {
    const onEmpty = vi.fn();
    render(React.createElement(ExportCSVButton, { items: [], onEmpty }));
    const button = screen.getByRole('button', { name: /export csv/i });
    fireEvent.click(button);
    expect(onEmpty).toHaveBeenCalledTimes(1);
  });

  it('should call exportBacklogToXlsx when items are present', async () => {
    const { exportBacklogToXlsx } = await import('../utils/exportBacklog');
    const items: BacklogItem[] = [
      {
        key: 'TEST-1',
        fields: {
          summary: 'Test item',
          issuetype: { name: 'Story' },
          status: { name: 'Open' },
          priority: { name: 'Medium' },
        },
      },
    ];
    render(React.createElement(ExportCSVButton, { items }));
    const button = screen.getByRole('button', { name: /export csv/i });
    fireEvent.click(button);
    expect(exportBacklogToXlsx).toHaveBeenCalledWith(items);
  });

  it('should not call onEmpty when items are present', () => {
    const onEmpty = vi.fn();
    const items: BacklogItem[] = [
      {
        key: 'TEST-1',
        fields: {
          summary: 'Test item',
          issuetype: { name: 'Story' },
          status: { name: 'Open' },
          priority: { name: 'Medium' },
        },
      },
    ];
    render(React.createElement(ExportCSVButton, { items, onEmpty }));
    const button = screen.getByRole('button', { name: /export csv/i });
    fireEvent.click(button);
    expect(onEmpty).not.toHaveBeenCalled();
  });

  it('should match Import CSV button styling classes', () => {
    render(React.createElement(ExportCSVButton, { items: [] }));
    const button = screen.getByRole('button', { name: /export csv/i });
    expect(button.className).toContain('inline-flex');
    expect(button.className).toContain('rounded-md');
    expect(button.className).toContain('border-gray-300');
    expect(button.className).toContain('bg-white');
    expect(button.className).toContain('text-gray-700');
  });
});
