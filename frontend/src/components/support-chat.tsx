import * as React from "react";
import { Link, useLocation } from "react-router-dom";

import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth-provider";

type SupportThread = {
  thread_id: number;
  user_id: number;
  status: "open" | "closed";
  created_at: string;
  updated_at: string;
  last_message_at?: string | null;
};

type SupportMessage = {
  message_id: number;
  thread_id: number;
  sender_role: "user" | "admin";
  sender_user_id?: number | null;
  message: string;
  created_at: string;
};

type SupportThreadResponse = {
  thread: SupportThread | null;
  messages: SupportMessage[];
};

function fmtChatTime(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

export function SupportChatWidget() {
  const { user } = useAuth();
  const location = useLocation();

  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [thread, setThread] = React.useState<SupportThread | null>(null);
  const [messages, setMessages] = React.useState<SupportMessage[]>([]);
  const [draft, setDraft] = React.useState("");
  const scrollRef = React.useRef<HTMLDivElement | null>(null);

  const loggedIn = Boolean(user);

  async function load() {
    if (!loggedIn) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/support/thread", { cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as SupportThreadResponse;
      setThread(data.thread);
      setMessages(data.messages || []);
    } catch (e: any) {
      setError(e?.message || "Failed to load support chat");
    } finally {
      setLoading(false);
    }
  }

  async function send() {
    const msg = draft.trim();
    if (!msg) return;
    setDraft("");
    setError(null);
    try {
      const res = await apiFetch("/support/message", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: msg }),
      });
      if (!res.ok) throw new Error(await res.text());
      await load();
    } catch (e: any) {
      setError(e?.message || "Failed to send message");
    }
  }

  // Load on open
  React.useEffect(() => {
    if (!open) return;
    if (!loggedIn) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, loggedIn]);

  // Poll while open
  React.useEffect(() => {
    if (!open || !loggedIn) return;
    const id = window.setInterval(() => {
      void load();
    }, 12000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, loggedIn]);

  // Auto-scroll to bottom when messages change
  React.useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [open, messages.length]);

  // Hide the widget on admin pages to reduce clutter.
  const hide = location.pathname.startsWith("/app/admin");
  if (hide) return null;

  return (
    <div className="fixed bottom-4 right-4 z-40">
      {open && (
        <div className="glass-card mb-3 w-[340px] overflow-hidden shadow-lg">
          <div className="flex items-center justify-between gap-3 border-b border-zinc-200/60 px-3 py-2 dark:border-zinc-800/60">
            <div>
              <div className="text-sm font-semibold">Support</div>
              <div className="text-xs muted">{thread ? `Thread #${thread.thread_id}` : "Chat with our team"}</div>
            </div>
            <button type="button" className="btn-ghost h-9 px-3" onClick={() => setOpen(false)}>
              Close
            </button>
          </div>

          {!loggedIn ? (
            <div className="p-3">
              <div className="text-sm muted">Sign in to send support messages.</div>
              <div className="mt-3 flex gap-2">
                <Link className="btn-primary" to={`/login?next=${encodeURIComponent(location.pathname)}`}>
                  Sign in
                </Link>
                <Link className="btn-secondary" to={`/signup?next=${encodeURIComponent(location.pathname)}`}>
                  Create account
                </Link>
              </div>
            </div>
          ) : (
            <>
              <div ref={scrollRef} className="max-h-[360px] overflow-auto p-3">
                {loading && messages.length === 0 ? <div className="text-sm muted">Loading…</div> : null}

                {messages.length === 0 && !loading ? (
                  <div className="text-sm muted">Send a message and we’ll get back to you.</div>
                ) : (
                  <div className="space-y-2">
                    {messages.map((m) => (
                      <div
                        key={m.message_id}
                        className={m.sender_role === "user" ? "flex justify-end" : "flex justify-start"}
                      >
                        <div
                          className={
                            m.sender_role === "user"
                              ? "max-w-[85%] rounded-lg bg-black/90 px-3 py-2 text-sm text-white dark:bg-white/90 dark:text-black"
                              : "max-w-[85%] rounded-lg bg-black/5 px-3 py-2 text-sm dark:bg-white/10"
                          }
                        >
                          <div className="whitespace-pre-wrap break-words">{m.message}</div>
                          <div className="mt-1 text-[10px] opacity-70">{fmtChatTime(m.created_at)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {error && (
                <div className="px-3 pb-2 text-xs text-red-700 dark:text-red-300">{error}</div>
              )}

              <div className="border-t border-zinc-200/60 p-2 dark:border-zinc-800/60">
                <div className="flex items-end gap-2">
                  <textarea
                    className="input min-h-[40px] flex-1 resize-none"
                    placeholder="Type a message…"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    rows={2}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void send();
                      }
                    }}
                  />
                  <button type="button" className="btn-primary h-10 px-3" onClick={() => void send()}>
                    Send
                  </button>
                </div>
                <div className="mt-1 text-[11px] muted">Press Enter to send • Shift+Enter for newline</div>
              </div>
            </>
          )}
        </div>
      )}

      <button
        type="button"
        className="btn-primary h-11 rounded-full px-4 shadow-lg"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "Support" : "Support"}
      </button>
    </div>
  );
}
