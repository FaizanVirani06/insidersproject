import { useAuth } from "@/components/auth-provider";
import { PriceChart } from "@/components/price-chart";
import { apiFetch } from "@/lib/api";
import type { PricePoint } from "@/lib/types";
import * as React from "react";
import { useSearchParams } from "react-router-dom";

type Mode = "new_signal" | "best_performing";

export function AdminSocialPage() {
  const { user } = useAuth();
  if (user?.role !== "admin") return <div className="text-sm muted">Admin only.</div>;

  const [sp] = useSearchParams();
  const [mode, setMode] = React.useState<Mode>("new_signal");
  const [content, setContent] = React.useState("");
  const [linkUrl, setLinkUrl] = React.useState("https://insidrsai.com/pricing");
  const [sourceSignalId, setSourceSignalId] = React.useState(sp.get("signal_id") || "");
  const [preview, setPreview] = React.useState("");
  const [posts, setPosts] = React.useState<any[]>([]);
  const [signal, setSignal] = React.useState<any>(null);
  const [prices, setPrices] = React.useState<PricePoint[]>([]);

  const load = () =>
    apiFetch("/admin/social/posts")
      .then((r) => (r.ok ? r.json() : { posts: [] }))
      .then((j) => setPosts(j.posts || []));

  React.useEffect(() => {
    load();
  }, []);

  const generateTemplate = async () => {
    const r = await apiFetch("/admin/social/x/template", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode, source_signal_id: sourceSignalId }),
    });
    const j = await r.json();
    setContent(j.content || "");
    setSignal(j.signal || null);

    if (j?.signal?.ticker && j?.signal?.filing_date) {
      const end = new Date().toISOString().slice(0, 10);
      const filingDate = new Date(j.signal.filing_date.slice(0, 10) + "T00:00:00Z");
      filingDate.setUTCDate(filingDate.getUTCDate() - 5);
      const start = filingDate.toISOString().slice(0, 10);
      const pr = await apiFetch(`/ticker/${encodeURIComponent(j.signal.ticker)}/prices?start=${start}&end=${end}&limit=800`);
      const pj = await pr.json();
      setPrices((pj?.prices || []) as PricePoint[]);
    }
  };

  const doPreview = async () => {
    const r = await apiFetch("/admin/social/x/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content, source_signal_id: sourceSignalId }),
    });
    const j = await r.json();
    setPreview(j.content || "");
  };

  const doPost = async () => {
    await apiFetch("/admin/social/x/post", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content, link_url: linkUrl, source_signal_id: sourceSignalId }),
    });
    load();
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Admin Social Posting</h1>

      <div className="flex flex-wrap gap-2">
        <button className={mode === "new_signal" ? "btn-primary" : "btn-secondary"} onClick={() => setMode("new_signal")}>New signal template</button>
        <button className={mode === "best_performing" ? "btn-primary" : "btn-secondary"} onClick={() => setMode("best_performing")}>Best performer template</button>
      </div>

      <input className="input" placeholder="Signal id (issuer:owner:accession)" value={sourceSignalId} onChange={(e) => setSourceSignalId(e.target.value)} />
      <div className="flex gap-2"><button className="btn-secondary" onClick={generateTemplate}>Generate template</button></div>

      {prices.length > 0 ? (
        <div className="glass-card p-3">
          <div className="mb-2 text-sm muted">Chart preview (signal date to now)</div>
          <PriceChart data={prices} filingDate={signal?.filing_date || null} tradeDate={signal?.event_trade_date || null} />
        </div>
      ) : null}

      <textarea className="input min-h-[180px] w-full" value={content} onChange={(e) => setContent(e.target.value)} />
      <div className="text-xs muted">{content.length}/280</div>
      <input className="input" placeholder="Promo/free-trial link" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} />
      <div className="flex gap-2">
        <button className="btn-secondary" onClick={doPreview}>Preview</button>
        <button className="btn-primary" onClick={doPost}>Post to X</button>
      </div>

      {preview ? <div className="glass-card whitespace-pre-wrap p-4">{preview}</div> : null}

      <div className="space-y-2">
        {posts.map((p: any) => (
          <div key={p.post_id} className="glass-card p-3 text-sm">
            <div>
              {p.status} {p.x_tweet_url ? <a className="link" href={p.x_tweet_url}>Open</a> : null}
            </div>
            <div>{p.content}</div>
            {p.error_message ? <div className="text-red-500">{p.error_message}</div> : null}
          </div>
        ))}
      </div>
    </div>
  );
}
