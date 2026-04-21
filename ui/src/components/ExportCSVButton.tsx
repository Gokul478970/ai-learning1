import React from "react";
import type { BacklogItem } from "@/utils/exportBacklog";

interface ExportCSVButtonProps {
  params?: Record<string, string>;
  items?: BacklogItem[];
  onEmpty?: () => void;
  onError?: (error: Error) => void;
}

/**
 * @deprecated Export CSV functionality has been removed.
 * This component is retained only for backward compatibility with existing imports.
 */
const ExportCSVButton: React.FC<ExportCSVButtonProps> = () => {
  return null;
};

export default ExportCSVButton;
