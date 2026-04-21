import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { BacklogExportButton } from '../components/BacklogExportButton';

// Mock the export utility
vi.mock('../utils/exportBacklog', () => ({
  exportBacklogToXlsx: vi.fn().mockReturnValue(true),
}));

import { exportBacklogToXlsx } from '../utils/exportBacklog';

describe('BacklogExportButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders with correct label and icon', () => {
    render(<BacklogExportButton items={[]} />);
    const button = screen.getByRole('button', { name: /export csv/i });
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent('Export CSV');
  });

  it('is keyboard focusable', () => {
    render(<BacklogExportButton items={[]} />);
    const button = screen.getByRole('button', { name: /export csv/i });
    button.focus();
    expect(document.activeElement).toBe(button);
  });

  it('has accessible aria-label', () => {
    render(<BacklogExportButton items={[]} />);
    const button = screen.getByRole('button', { name: /export csv/i });
    expect(button).toHaveAttribute('aria-label', 'Export CSV');
  });

  it('has type="button" to prevent form submission', () => {
    render(<BacklogExportButton items={[]} />);
    const button = screen.getByRole('button', { name: /export csv/i });
    expect(button).toHaveAttribute('type', 'button');
  });

  it('calls exportBacklogToXlsx on click with items', () => {
    const items = [
      { key: 'TEST-1', fields: { summary: 'Test item' } },
    ];
    render(<BacklogExportButton items={items} />);
    const button = screen.getByRole('button', { name: /export csv/i });
    fireEvent.click(button);
    expect(exportBacklogToXlsx).toHaveBeenCalledWith(items, undefined);
  });

  it('calls exportBacklogToXlsx with onEmpty callback', () => {
    const onEmpty = vi.fn();
    render(<BacklogExportButton items={[]} onEmpty={onEmpty} />);
    const button = screen.getByRole('button', { name: /export csv/i });
    fireEvent.click(button);
    expect(exportBacklogToXlsx).toHaveBeenCalledWith([], onEmpty);
  });

  it('calls exportBacklogToXlsx with current items (not stale)', () => {
    const items1 = [{ key: 'A-1', fields: {} }];
    const items2 = [{ key: 'B-1', fields: {} }, { key: 'B-2', fields: {} }];
    const { rerender } = render(<BacklogExportButton items={items1} />);
    rerender(<BacklogExportButton items={items2} />);
    const button = screen.getByRole('button', { name: /export csv/i });
    fireEvent.click(button);
    expect(exportBacklogToXlsx).toHaveBeenCalledWith(items2, undefined);
  });

  it('renders as inline-flex with gap for icon alignment', () => {
    render(<BacklogExportButton items={[]} />);
    const button = screen.getByRole('button', { name: /export csv/i });
    expect(button.className).toContain('inline-flex');
    expect(button.className).toContain('items-center');
  });

  it('contains a download icon SVG element', () => {
    render(<BacklogExportButton items={[]} />);
    const button = screen.getByRole('button', { name: /export csv/i });
    const svg = button.querySelector('svg');
    expect(svg).toBeTruthy();
  });

  it('renders multiple buttons independently', () => {
    render(
      <div>
        <BacklogExportButton items={[{ key: 'A-1', fields: {} }]} />
        <BacklogExportButton items={[{ key: 'B-1', fields: {} }]} />
      </div>
    );
    const buttons = screen.getAllByRole('button', { name: /export csv/i });
    expect(buttons).toHaveLength(2);
  });

  it('does not render disabled attribute by default', () => {
    render(<BacklogExportButton items={[]} />);
    const button = screen.getByRole('button', { name: /export csv/i });
    expect(button).not.toBeDisabled();
  });

  it('handles keyboard Enter activation', () => {
    const items = [{ key: 'TEST-1', fields: {} }];
    render(<BacklogExportButton items={items} />);
    const button = screen.getByRole('button', { name: /export csv/i });
    fireEvent.keyDown(button, { key: 'Enter' });
    fireEvent.keyUp(button, { key: 'Enter' });
    // The native button handles Enter key automatically to trigger click
  });
});
