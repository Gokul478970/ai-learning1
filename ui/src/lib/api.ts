// ui/src/lib/api.ts — fetch wrapper with bearer token and CSV export helper.

export type QueryParams = Record<string, string | number | boolean | null | undefined>;

const API_BASE = "";

export function getToken(): string | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage.getItem("token") : null;
  } catch {
    return null;
  }
}

function clearSessionAndReload(): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.removeItem("token");
  } catch {
    /* ignore */
  }
  if (typeof window !== "undefined" && window.location) {
    window.location.reload();
  }
}

function buildQuery(params?: QueryParams): string {
  if (!params) return "";
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    usp.append(k, String(v));
  }
  const s = usp.toString();
  return s ? `?${s}` : "";
}

export async function request<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = getToken();
  const headers = new Headers(init.headers || {});
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (!headers.has("Content-Type") && init.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (res.status === 401) {
    clearSessionAndReload();
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      if (data && typeof data.detail === "string") detail = data.detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  const ctype = res.headers.get("Content-Type") || "";
  if (ctype.includes("application/json")) {
    return (await res.json()) as T;
  }
  return (await res.text()) as unknown as T;
}

export async function exportBacklogCsv(
  projectKey: string,
  params?: QueryParams,
): Promise<Blob> {
  const token = getToken();
  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const url = `${API_BASE}/api/projects/${encodeURIComponent(projectKey)}/issues/export.csv${buildQuery(params)}`;
  const res = await fetch(url, { method: "GET", headers });
  if (res.status === 401) {
    clearSessionAndReload();
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      if (data && typeof data.detail === "string") detail = data.detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return await res.blob();
}
