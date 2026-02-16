import * as React from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth-provider";

export function LoginPage() {
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const { setUser } = useAuth();

  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await apiFetch("/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (!res.ok) {
        const msg = await res.text().catch(() => "Login failed");
        setError(msg || "Login failed");
        return;
      }

      const data = await res.json().catch(() => ({} as any));
      const user = (data?.user ?? null) as any;
      setUser(user);

      const isPaid = Boolean(user?.is_paid) || user?.role === "admin";
      const next = sp.get("next");

      if (next) {
        navigate(next, { replace: true });
      } else if (isPaid) {
        navigate("/app/tickers", { replace: true });
      } else {
        navigate("/pricing", { replace: true });
      }
    } catch {
      setError("Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto mt-16 max-w-md">
      <div className="rounded-xl border bg-white p-6 shadow-sm dark:bg-black/20">
        <h1 className="text-xl font-semibold">Sign in</h1>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">
          Use your platform credentials. If you don't have an account yet, sign up.
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-3">
          <div>
            <label className="block text-sm font-medium">Email</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="mt-1 w-full rounded-md border bg-transparent px-3 py-2"
              autoComplete="username"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-md border bg-transparent px-3 py-2"
              autoComplete="current-password"
            />
          </div>

          {error && (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-white dark:text-black"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>

          <div className="flex items-center justify-between text-xs text-black/60 dark:text-white/60">
            <span>
              New here? <Link className="underline" to="/signup">Create an account</Link>
            </span>
            <span className="hidden sm:inline">
              Dev default: <span className="font-mono">admin/admin</span>
            </span>
          </div>
        </form>
      </div>
    </div>
  );
}
