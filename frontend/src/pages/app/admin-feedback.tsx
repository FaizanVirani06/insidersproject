import * as React from "react";

import { apiFetch } from "@/lib/api";

type FeedbackRow = {
  feedback_id: number;
  user_id: number;
  username: string;
  rating: number | null;
  category: string | null;
  message: string;
  created_at: string;
};

export function AdminFeedbackPage() {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [rows, setRows] = React.useState<FeedbackRow[]>([]);
  const [limit, setLimit] = React.useState(100);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const url = new URL("/api/backend/admin/feedback", window.location.origin);
      url.searchParams.set("limit", String(limit));
      const res = await apiFetch(url.pathname + url.search, { cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      setRows((json?.feedback ?? []) as FeedbackRow[]);
    } catch (e: any) {
      setError(e?.message || "Failed to load feedback");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limit]);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Feedback</h1>
          <p className="mt-1 text-sm muted">User-submitted feedback from the app.</p>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm muted" htmlFor="limit">
            Limit
          </label>
          <select id="limit" className="input h-9 w-[120px]" value={limit} onChange={(e) => setLimit(parseInt(e.target.value, 10))}>
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={200}>200</option>
            <option value={500}>500</option>
          </select>
          <button type="button" className="btn-secondary h-9 px-3" onClick={() => void load()} disabled={loading}>
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="glass-card overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr className="border-b border-zinc-200/70 dark:border-zinc-800/60">
              <th className="p-2">when</th>
              <th className="p-2">user</th>
              <th className="p-2">rating</th>
              <th className="p-2">category</th>
              <th className="p-2">message</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="p-3 muted" colSpan={5}>
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td className="p-3 muted" colSpan={5}>
                  No feedback.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.feedback_id} className="border-b border-zinc-200/60 last:border-0 dark:border-zinc-800/60">
                  <td className="p-2 font-mono text-xs">{r.created_at}</td>
                  <td className="p-2">{r.username || r.user_id}</td>
                  <td className="p-2">{r.rating ?? "—"}</td>
                  <td className="p-2">{r.category ?? "—"}</td>
                  <td className="p-2">
                    <div className="max-w-[720px] whitespace-pre-wrap break-words text-sm">{r.message}</div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
