import { describe, it, expect, vi } from 'vitest';
import {
  EXPORT_COLUMNS,
  mapIssueToRow,
  getExportFilename,
  stripHtml,
  exportBacklogToXlsx,
} from './exportBacklog';
import type { BacklogItem } from './exportBacklog';

// Mock XLSX to prevent actual file writes during tests
vi.mock('xlsx', () => {
  const mockUtils = {
    json_to_sheet: vi.fn().mockReturnValue({}),
    book_new: vi.fn().mockReturnValue({}),
    book_append_sheet: vi.fn(),
  };
  return {
    utils: mockUtils,
    writeFile: vi.fn(),
    default: {
      utils: mockUtils,
      writeFile: vi.fn(),
    },
  };
});

describe('exportBacklog utility', () => {
  describe('EXPORT_COLUMNS', () => {
    it('should contain all 15 required columns in the correct order', () => {
      expect(EXPORT_COLUMNS).toEqual([
        'Issue Key',
        'Summary',
        'Issue Type',
        'Status',
        'Priority',
        'Assignee',
        'Reporter',
        'Story Points',
        'Sprint',
        'Labels',
        'Components',
        'Fix Version/s',
        'Created',
        'Updated',
        'Description',
      ]);
    });
  });

  describe('mapIssueToRow', () => {
    it('should map a fully populated issue correctly', () => {
      const issue: BacklogItem = {
        key: 'PROJ-1',
        fields: {
          summary: 'Test summary',
          issuetype: { name: 'Story' },
          status: { name: 'In Progress' },
          priority: { name: 'High' },
          assignee: { displayName: 'John Doe' },
          reporter: { displayName: 'Jane Smith' },
          customfield_10001: 5,
          sprint: 'Sprint 1',
          labels: ['bug', 'urgent'],
          components: [{ name: 'Frontend' }, { name: 'Backend' }],
          fixVersions: [{ name: 'v1.0' }, { name: 'v1.1' }],
          created: '2024-01-01T00:00:00Z',
          updated: '2024-01-02T00:00:00Z',
          description: 'Test description',
        },
      };

      const row = mapIssueToRow(issue);
      expect(row['Issue Key']).toBe('PROJ-1');
      expect(row['Summary']).toBe('Test summary');
      expect(row['Issue Type']).toBe('Story');
      expect(row['Status']).toBe('In Progress');
      expect(row['Priority']).toBe('High');
      expect(row['Assignee']).toBe('John Doe');
      expect(row['Reporter']).toBe('Jane Smith');
      expect(row['Story Points']).toBe(5);
      expect(row['Sprint']).toBe('Sprint 1');
      expect(row['Labels']).toBe('bug, urgent');
      expect(row['Components']).toBe('Frontend, Backend');
      expect(row['Fix Version/s']).toBe('v1.0, v1.1');
      expect(row['Created']).toBe('2024-01-01T00:00:00Z');
      expect(row['Updated']).toBe('2024-01-02T00:00:00Z');
      expect(row['Description']).toBe('Test description');
    });

    it('should handle null/missing optional fields gracefully', () => {
      const issue: BacklogItem = {
        key: 'PROJ-2',
        fields: {
          summary: 'Minimal issue',
          issuetype: { name: 'Task' },
          status: { name: 'Open' },
          priority: { name: 'Low' },
          assignee: undefined,
          reporter: undefined,
          customfield_10001: null,
          sprint: undefined,
          labels: [],
          components: [],
          fixVersions: [],
          created: '2024-01-01',
          updated: '2024-01-01',
          description: undefined,
        },
      };

      const row = mapIssueToRow(issue);
      expect(row['Assignee']).toBe('');
      expect(row['Reporter']).toBe('');
      expect(row['Story Points']).toBe('');
      expect(row['Sprint']).toBe('');
      expect(row['Labels']).toBe('');
      expect(row['Components']).toBe('');
      expect(row['Fix Version/s']).toBe('');
      expect(row['Description']).toBe('');
    });

    it('should handle missing fields object', () => {
      const issue = { key: 'PROJ-3' } as BacklogItem;
      const row = mapIssueToRow(issue);
      expect(row['Issue Key']).toBe('PROJ-3');
      expect(row['Summary']).toBe('');
      expect(row['Issue Type']).toBe('');
      expect(row['Status']).toBe('');
      expect(row['Assignee']).toBe('');
      expect(row['Story Points']).toBe('');
      expect(row['Sprint']).toBe('');
      expect(row['Labels']).toBe('');
      expect(row['Components']).toBe('');
      expect(row['Fix Version/s']).toBe('');
      expect(row['Description']).toBe('');
    });

    it('should handle sprint as an object with name', () => {
      const issue: BacklogItem = {
        key: 'PROJ-4',
        fields: {
          summary: 'Sprint object test',
          issuetype: { name: 'Story' },
          status: { name: 'Open' },
          priority: { name: 'Medium' },
          sprint: { name: 'Sprint 3' },
        },
      };

      const row = mapIssueToRow(issue);
      expect(row['Sprint']).toBe('Sprint 3');
    });

    it('should strip HTML from description', () => {
      const issue: BacklogItem = {
        key: 'PROJ-5',
        fields: {
          summary: 'HTML desc test',
          issuetype: { name: 'Bug' },
          status: { name: 'Open' },
          priority: { name: 'High' },
          description: '<h1>Title</h1><p>Some <b>bold</b> text</p>',
        },
      };

      const row = mapIssueToRow(issue);
      expect(row['Description']).toBe('TitleSome bold text');
    });
  });

  describe('getExportFilename', () => {
    it('should return filename with correct date format', () => {
      const date = new Date(2024, 5, 15); // June 15, 2024
      expect(getExportFilename(date)).toBe('backlog-export-2024-06-15.xlsx');
    });

    it('should pad single-digit months and days', () => {
      const date = new Date(2024, 0, 5); // Jan 5, 2024
      expect(getExportFilename(date)).toBe('backlog-export-2024-01-05.xlsx');
    });

    it('should use current date when no argument provided', () => {
      const filename = getExportFilename();
      expect(filename).toMatch(/^backlog-export-\d{4}-\d{2}-\d{2}\.xlsx$/);
    });
  });

  describe('stripHtml', () => {
    it('should remove HTML tags', () => {
      expect(stripHtml('<p>Hello <b>world</b></p>')).toBe('Hello world');
    });

    it('should return empty string for empty input', () => {
      expect(stripHtml('')).toBe('');
    });

    it('should handle plain text without tags', () => {
      expect(stripHtml('plain text')).toBe('plain text');
    });
  });

  describe('exportBacklogToXlsx', () => {
    it('should return false for empty array', () => {
      expect(exportBacklogToXlsx([])).toBe(false);
    });

    it('should return true for non-empty array', () => {
      const items: BacklogItem[] = [
        {
          key: 'TEST-1',
          fields: {
            summary: 'Test',
            issuetype: { name: 'Story' },
            status: { name: 'Open' },
            priority: { name: 'Medium' },
          },
        },
      ];
      expect(exportBacklogToXlsx(items)).toBe(true);
    });
  });
});
