import { useMemo, useState } from 'react';
import ExportCSVButton from '@/components/ExportCSVButton';

interface BacklogFilters {
  status?: string;
  issue_type?: string;
  assignee?: string;
  sprint_id?: string;
  labels?: string;
}

export default function Backlog() {
  const [projectKey, setProjectKey] = useState<string>('');
  const [filters, setFilters] = useState<BacklogFilters>({});

  const exportFilters = useMemo(() => ({ ...filters }), [filters]);

  const handleImportClick = () => {
    const input = document.getElementById('backlog-import-input') as HTMLInputElement | null;
    input?.click();
  };

  return (
    <div className="backlog-page">
      <header className="backlog-header">
        <h1>Product Backlog</h1>
        <div className="backlog-toolbar" role="toolbar" aria-label="Backlog actions">
          <label htmlFor="backlog-project-select" className="sr-only">Project</label>
          <select
            id="backlog-project-select"
            value={projectKey}
            onChange={(e) => setProjectKey(e.target.value)}
            aria-label="Project"
          >
            <option value="">All projects</option>
          </select>
          <label htmlFor="backlog-status-filter" className="sr-only">Status</label>
          <select
            id="backlog-status-filter"
            value={filters.status ?? ''}
            onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value || undefined }))}
            aria-label="Status filter"
          >
            <option value="">All statuses</option>
            <option value="To Do">To Do</option>
            <option value="In Progress">In Progress</option>
            <option value="Done">Done</option>
          </select>
          <input
            id="backlog-import-input"
            type="file"
            accept=".csv"
            style={{ display: 'none' }}
            aria-hidden="true"
          />
          <button
            type="button"
            onClick={handleImportClick}
            aria-label="Import CSV"
            className="btn btn-secondary"
            data-testid="import-csv-button"
          >
            Import CSV
          </button>
          <ExportCSVButton projectKey={projectKey || undefined} filters={exportFilters} />
        </div>
      </header>
      <main className="backlog-body">
        {/* Backlog list rendering preserved from existing implementation */}
      </main>
    </div>
  );
}
