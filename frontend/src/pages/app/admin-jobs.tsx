import * as React from "react";
import { Link } from "react-router-dom";

import { apiFetch } from "@/lib/api";

type JobRow = {
  job_id: number;
  job_type: string;
  status: string;
  dedupe_key: string;
  attempts: number;
  last_error?: string | null;
  created_at: string;
  updated_at: string;
};

type JobsResponse = {
  jobs: JobRow[];
  counts: Record<string, number>;
};

export function AdminJobsPage() {
  const [data, setData] = React.useState<JobsResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [status, setStatus] = React.useState<string>("all");
  const [refreshKey, setRefreshKey] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const url = new URL("/api/backend/admin/jobs", window.location.origin);
        url.searchParams.set("limit", "200");
        if (status !== "all") url.searchParams.set("status", status);
        const res = await apiFetch(url.pathname + url.search, { cache: "no-store" });
        if (!res.ok) throw new Error(await res.text());
        const json = (await res.json()) as JobsResponse;
        if (!cancelled) setData(json);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Failed to load jobs");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, refreshKey]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Jobs</h1>
          <p className="mt-1 text-sm muted">
            Raw job rows (latest first). For aggregate health, use{" "}
            <Link className="link" to="/app/admin/monitoring">
              Monitoring
            </Link>
            .
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            className="input h-9 w-[180px]"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="all">All statuses</option>
            <option value="pending">pending</option>
            <option value="running">running</option>
            <option value="success">success</option>
            <option value="error">error</option>
          </select>

          <button type="button" className="btn-secondary" onClick={() => setRefreshKey((x) => x + 1)}>
            Refresh
          </button>
        </div>
      </div>

      <div className="glass-panel p-4">
        <div className="text-sm font-semibold">Counts</div>
        <div className="mt-2 flex flex-wrap gap-2 text-sm">
          {data?.counts
            ? Object.entries(data.counts).map(([k, v]) => (
                <span key={k} className="badge">
                  {k}: {v}
                </span>
              ))
            : "—"}
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="glass-card overflow-hidden">
        <div className="border-b border-zinc-200/70 px-4 py-3 text-sm font-semibold dark:border-zinc-800/60">
          Latest jobs
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr className="border-b border-zinc-200/70 dark:border-zinc-800/60">
                <th className="px-4 py-3">id</th>
                <th className="px-4 py-3">type</th>
                <th className="px-4 py-3">status</th>
                <th className="px-4 py-3">attempts</th>
                <th className="px-4 py-3">updated</th>
                <th className="px-4 py-3">dedupe</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td className="px-4 py-4 muted" colSpan={6}>
                    Loading…
                  </td>
                </tr>
              )}

              {!loading && data?.jobs?.length === 0 && (
                <tr>
                  <td className="px-4 py-4 muted" colSpan={6}>
                    No jobs.
                  </td>
                </tr>
              )}

              {data?.jobs?.map((j) => (
                <tr key={j.job_id} className="border-b border-zinc-200/60 dark:border-zinc-800/60">
                  <td className="px-4 py-3 font-mono text-xs">{j.job_id}</td>
                  <td className="px-4 py-3">{j.job_type}</td>
                  <td className="px-4 py-3">
                    <span className="badge">{j.status}</span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{j.attempts}</td>
                  <td className="px-4 py-3 font-mono text-xs">{j.updated_at}</td>
                  <td className="px-4 py-3 font-mono text-xs">{j.dedupe_key}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="text-xs muted">
        Tip: errors are often best diagnosed by filtering status = <span className="font-mono">error</span> and reading the worker logs.
      </div>
    </div>
  );
}
