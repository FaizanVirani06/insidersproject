/**
 * Small fetch helper for the SPA.
 *
 * We keep the same URL shape in dev + prod:
 *   /api/backend/...  -> reverse proxy -> FastAPI
 */

export const API_BASE = "/api/backend";

function joinApiPath(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  if (p.startsWith("/api/backend")) return p;
  return `${API_BASE}${p}`;
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const url = joinApiPath(path);
  return fetch(url, {
    // Cookies are used for auth.
    credentials: "include",
    cache: "no-store",
    ...init,
  });
}

export async function apiJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await apiFetch(path, init);
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    const msg = txt || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return (await res.json()) as T;
}
