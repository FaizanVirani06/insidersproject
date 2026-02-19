import * as React from "react";

import { useAuth } from "@/components/auth-provider";

/**
 * Lightweight admin helper.
 *
 * The backend currently treats issuer_master as the tracked universe and imports it via
 * scripts/import_tickers.py. This UI keeps the page from breaking while giving admins
 * an obvious place to find the operational command.
 */
export function AddTickerForm({ onAdded }: { onAdded?: () => void }) {
  const { user } = useAuth();

  if (user?.role !== "admin") return null;

  return (
    <div className="glass-panel p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">Ticker universe</div>
          <div className="mt-1 text-sm muted">
            This project loads tracked issuers from <span className="font-mono">issuer_master</span>. Import tickers
            on the server to update the universe.
          </div>
        </div>
        <button type="button" onClick={() => onAdded?.()} className="btn-secondary">
          Refresh list
        </button>
      </div>

      <div className="mt-4 rounded-lg border border-zinc-200/60 bg-white/40 p-3 font-mono text-xs text-zinc-800 backdrop-blur-md dark:border-zinc-800/60 dark:bg-black/30 dark:text-zinc-200">
        docker compose -f docker-compose.prod.yml exec api python scripts/import_tickers.py --file /app/tickers.txt
      </div>

      <div className="mt-3 text-xs muted">
        Tip: after importing, run the poller/backfill jobs to ingest filings for new issuers.
      </div>
    </div>
  );
}
