import * as React from "react";
import { apiFetch } from "@/lib/api";

type Profile = {
  user_id: number;
  full_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  preferences: {
    preferred_sectors: string[];
    min_ai_rating: number;
    max_beta: number | null;
    trade_side: "buy" | "sell" | "both";
    email_alerts_enabled: boolean;
    daily_digest_enabled: boolean;
    [k: string]: any;
  };
  created_at: string;
  updated_at: string;
};

type ProfileResponse = {
  profile: Profile;
};

type SectorResponse = {
  sectors: string[];
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export function ProfilePage() {
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);

  const [profile, setProfile] = React.useState<Profile | null>(null);
  const [allSectors, setAllSectors] = React.useState<string[]>([]);
  const [sectorQuery, setSectorQuery] = React.useState("");

  // Form state
  const [fullName, setFullName] = React.useState("");
  const [contactEmail, setContactEmail] = React.useState("");
  const [contactPhone, setContactPhone] = React.useState("");
  const [tradeSide, setTradeSide] = React.useState<"buy" | "sell" | "both">("buy");
  const [minAi, setMinAi] = React.useState<number>(7);
  const [maxBeta, setMaxBeta] = React.useState<string>("");
  const [preferredSectors, setPreferredSectors] = React.useState<string[]>([]);
  const [emailAlerts, setEmailAlerts] = React.useState(false);
  const [dailyDigest, setDailyDigest] = React.useState(false);

  function hydrate(p: Profile) {
    setProfile(p);
    setFullName(p.full_name || "");
    setContactEmail(p.contact_email || "");
    setContactPhone(p.contact_phone || "");
    setTradeSide((p.preferences?.trade_side as any) || "buy");
    setMinAi(typeof p.preferences?.min_ai_rating === "number" ? clamp(p.preferences.min_ai_rating, 1, 10) : 7);
    setMaxBeta(p.preferences?.max_beta === null || p.preferences?.max_beta === undefined ? "" : String(p.preferences.max_beta));
    setPreferredSectors(Array.isArray(p.preferences?.preferred_sectors) ? p.preferences.preferred_sectors : []);
    setEmailAlerts(Boolean(p.preferences?.email_alerts_enabled));
    setDailyDigest(Boolean(p.preferences?.daily_digest_enabled));
  }

  async function load() {
    setLoading(true);
    setError(null);
    setSaved(false);
    try {
      const [pr, sr] = await Promise.all([
        apiFetch("/profile", { cache: "no-store" }),
        apiFetch("/public/sectors", { cache: "force-cache" }),
      ]);
      if (!pr.ok) throw new Error(await pr.text());
      if (!sr.ok) throw new Error(await sr.text());

      const pdata = (await pr.json()) as ProfileResponse;
      const sdata = (await sr.json()) as SectorResponse;
      hydrate(pdata.profile);
      setAllSectors((sdata.sectors || []).filter(Boolean));
    } catch (e: any) {
      setError(e?.message || "Failed to load profile");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredSectors = React.useMemo(() => {
    const q = sectorQuery.trim().toLowerCase();
    if (!q) return allSectors;
    return allSectors.filter((s) => s.toLowerCase().includes(q));
  }, [allSectors, sectorQuery]);

  function toggleSector(sector: string) {
    setPreferredSectors((prev) => {
      if (prev.includes(sector)) return prev.filter((x) => x !== sector);
      return [...prev, sector];
    });
  }

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const payload = {
        full_name: fullName,
        contact_email: contactEmail,
        contact_phone: contactPhone,
        trade_side: tradeSide,
        min_ai_rating: clamp(minAi, 1, 10),
        // allow clearing
        max_beta: maxBeta.trim() === "" ? null : Number(maxBeta),
        preferred_sectors: preferredSectors,
        email_alerts_enabled: emailAlerts,
        daily_digest_enabled: dailyDigest,
      };

      const res = await apiFetch("/profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      const out = (await res.json()) as ProfileResponse;
      hydrate(out.profile);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
    } catch (e: any) {
      setError(e?.message || "Failed to save profile");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold">Profile</h1>
          <p className="mt-1 text-sm muted">Tune recommendations and manage your contact details.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="btn-secondary h-10 px-4" onClick={() => void load()} disabled={loading}>
            Reload
          </button>
          <button type="button" className="btn-primary h-10 px-4" onClick={() => void save()} disabled={saving || loading}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {error ? (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800/40 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      ) : null}

      {saved ? (
        <div className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-800/40 dark:bg-emerald-950/40 dark:text-emerald-200">
          Saved.
        </div>
      ) : null}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {/* Contact */}
        <div className="glass-card p-6">
          <h2 className="text-lg font-semibold">Contact information</h2>
          <p className="mt-1 text-sm muted">Used for account and alerts (if enabled).</p>

          <div className="mt-5 grid gap-4">
            <div>
              <label className="text-sm font-medium">Full name</label>
              <input
                className="input mt-1 h-10"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Jane Doe"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Email</label>
              <input
                className="input mt-1 h-10"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="you@example.com"
                inputMode="email"
              />
              <div className="mt-1 text-xs muted">This does not change your login email.</div>
            </div>

            <div>
              <label className="text-sm font-medium">Phone</label>
              <input
                className="input mt-1 h-10"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="+1 (555) 123-4567"
                inputMode="tel"
              />
            </div>
          </div>
        </div>

        {/* Preferences */}
        <div className="glass-card p-6">
          <h2 className="text-lg font-semibold">Preferences</h2>
          <p className="mt-1 text-sm muted">Control what shows up in your "For you" feed.</p>

          <div className="mt-5 grid gap-5">
            <div>
              <div className="text-sm font-medium">Show trades</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {([
                  { k: "buy", label: "Buys" },
                  { k: "sell", label: "Sells" },
                  { k: "both", label: "Both" },
                ] as const).map((opt) => (
                  <button
                    key={opt.k}
                    type="button"
                    className={
                      tradeSide === opt.k
                        ? "btn-primary h-10 px-4"
                        : "btn-secondary h-10 px-4"
                    }
                    onClick={() => setTradeSide(opt.k)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <div className="mt-1 text-xs muted">Default is buys only.</div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Minimum AI rating</label>
                <span className="text-sm font-semibold">{minAi.toFixed(1)} / 10</span>
              </div>
              <input
                type="range"
                min={1}
                max={10}
                step={0.5}
                value={minAi}
                onChange={(e) => setMinAi(Number(e.target.value))}
                className="mt-2 w-full"
              />
              <div className="mt-1 text-xs muted">Higher values show fewer, higher-signal trades.</div>
            </div>

            <div>
              <label className="text-sm font-medium">Max beta (optional)</label>
              <input
                className="input mt-1 h-10"
                value={maxBeta}
                onChange={(e) => setMaxBeta(e.target.value)}
                placeholder="e.g. 1.5"
                inputMode="decimal"
              />
              <div className="mt-1 text-xs muted">Leave blank to ignore beta.</div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Preferred sectors</label>
                <span className="text-xs muted">{preferredSectors.length ? `${preferredSectors.length} selected` : "All"}</span>
              </div>
              <input
                className="input mt-2 h-10"
                value={sectorQuery}
                onChange={(e) => setSectorQuery(e.target.value)}
                placeholder="Search sectors…"
              />

              <div className="mt-2 max-h-56 overflow-auto rounded-lg border border-zinc-200/70 bg-white/40 p-2 dark:border-zinc-800/60 dark:bg-black/20">
                {loading && !profile ? <div className="p-2 text-sm muted">Loading…</div> : null}
                {!loading && filteredSectors.length === 0 ? (
                  <div className="p-2 text-sm muted">No sectors match your search.</div>
                ) : null}
                <div className="grid gap-1">
                  {filteredSectors.map((s) => {
                    const checked = preferredSectors.includes(s);
                    return (
                      <label
                        key={s}
                        className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 hover:bg-black/5 dark:hover:bg-white/10"
                      >
                        <input type="checkbox" checked={checked} onChange={() => toggleSector(s)} />
                        <span className="text-sm">{s}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
              <div className="mt-1 text-xs muted">If none are selected, we show all sectors.</div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={emailAlerts} onChange={(e) => setEmailAlerts(e.target.checked)} />
                <span className="text-sm">Email alerts</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={dailyDigest} onChange={(e) => setDailyDigest(e.target.checked)} />
                <span className="text-sm">Daily digest</span>
              </label>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8">
        <div className="glass-card p-6">
          <h2 className="text-lg font-semibold">Notes</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm muted">
            <li>Recommendations are based on publicly available SEC filings (Form 4).</li>
            <li>AI ratings are informational and do not constitute financial advice.</li>
            <li>You can always browse the full feed under the Events and Tickers pages.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
