// ui/src/pages/Backlog.tsx — Product Backlog page with Import/Export CSV.
import React, { useState } from "react";
import { downloadBacklogCsv } from "@/utils/exportBacklog";
import type { QueryParams } from "@/lib/api";

export interface BacklogProps {
  projectKey: string;
  filters?: QueryParams;
}

export default function Backlog({ projectKey, filters }: BacklogProps): JSX.Element {
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportError, setExportError] = useState<string | null>(null);

  async function handleExportClick(): Promise<void> {
    if (isExporting) return;
    setIsExporting(true);
    setExportError(null);
    try {
      await downloadBacklogCsv(projectKey, filters);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Export failed";
      setExportError(msg);
      if (typeof window !== "undefined" && typeof window.alert === "function") {
        window.alert(`Export failed: ${msg}`);
      }
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="backlog-page">
      <div className="backlog-toolbar" role="toolbar" aria-label="Backlog actions">
        <button type="button" className="btn btn-import-csv">
          Import CSV
        </button>
        <button
          type="button"
          className="btn btn-export-csv"
          onClick={handleExportClick}
          disabled={isExporting}
          aria-busy={isExporting}
        >
          {isExporting ? "Exporting…" : "Export CSV"}
        </button>
      </div>
      {exportError ? (
        <div role="alert" className="backlog-export-error">
          {exportError}
        </div>
      ) : null}
    </div>
  );
}
