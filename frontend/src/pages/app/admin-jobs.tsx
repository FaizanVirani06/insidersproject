"use client";

import * as React from "react";
import { apiFetch } from "@/lib/api";

export function AdminJobsPage() {
  const [jobs, setJobs] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await apiFetch("/api/backend/admin/jobs?limit=200", { cache: "no-store" });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        if (!cancelled) setJobs(data?.jobs ?? []);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Failed to load jobs");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Admin Jobs</h1>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">
          Read-only view. Ops actions should stay admin-only.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-black/60 dark:text-white/60">Loading…</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-white p-4 shadow-sm dark:bg-black/20">
          <table className="w-full text-left text-xs">
            <thead className="text-black/50 dark:text-white/50">
              <tr>
                <th className="py-1 pr-3">Created</th>
                <th className="py-1 pr-3">Type</th>
                <th className="py-1 pr-3">Status</th>
                <th className="py-1 pr-3">Attempts</th>
                <th className="py-1 pr-3">Dedupe</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j: any) => (
                <tr key={j.job_id} className="border-t">
                  <td className="py-1 pr-3">{j.created_at}</td>
                  <td className="py-1 pr-3">{j.job_type}</td>
                  <td className="py-1 pr-3">{j.status}</td>
                  <td className="py-1 pr-3">
                    {j.attempts}/{j.max_attempts}
                  </td>
                  <td className="py-1 pr-3 font-mono text-[10px]">{j.dedupe_key}</td>
                </tr>
              ))}

              {jobs.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-2 text-black/60 dark:text-white/60">
                    No jobs.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}