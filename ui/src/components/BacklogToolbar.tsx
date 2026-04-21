import React, { useState, useCallback, useRef, useEffect } from "react";
import { Upload } from "lucide-react";
import ExportCSVButton from "./ExportCSVButton";
import type { BacklogItem } from "../utils/exportBacklog";

interface BacklogToolbarProps {
  onImportCSV?: (file: File) => void;
  backlogItems?: BacklogItem[];
  onToast?: (message: string) => void;
}

const BacklogToolbar: React.FC<BacklogToolbarProps> = ({
  onImportCSV,
  backlogItems = [],
  onToast,
}) => {
  const [notification, setNotification] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear any pending timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file && onImportCSV) {
        onImportCSV(file);
      }
    },
    [onImportCSV]
  );

  const handleExportEmpty = useCallback(() => {
    const msg = "No backlog items to export.";
    if (onToast) {
      onToast(msg);
    } else {
      // Clear any existing timeout before setting a new one
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
      }
      setNotification(msg);
      timeoutRef.current = setTimeout(() => {
        setNotification(null);
        timeoutRef.current = null;
      }, 3000);
    }
  }, [onToast]);

  return (
    <div className="flex items-center gap-2">
      <label
        className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus-within:outline-none focus-within:ring-2 focus-within:ring-indigo-500 focus-within:ring-offset-2"
        aria-label="Import CSV"
      >
        <Upload className="h-4 w-4" />
        Import CSV
        <input
          type="file"
          accept=".csv"
          className="hidden"
          onChange={handleFileChange}
        />
      </label>

      <ExportCSVButton items={backlogItems} onEmpty={handleExportEmpty} />

      {notification && (
        <div
          role="alert"
          className="ml-2 rounded-md bg-yellow-100 px-3 py-1 text-sm text-yellow-800"
        >
          {notification}
        </div>
      )}
    </div>
  );
};

export default BacklogToolbar;
