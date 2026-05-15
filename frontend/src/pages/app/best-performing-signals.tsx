import * as React from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "@/lib/api";
import { useEntitlements } from "@/components/use-entitlements";
import { UpgradeCallout } from "@/components/upgrade-callout";

export function BestPerformingSignalsPage() {
  const [days, setDays] = React.useState(60);
  const [data, setData] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const ent = useEntitlements();
  React.useEffect(() => { let c=false; setLoading(true); apiFetch(`/signals/best-performing?days=${days}&limit=50`).then(r=>r.json()).then(j=>{if(!c)setData(j);}).catch(()=>{if(!c)setData({results:[]});}).finally(()=>!c&&setLoading(false)); return ()=>{c=true}; }, [days]);
  const results = data?.results ?? [];
  const isFree = ent?.plan === "free";
  return <div className="space-y-4"><h1 className="text-2xl font-semibold">Best Performing Signals</h1><p className="text-sm muted">Signals ranked by stock performance since public filing date over the last 60 days.</p>
  <select value={days} onChange={(e)=>setDays(Number(e.target.value))} className="input max-w-[180px]"><option value={30}>30 days</option><option value={60}>60 days</option><option value={90}>90 days</option></select>
  {loading ? <div className="text-sm muted">Loading…</div> : results.length === 0 ? <div className="glass-card p-4 text-sm muted">No signals with sufficient price history were found for this timeframe yet.</div> : <div className="glass-panel overflow-x-auto"><table className="w-full text-sm"><thead><tr><th>Ticker</th><th>Company</th><th>Insider</th><th>Role</th><th>Filed</th><th>Value</th><th>Start</th><th>Latest</th><th>Return %</th><th>Days</th><th></th></tr></thead><tbody>{results.map((r:any)=><tr key={r.signal_id}><td>{r.ticker}</td><td>{r.issuer_name}</td><td>{r.insider_name}</td><td>{r.insider_role}</td><td>{r.filing_date}</td><td>{r.transaction_dollar_value ?? '-'}</td><td>{r.starting_price}</td><td>{r.latest_price}</td><td>{Number(r.percent_return).toFixed(2)}%</td><td>{r.days_elapsed}</td><td><Link className="link" to={r.detail_path}>View</Link></td></tr>)}</tbody></table></div>}
  {isFree && results.length >= 5 ? <UpgradeCallout message="Upgrade to see the full leaderboard, advanced filters, and alerts." /> : null}
  </div>;
}
