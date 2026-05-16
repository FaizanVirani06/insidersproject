import { useAuth } from "@/components/auth-provider";
import { XPostChartRenderer } from "@/components/x-post-chart";
import { XPostPreview } from "@/components/x-post-preview";
import { apiFetch } from "@/lib/api";
import type { XPostChartPayload } from "@/lib/types";
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
  const [chartPayload, setChartPayload] = React.useState<XPostChartPayload | null>(null);
  const [chartImageDataUrl, setChartImageDataUrl] = React.useState<string | null>(null);
  const [chartRendering, setChartRendering] = React.useState(false);
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [isPosting, setIsPosting] = React.useState(false);
  const [notice, setNotice] = React.useState<string>("");
  const [error, setError] = React.useState<string>("");

  const load = () =>
    apiFetch("/admin/social/posts")
      .then((r) => (r.ok ? r.json() : { posts: [] }))
      .then((j) => setPosts(j.posts || []));

  React.useEffect(() => {
    load();
  }, []);

  const handleChartImageReady = React.useCallback((dataUrl: string | null) => {
    setChartImageDataUrl(dataUrl);
    setChartRendering(false);
  }, []);

  const clearGeneratedChart = () => {
    setChartPayload(null);
    setChartImageDataUrl(null);
    setChartRendering(false);
    setPreview("");
  };

  const generateTemplate = async () => {
    setNotice("");
    setError("");
    setIsGenerating(true);
    setChartPayload(null);
    setChartImageDataUrl(null);
    setChartRendering(false);
    try {
      const r = await apiFetch("/admin/social/x/template", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode, source_signal_id: sourceSignalId }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(typeof j?.detail === "string" ? j.detail : "Failed to generate template");
      const nextContent = j.content || "";
      const nextChart = (j.chart || null) as XPostChartPayload | null;
      setContent(nextContent);
      setPreview(nextContent);
      setChartPayload(nextChart);
      setChartRendering(Boolean(nextChart));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate template");
    } finally {
      setIsGenerating(false);
    }
  };

  const doPreview = async () => {
    const r = await apiFetch("/admin/social/x/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content, source_signal_id: sourceSignalId, chart_image_data_url: chartImageDataUrl }),
    });
    const j = await r.json();
    setPreview(j.content || "");
  };

  const doPost = async () => {
    setNotice("");
    setError("");
    setIsPosting(true);
    try {
      const res = await apiFetch("/admin/social/x/post", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content, link_url: linkUrl, source_signal_id: sourceSignalId, chart_image_data_url: chartImageDataUrl }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail = (body as any)?.detail;
        const msg =
          typeof detail === "string"
            ? detail
            : typeof detail?.error === "string"
              ? detail.error
              : "Failed to post to X";
        setError(msg);
        return;
      }
      const status = String((body as any)?.post?.status || "");
      if (status === "dry_run") {
        setNotice("Dry-run mode: chart + post were prepared but not published. Set X_POSTING_ENABLED=1 for live posting.");
      } else if (status === "posted") {
        setNotice("Posted to X successfully, including chart attachment when available.");
      } else {
        setNotice(`Post finished with status: ${status || "unknown"}`);
      }
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to post to X");
    } finally {
      setIsPosting(false);
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Admin Social Posting</h1>

      <div className="flex flex-wrap gap-2">
        <button className={mode === "new_signal" ? "btn-primary" : "btn-secondary"} onClick={() => setMode("new_signal")}>New signal template</button>
        <button className={mode === "best_performing" ? "btn-primary" : "btn-secondary"} onClick={() => setMode("best_performing")}>Best performer template</button>
      </div>

      <input
        className="input"
        placeholder="Signal id (issuer:owner:accession)"
        value={sourceSignalId}
        onChange={(e) => {
          setSourceSignalId(e.target.value);
          clearGeneratedChart();
        }}
      />
      <div className="flex gap-2">
        <button className="btn-secondary" onClick={generateTemplate} disabled={isGenerating || !sourceSignalId.trim()}>
          {isGenerating ? "Generating..." : "Generate template"}
        </button>
      </div>

      <textarea
        className="input min-h-[180px] w-full"
        value={content}
        onChange={(e) => {
          setContent(e.target.value);
          setPreview("");
        }}
      />
      <div className="text-xs muted">{content.length}/280</div>
      <input className="input" placeholder="Promo/free-trial link" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} />
      <div className="flex gap-2">
        <button className="btn-secondary" onClick={doPreview}>Refresh preview</button>
        <button className="btn-primary" onClick={doPost} disabled={isPosting || chartRendering || (!!chartPayload && !chartImageDataUrl)}>
          {isPosting ? "Posting..." : chartRendering ? "Rendering chart..." : "Post to X"}
        </button>
      </div>
      {notice ? <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">{notice}</div> : null}
      {error ? <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</div> : null}

      <XPostChartRenderer payload={chartPayload} onImageReady={handleChartImageReady} />

      {chartPayload && chartRendering ? (
        <div className="rounded-md border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-200">
          Rendering the X chart attachment...
        </div>
      ) : null}

      <div className="space-y-2">
        <div className="text-sm font-semibold">X preview</div>
        <XPostPreview content={preview || content} chartImageDataUrl={chartImageDataUrl} />
      </div>

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
