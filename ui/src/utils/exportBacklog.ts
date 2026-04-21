// ui/src/utils/exportBacklog.ts — browser-side CSV download helper.
import { exportBacklogCsv, type QueryParams } from "@/lib/api";

export async function downloadBacklogCsv(
  projectKey: string,
  params?: QueryParams,
  filename: string = "backlog_export.csv",
): Promise<void> {
  const blob = await exportBacklogCsv(projectKey, params);
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}
