import * as React from "react";

import { apiFetch } from "@/lib/api";

type AdminUserRow = {
  user_id: number;
  username: string;
  role: "admin" | "user";
  is_active: number;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
  terms_accepted_at: string | null;
  terms_accepted_version: string | null;
  subscription_status: string | null;
  current_period_end: string | null;
  cancel_at_period_end: number;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
};

type AdminUsersResponse = {
  users: AdminUserRow[];
  total: number;
  limit: number;
  offset: number;
  next_offset: number | null;
  query: string;
  include_inactive: boolean;
};

function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString();
}

export function AdminUsersPage() {
  const [q, setQ] = React.useState("");
  const [includeInactive, setIncludeInactive] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [data, setData] = React.useState<AdminUsersResponse | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const url = new URL("/admin/users", window.location.origin);
      url.searchParams.set("limit", "200");
      if (q.trim()) url.searchParams.set("q", q.trim());
      if (includeInactive) url.searchParams.set("include_inactive", "true");

      const res = await apiFetch(url.pathname + url.search, { cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      const json = (await res.json()) as AdminUsersResponse;
      setData(json);
    } catch (e: any) {
      setError(e?.message || "Failed to load users");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    const t = window.setTimeout(() => {
      void load();
    }, 200);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, includeInactive]);

  async function deactivate(u: AdminUserRow) {
    const ok = window.confirm(
      `Deactivate user ${u.username}?\n\nThis will disable login and clear subscription state. (We keep historical records like support and feedback.)`
    );
    if (!ok) return;

    try {
      const res = await apiFetch(`/admin/users/${u.user_id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      await load();
    } catch (e: any) {
      window.alert(e?.message || "Failed to deactivate user");
    }
  }

  const users = data?.users ?? [];

  return (
    <div>
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold">Users</h1>
          <p className="mt-1 text-sm muted">View and deactivate users.</p>
        </div>
        <button type="button" className="btn-secondary h-10 px-4" onClick={() => void load()} disabled={loading}>
          Reload
        </button>
      </div>

      <div className="mt-6 glass-card p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 items-center gap-2">
            <input
              className="input h-10 w-full"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by email…"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} />
            Include inactive
          </label>
        </div>

        <div className="mt-3 text-sm muted">
          Total: <span className="font-semibold">{data?.total ?? "—"}</span>
        </div>

        {error ? (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800/40 dark:bg-red-950/40 dark:text-red-200">
            {error}
          </div>
        ) : null}

        <div className="mt-4 overflow-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="text-left">
                <th className="py-2 pr-4">User</th>
                <th className="py-2 pr-4">Role</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Subscription</th>
                <th className="py-2 pr-4">Terms</th>
                <th className="py-2 pr-4">Created</th>
                <th className="py-2 pr-4">Last login</th>
                <th className="py-2 pr-4"></th>
              </tr>
            </thead>
            <tbody>
              {loading && !data ? (
                <tr>
                  <td className="py-6 muted" colSpan={8}>
                    Loading…
                  </td>
                </tr>
              ) : null}

              {!loading && users.length === 0 ? (
                <tr>
                  <td className="py-6 muted" colSpan={8}>
                    No users found.
                  </td>
                </tr>
              ) : null}

              {users.map((u) => {
                const active = (u.is_active || 0) === 1;
                return (
                  <tr key={u.user_id} className="border-t border-zinc-200/60 dark:border-zinc-800/60">
                    <td className="py-3 pr-4">
                      <div className="font-medium">{u.username}</div>
                      <div className="text-xs muted">ID: {u.user_id}</div>
                    </td>
                    <td className="py-3 pr-4 capitalize">{u.role}</td>
                    <td className="py-3 pr-4">
                      {active ? (
                        <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-xs text-emerald-700 dark:text-emerald-300">
                          Active
                        </span>
                      ) : (
                        <span className="rounded-full bg-zinc-500/10 px-2 py-1 text-xs text-zinc-600 dark:text-zinc-300">
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      <div className="font-medium">{u.subscription_status || "—"}</div>
                      <div className="text-xs muted">Period end: {u.current_period_end || "—"}</div>
                    </td>
                    <td className="py-3 pr-4">
                      <div className="font-medium">{u.terms_accepted_at ? "Accepted" : "—"}</div>
                      <div className="text-xs muted">{u.terms_accepted_version || ""}</div>
                    </td>
                    <td className="py-3 pr-4">{fmtDate(u.created_at)}</td>
                    <td className="py-3 pr-4">{fmtDate(u.last_login_at)}</td>
                    <td className="py-3 pr-0 text-right">
                      <button
                        type="button"
                        className="btn-secondary h-9 px-3"
                        disabled={!active}
                        onClick={() => void deactivate(u)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
