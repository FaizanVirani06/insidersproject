import * as React from "react";

import { useAuth } from "@/components/auth-provider";
import { apiFetch } from "@/lib/api";
import { fmtDate } from "@/lib/format";

const DEFAULT_PRIVACY = `Privacy Policy

This page can be edited by an admin from within the site.

Please replace this placeholder with your official Privacy Policy.`;

type PageResponse = {
  slug: string;
  markdown: string | null;
  updated_at_utc: string | null;
};

export function PrivacyPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [content, setContent] = React.useState<string>(DEFAULT_PRIVACY);
  const [updatedAt, setUpdatedAt] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState<boolean>(true);
  const [error, setError] = React.useState<string | null>(null);

  const [editing, setEditing] = React.useState<boolean>(false);
  const [draft, setDraft] = React.useState<string>("");
  const [saving, setSaving] = React.useState<boolean>(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/backend/public/page/privacy`);
      const data = (await res.json()) as PageResponse;
      const md = (data.markdown || "").trim();
      setContent(md || DEFAULT_PRIVACY);
      setUpdatedAt(data.updated_at_utc || null);
      setDraft(md || DEFAULT_PRIVACY);
    } catch (e: any) {
      setError(e?.message || "Failed to load privacy policy");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save() {
    if (!isAdmin) return;
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/backend/admin/page/privacy`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markdown: draft }),
      });
      const data = (await res.json()) as PageResponse;
      const md = (data.markdown || "").trim();
      setContent(md || DEFAULT_PRIVACY);
      setUpdatedAt(data.updated_at_utc || null);
      setEditing(false);
    } catch (e: any) {
      setError(e?.message || "Failed to save privacy policy");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Privacy Policy</h1>
          {updatedAt && (
            <div className="mt-1 text-sm text-black/60 dark:text-white/60">Last updated: {fmtDate(updatedAt)}</div>
          )}
        </div>

        {isAdmin && (
          <div className="flex items-center gap-2">
            {!editing ? (
              <button
                className="rounded border bg-white px-3 py-2 text-sm shadow-sm hover:bg-black/5 dark:bg-black/30 dark:hover:bg-white/10"
                onClick={() => setEditing(true)}
              >
                Edit
              </button>
            ) : (
              <>
                <button
                  className="rounded border bg-white px-3 py-2 text-sm shadow-sm hover:bg-black/5 dark:bg-black/30 dark:hover:bg-white/10"
                  onClick={() => {
                    setEditing(false);
                    setDraft(content);
                  }}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  className="rounded border bg-black px-3 py-2 text-sm text-white shadow-sm hover:bg-black/90 disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-white/90"
                  onClick={save}
                  disabled={saving}
                >
                  {saving ? "Saving…" : "Save"}
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {error && <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</div>}

      {loading ? (
        <div className="text-sm text-black/60 dark:text-white/60">Loading…</div>
      ) : editing ? (
        <div className="space-y-2">
          <div className="text-sm text-black/60 dark:text-white/60">Admins only. Supports plain text (line breaks preserved).</div>
          <textarea
            className="h-[70vh] w-full rounded border bg-white p-3 font-mono text-sm dark:bg-black/30"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
        </div>
      ) : (
        <div className="rounded-xl border bg-white p-4 shadow-sm dark:bg-black/20">
          <div className="whitespace-pre-wrap text-sm leading-relaxed">{content}</div>
        </div>
      )}
    </div>
  );
}
