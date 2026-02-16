"use client";

import * as React from "react";
import { apiFetch } from "@/lib/api";

export function FeedbackPage() {
  const [message, setMessage] = React.useState("");
  const [rating, setRating] = React.useState<number | "">("");
  const [pageUrl, setPageUrl] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [ok, setOk] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    try {
      setPageUrl(window.location.href);
    } catch {
      // ignore
    }
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setOk(false);
    setError(null);

    try {
      const res = await apiFetch("/api/backend/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message,
          rating: rating === "" ? null : Number(rating),
          page_url: pageUrl,
          metadata: { ua: navigator.userAgent },
        }),
      });

      if (!res.ok) {
        const t = await res.text().catch(() => "Failed to send feedback");
        throw new Error(t || "Failed to send feedback");
      }

      setOk(true);
      setMessage("");
      setRating("");
    } catch (e: any) {
      setError(e?.message || "Failed to send feedback");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl py-10 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Feedback</h1>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">
          Help us improve the product. Tell us what’s confusing, what’s missing, or what you’d love to see next.
        </p>
      </div>

      <div className="rounded-2xl border bg-white p-6 shadow-sm dark:bg-black/20">
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium">Rating (optional)</label>
            <select
              value={rating}
              onChange={(e) => setRating((e.target.value as any) || "")}
              className="mt-1 w-full rounded-md border bg-transparent px-3 py-2"
            >
              <option value="">—</option>
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
              <option value="4">4</option>
              <option value="5">5</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium">Message</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={6}
              className="mt-1 w-full rounded-md border bg-transparent px-3 py-2"
              placeholder="What should we improve?"
            />
          </div>

          {ok && (
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-200">
              Thanks! Your feedback has been sent.
            </div>
          )}

          {error && (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || message.trim().length < 3}
            className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-60 hover:opacity-90 dark:bg-white dark:text-black"
          >
            {loading ? "Sending…" : "Send feedback"}
          </button>
        </form>
      </div>

      <div className="text-xs text-black/50 dark:text-white/50">
        By submitting feedback, you agree we may store it to improve the product.
      </div>
    </div>
  );
}