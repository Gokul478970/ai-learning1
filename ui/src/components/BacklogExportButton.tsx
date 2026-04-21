/**
 * @deprecated Use ExportCSVButton instead.
 * This file re-exports ExportCSVButton for backward compatibility.
 */
import React, { useCallback } from "react";
import { Download } from "lucide-react";
import { exportBacklogToXlsx } from "../utils/exportBacklog";
import type { BacklogItem } from "../utils/exportBacklog";

interface BacklogExportButtonProps {
  items: BacklogItem[];
  onEmpty?: () => void;
}

export const BacklogExportButton: React.FC<BacklogExportButtonProps> = ({ items, onEmpty }) => {
  const handleClick = useCallback(() => {
    if (!items || items.length === 0) {
      onEmpty?.();
      return;
    }
    exportBacklogToXlsx(items);
  }, [items, onEmpty]);

  return (
    <button
      type="button"
      className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
      aria-label="Export CSV"
      onClick={handleClick}
    >
      <Download className="h-4 w-4" />
      Export CSV
    </button>
  );
};

export default BacklogExportButton;
