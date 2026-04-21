import { useState } from 'react';
import { exportBacklogCsv, type ExportBacklogParams } from '@/lib/api';

export interface ExportCSVButtonProps {
  projectKey?: string;
  filters?: {
    status?: string;
    issue_type?: string;
    assignee?: string;
    sprint_id?: string;
    labels?: string;
  };
  disabled?: boolean;
  className?: string;
}

export default function ExportCSVButton({ projectKey, filters, disabled, className }: ExportCSVButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    const params: ExportBacklogParams = {
      project_key: projectKey,
      status: filters?.status,
      issue_type: filters?.issue_type,
      assignee: filters?.assignee,
      sprint_id: filters?.sprint_id,
      labels: filters?.labels,
    };
    try {
      const blob = await exportBacklogCsv(params);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'backlog_export.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Export failed';
      if (!/\b401\b/.test(msg)) {
        setError(msg);
        if (typeof window !== 'undefined' && typeof window.alert === 'function') {
          window.alert(`Export failed: ${msg}`);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading || disabled}
      aria-disabled={loading || disabled}
      aria-busy={loading}
      aria-label="Export CSV"
      title={error ? `Last error: ${error}` : 'Export CSV'}
      className={className ?? 'btn btn-secondary'}
      data-testid="export-csv-button"
    >
      {loading ? 'Exporting…' : 'Export CSV'}
    </button>
  );
}
