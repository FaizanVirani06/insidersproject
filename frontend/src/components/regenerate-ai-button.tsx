"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { apiFetch } from "@/lib/api";

export function RegenerateAIButton({
  issuer_cik,
  owner_key,
  accession_number,
}: {
  issuer_cik: string;
  owner_key: string;
  accession_number: string;
}) {
  const { user } = useAuth();
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!user || !user.is_admin) return null;

  return (
    <div className="flex flex-col gap-2">
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setStatus("Enqueuing AI regeneration…");

          try {
            const res = await apiFetch(
              `/api/backend/admin/event/${issuer_cik}/${encodeURIComponent(
                owner_key
              )}/${accession_number}/regenerate_ai`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ force: true }),
              }
            );

            if (res.ok) {
              setStatus(
                "Regeneration requested at top priority. Refresh shortly to see the updated AI output."
              );
            } else {
              const txt = await res.text().catch(() => "");
              setStatus(
                `Failed to enqueue (${res.status}). ${txt ? txt : ""}`.trim()
              );
            }
          } catch (e: any) {
            setStatus(`Error: ${String(e)}`);
          } finally {
            setBusy(false);
          }
        }}
        className="btn-secondary disabled:opacity-50"
      >
        Regenerate AI
      </button>
      {status ? <p className="text-xs muted">{status}</p> : null}
    </div>
  );
}