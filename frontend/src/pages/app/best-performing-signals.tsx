import * as React from "react";
import { Link } from "react-router-dom";

import { UpgradeCallout } from "@/components/upgrade-callout";
import { useEntitlements } from "@/components/use-entitlements";
import { apiFetch } from "@/lib/api";
import { fmtDate, fmtUsd } from "@/lib/format";

export function BestPerformingSignalsPage() {
  const [days, setDays] = React.useState(60);
  const [data, setData] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const ent = useEntitlements();

  React.useEffect(() => {
    let c = false;
    setLoading(true);
    apiFetch(`/signals/best-performing?days=${days}&limit=50`)
      .then((r) => r.json())
      .then((j) => {
        if (!c) setData(j);
      })
      .catch(() => {
        if (!c) setData({ results: [] });
      })
      .finally(() => !c && setLoading(false));
    return () => {
      c = true;
    };
  }, [days]);

  const rawResults = data?.results ?? [];
  const isFree = ent?.plan === "free";

  const results = React.useMemo(() => {
    const grouped = new Map<string, any>();
    const out: any[] = [];

    for (const r of rawResults) {
      const isBuyCluster = String(r?.transaction_code || "") === "P" && Number(r?.cluster_flag || 0) === 1;
      if (!isBuyCluster) {
        out.push({ ...r, insider_count: 1, insider_names: [r?.insider_name].filter(Boolean) });
        continue;
      }

      const key = `${r.ticker}|${r.signal_date}|${r.starting_price}|${r.latest_price}|${r.percent_return}`;
      const existing = grouped.get(key);
      if (!existing) {
        const row = {
          ...r,
          insider_count: 1,
          insider_names: [r?.insider_name].filter(Boolean),
          is_collapsed_cluster: true,
        };
        grouped.set(key, row);
        out.push(row);
      } else {
        existing.insider_count += 1;
        if (r?.insider_name) existing.insider_names.push(r.insider_name);
      }
    }

    return out;
  }, [rawResults]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Best Performing Signals</h1>
        <p className="mt-1 text-sm muted">
          Signals ranked by stock performance since public filing date over the last 60 days.
        </p>
      </div>

      <div className="glass-card flex max-w-[220px] items-center gap-2 p-2">
        <span className="px-1 text-xs uppercase tracking-wide muted">Timeframe</span>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="input h-9">
          <option value={30}>30 days</option>
          <option value={60}>60 days</option>
          <option value={90}>90 days</option>
        </select>
      </div>

      {loading ? (
        <div className="glass-card p-4 text-sm muted">Loading leaderboard…</div>
      ) : results.length === 0 ? (
        <div className="glass-card p-4 text-sm muted">
          No signals with sufficient price history were found for this timeframe yet.
        </div>
      ) : (
        <div className="glass-panel overflow-x-auto p-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-zinc-300">
                <th className="px-3 py-2">Ticker</th>
                <th className="px-3 py-2">Company</th>
                <th className="px-3 py-2">Insider</th>
                <th className="px-3 py-2">Role</th>
                <th className="px-3 py-2">Filed</th>
                <th className="px-3 py-2">Start</th>
                <th className="px-3 py-2">Latest</th>
                <th className="px-3 py-2">Return %</th>
                <th className="px-3 py-2">Days</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {results.map((r: any, idx: number) => (
                <tr key={`${r.signal_id}-${idx}`} className="border-t border-zinc-800/70 hover:bg-white/5">
                  <td className="px-3 py-2 font-semibold">{r.ticker}</td>
                  <td className="px-3 py-2">{r.issuer_name}</td>
                  <td className="px-3 py-2">
                    {r.insider_count > 1 ? (
                      <div>
                        <div>{r.insider_count} insiders (cluster)</div>
                        <div className="line-clamp-1 text-xs muted">{r.insider_names.join(", ")}</div>
                      </div>
                    ) : (
                      r.insider_name || "-"
                    )}
                  </td>
                  <td className="px-3 py-2">{r.insider_role || "-"}</td>
                  <td className="px-3 py-2">{fmtDate(r.filing_date)}</td>
                  <td className="px-3 py-2">{fmtUsd(r.starting_price)}</td>
                  <td className="px-3 py-2">{fmtUsd(r.latest_price)}</td>
                  <td className="px-3 py-2">
                    <span className="inline-flex rounded-full bg-emerald-500/15 px-2 py-0.5 font-medium text-emerald-300">
                      {Number(r.percent_return).toFixed(2)}%
                    </span>
                  </td>
                  <td className="px-3 py-2">{r.days_elapsed}</td>
                  <td className="px-3 py-2">
                    <Link className="link" to={r.detail_path}>
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {isFree && rawResults.length >= 5 ? (
        <UpgradeCallout message="Upgrade to see the full leaderboard, advanced filters, and alerts." />
      ) : null}
    </div>
  );
}
