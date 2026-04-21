const { describe, it, expect } = require('vitest');
const fs = require('fs');
const path = require('path');

describe('BacklogPageExportRemoval', () => {
  const backlogPath = path.resolve(__dirname, '..', 'pages', 'Backlog.tsx');
  const backlogSource = fs.readFileSync(backlogPath, 'utf-8');

  it('should not contain ExportCSVButton import', () => {
    expect(backlogSource).not.toContain("import ExportCSVButton");
    expect(backlogSource).not.toContain("from '@/components/ExportCSVButton'");
  });

  it('should not render ExportCSVButton component', () => {
    expect(backlogSource).not.toContain('<ExportCSVButton');
  });

  it('should not contain handleExportError function', () => {
    expect(backlogSource).not.toContain('handleExportError');
  });

  it('should not contain exportParams variable', () => {
    expect(backlogSource).not.toContain('exportParams');
  });

  it('should still contain Import CSV button', () => {
    expect(backlogSource).toContain('Import CSV');
    expect(backlogSource).toContain('ImportCsvDialog');
    expect(backlogSource).toContain('setShowImport');
  });

  it('should still import ImportCsvDialog', () => {
    expect(backlogSource).toContain("import { ImportCsvDialog }");
  });

  it('should still contain CreateIssueDialog', () => {
    expect(backlogSource).toContain('CreateIssueDialog');
  });

  it('should export the Backlog component', () => {
    expect(backlogSource).toContain('export function Backlog()');
  });
});
