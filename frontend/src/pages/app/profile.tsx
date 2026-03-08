import * as React from "react";
import { Link } from "react-router-dom";

import { useAuth } from "@/components/auth-provider";
import { apiFetch } from "@/lib/api";
import type { UserProfileRecord } from "@/lib/types";


type ProfileResponse = {
  profile: UserProfileRecord;
};

type SectorResponse = {
  sectors: string[];
};

type UpdateCredentialsResponse = {
  user: {
    user_id: number;
    username: string;
    role: "admin" | "user";
    subscription_status?: string | null;
    is_paid?: boolean;
    is_admin?: boolean;
  };
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function prettyDetail(detail: string | null | undefined): string {
  switch ((detail || "").trim()) {
    case "current_password_required":
      return "Enter your current password to save login changes.";
    case "invalid_current_password":
      return "Your current password was incorrect.";
    case "username_exists":
      return "That login email is already in use.";
    case "username_too_short":
      return "Login email must be at least 3 characters.";
    case "password_too_short":
      return "New password must be at least 8 characters.";
    case "no_credential_changes_requested":
      return "Change the login email or enter a new password before saving.";
    case "invalid_trade_side":
      return "Trade side must be buys, sells, or both.";
    case "invalid_min_ai_rating":
      return "Minimum AI rating must be between 0 and 10.";
    case "invalid_max_beta":
      return "Max beta must be blank or a positive number.";
    default:
      return detail || "Something went wrong.";
  }
}

async function getErrorMessage(res: Response): Promise<string> {
  try {
    const data = await res.json();
    const detail = typeof data?.detail === "string" ? data.detail : JSON.stringify(data);
    return prettyDetail(detail);
  } catch {
    const txt = await res.text().catch(() => "");
    return prettyDetail(txt || `HTTP ${res.status}`);
  }
}

function SectionCard({
  title,
  subtitle,
  children,
  right,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="glass-panel p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">{title}</h2>
          {subtitle ? <p className="mt-1 text-sm muted">{subtitle}</p> : null}
        </div>
        {right ? <div className="shrink-0">{right}</div> : null}
      </div>
      <div className="mt-6">{children}</div>
    </div>
  );
}

function SummaryCard({ label, value, helper }: { label: string; value: string; helper?: string }) {
  return (
    <div className="rounded-2xl border border-zinc-200/70 bg-white/50 p-4 dark:border-zinc-800/60 dark:bg-black/20">
      <div className="text-xs font-semibold uppercase tracking-[0.16em] muted">{label}</div>
      <div className="mt-2 text-lg font-semibold text-zinc-900 dark:text-zinc-100">{value}</div>
      {helper ? <div className="mt-1 text-sm muted">{helper}</div> : null}
    </div>
  );
}

function ChoiceButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-xl border px-4 py-2 text-sm transition",
        active
          ? "border-purple-500/40 bg-purple-500/15 text-purple-700 dark:text-purple-300"
          : "border-zinc-200/80 bg-white/60 text-zinc-700 hover:border-zinc-300 dark:border-zinc-800/60 dark:bg-black/25 dark:text-zinc-300 dark:hover:border-zinc-700",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-start justify-between gap-4 rounded-2xl border border-zinc-200/70 bg-white/50 p-4 dark:border-zinc-800/60 dark:bg-black/20">
      <div>
        <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{label}</div>
        <div className="mt-1 text-sm muted">{description}</div>
      </div>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-4 w-4 cursor-pointer rounded border-zinc-400 text-purple-500 focus:ring-purple-500/40"
      />
    </label>
  );
}

function SectorButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-xl border px-3 py-3 text-left text-sm transition",
        active
          ? "border-cyan-500/35 bg-cyan-500/12 text-cyan-700 dark:text-cyan-300"
          : "border-zinc-200/80 bg-white/55 text-zinc-700 hover:border-zinc-300 dark:border-zinc-800/60 dark:bg-black/20 dark:text-zinc-300 dark:hover:border-zinc-700",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

export function ProfilePage() {
  const { user, refresh } = useAuth();

  const [loading, setLoading] = React.useState(false);
  const [savingProfile, setSavingProfile] = React.useState(false);
  const [savingCredentials, setSavingCredentials] = React.useState(false);

  const [profileError, setProfileError] = React.useState<string | null>(null);
  const [credentialsError, setCredentialsError] = React.useState<string | null>(null);
  const [profileSaved, setProfileSaved] = React.useState(false);
  const [credentialsSaved, setCredentialsSaved] = React.useState(false);

  const [profile, setProfile] = React.useState<UserProfileRecord | null>(null);
  const [allSectors, setAllSectors] = React.useState<string[]>([]);
  const [sectorQuery, setSectorQuery] = React.useState("");

  const [fullName, setFullName] = React.useState("");
  const [contactEmail, setContactEmail] = React.useState("");
  const [contactPhone, setContactPhone] = React.useState("");
  const [tradeSide, setTradeSide] = React.useState<"buy" | "sell" | "both">("buy");
  const [minAi, setMinAi] = React.useState<number>(7);
  const [maxBeta, setMaxBeta] = React.useState<string>("");
  const [preferredSectors, setPreferredSectors] = React.useState<string[]>([]);
  const [emailAlerts, setEmailAlerts] = React.useState(false);
  const [dailyDigest, setDailyDigest] = React.useState(false);

  const [loginEmail, setLoginEmail] = React.useState("");
  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");

  React.useEffect(() => {
    setLoginEmail(user?.username || "");
  }, [user?.username]);

  const hydrate = React.useCallback((next: UserProfileRecord) => {
    setProfile(next);
    setFullName(next.full_name || "");
    setContactEmail(next.contact_email || "");
    setContactPhone(next.contact_phone || "");
    setTradeSide((next.preferences?.trade_side as "buy" | "sell" | "both") || "buy");
    setMinAi(typeof next.preferences?.min_ai_rating === "number" ? clamp(next.preferences.min_ai_rating, 0, 10) : 7);
    setMaxBeta(next.preferences?.max_beta === null || next.preferences?.max_beta === undefined ? "" : String(next.preferences.max_beta));
    setPreferredSectors(Array.isArray(next.preferences?.preferred_sectors) ? next.preferences.preferred_sectors : []);
    setEmailAlerts(Boolean(next.preferences?.email_alerts_enabled));
    setDailyDigest(Boolean(next.preferences?.daily_digest_enabled));
  }, []);

  const load = React.useCallback(async () => {
    setLoading(true);
    setProfileError(null);
    try {
      const [profileRes, sectorsRes] = await Promise.all([
        apiFetch("/profile", { cache: "no-store" }),
        apiFetch("/public/sectors", { cache: "force-cache" }),
      ]);

      if (!profileRes.ok) throw new Error(await getErrorMessage(profileRes));
      if (!sectorsRes.ok) throw new Error(await getErrorMessage(sectorsRes));

      const profileJson = (await profileRes.json()) as ProfileResponse;
      const sectorsJson = (await sectorsRes.json()) as SectorResponse;
      hydrate(profileJson.profile);
      setAllSectors((sectorsJson.sectors || []).filter(Boolean));
    } catch (e: any) {
      setProfileError(e?.message || "Failed to load profile.");
    } finally {
      setLoading(false);
    }
  }, [hydrate]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const filteredSectors = React.useMemo(() => {
    const q = sectorQuery.trim().toLowerCase();
    if (!q) return allSectors;
    return allSectors.filter((sector) => sector.toLowerCase().includes(q));
  }, [allSectors, sectorQuery]);

  const selectedSectorCount = preferredSectors.length;
  const sectorsLabel = selectedSectorCount === 0 ? "All sectors" : `${selectedSectorCount} selected`;
  const loginChanged = loginEmail.trim().toLowerCase() !== (user?.username || "").trim().toLowerCase();
  const canSaveCredentials = Boolean(currentPassword.trim()) && (loginChanged || Boolean(newPassword.trim()));

  function toggleSector(sector: string) {
    setPreferredSectors((prev) => (prev.includes(sector) ? prev.filter((value) => value !== sector) : [...prev, sector]));
  }

  function selectAllVisible() {
    if (filteredSectors.length === 0) return;
    const everyVisibleSelected = filteredSectors.every((sector) => preferredSectors.includes(sector));
    if (everyVisibleSelected) {
      setPreferredSectors((prev) => prev.filter((sector) => !filteredSectors.includes(sector)));
    } else {
      setPreferredSectors((prev) => Array.from(new Set([...prev, ...filteredSectors])));
    }
  }

  function clearAllSectors() {
    setPreferredSectors([]);
  }

  async function saveProfile() {
    const trimmedBeta = maxBeta.trim();
    if (trimmedBeta && !Number.isFinite(Number(trimmedBeta))) {
      setProfileError("Max beta must be blank or a number.");
      return;
    }

    setSavingProfile(true);
    setProfileSaved(false);
    setProfileError(null);

    try {
      const res = await apiFetch("/profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          full_name: fullName,
          contact_email: contactEmail,
          contact_phone: contactPhone,
          trade_side: tradeSide,
          min_ai_rating: clamp(minAi, 0, 10),
          max_beta: trimmedBeta === "" ? null : Number(trimmedBeta),
          preferred_sectors: preferredSectors,
          email_alerts_enabled: emailAlerts,
          daily_digest_enabled: dailyDigest,
        }),
      });

      if (!res.ok) throw new Error(await getErrorMessage(res));

      const json = (await res.json()) as ProfileResponse;
      hydrate(json.profile);
      setProfileSaved(true);
      window.setTimeout(() => setProfileSaved(false), 2600);
    } catch (e: any) {
      setProfileError(e?.message || "Failed to save profile.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function saveCredentials() {
    if (!currentPassword.trim()) {
      setCredentialsError("Enter your current password to confirm the change.");
      return;
    }
    if (newPassword && newPassword !== confirmPassword) {
      setCredentialsError("New password and confirmation do not match.");
      return;
    }
    if (!loginChanged && !newPassword.trim()) {
      setCredentialsError("Change the login email or enter a new password before saving.");
      return;
    }

    setSavingCredentials(true);
    setCredentialsSaved(false);
    setCredentialsError(null);

    try {
      const payload: Record<string, string> = {
        current_password: currentPassword,
      };
      if (loginChanged) payload.new_username = loginEmail.trim();
      if (newPassword.trim()) payload.new_password = newPassword;

      const res = await apiFetch("/auth/credentials", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error(await getErrorMessage(res));

      const json = (await res.json()) as UpdateCredentialsResponse;
      setLoginEmail(json.user.username || loginEmail.trim());
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setCredentialsSaved(true);
      window.setTimeout(() => setCredentialsSaved(false), 2600);
      await refresh();
    } catch (e: any) {
      setCredentialsError(e?.message || "Failed to update login credentials.");
    } finally {
      setSavingCredentials(false);
    }
  }

  const alertsEnabled = emailAlerts || dailyDigest;
  const updatedAt = profile?.updated_at || profile?.created_at || null;

  return (
    <div className="space-y-6">
      <div className="glass-panel p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] muted">Workspace settings</div>
            <h1 className="mt-2 text-3xl font-semibold text-zinc-900 dark:text-zinc-100">Profile</h1>
            <p className="mt-2 text-sm muted">
              Tune your “For you” feed, manage contact details, and update the login email and password attached to your account.
            </p>
            {updatedAt ? <div className="mt-3 text-xs muted">Last updated {updatedAt}</div> : null}
          </div>

          <div className="flex flex-wrap gap-3">
            <Link to="/app/for-you" className="btn-secondary h-10 px-4">
              View your feed
            </Link>
            <button type="button" className="btn-secondary h-10 px-4" onClick={() => void load()} disabled={loading}>
              {loading ? "Reloading…" : "Reload"}
            </button>
            <button type="button" className="btn-primary h-10 px-5" onClick={() => void saveProfile()} disabled={loading || savingProfile}>
              {savingProfile ? "Saving…" : "Save profile"}
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard label="Login email" value={user?.username || "—"} helper="Used when signing in" />
          <SummaryCard label="Feed mode" value={tradeSide === "both" ? "Buys + sells" : tradeSide === "buy" ? "Buys only" : "Sells only"} helper={`Min AI ${minAi.toFixed(1)} / 10`} />
          <SummaryCard label="Sector filters" value={sectorsLabel} helper={selectedSectorCount === 0 ? "Nothing excluded" : "Used on your For you page"} />
          <SummaryCard label="Alerts" value={alertsEnabled ? "Enabled" : "Off"} helper={alertsEnabled ? "Email or digest is on" : "No email delivery enabled"} />
        </div>
      </div>

      {profileError ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">{profileError}</div>
      ) : null}
      {profileSaved ? (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
          Profile settings saved.
        </div>
      ) : null}
      {credentialsError ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">{credentialsError}</div>
      ) : null}
      {credentialsSaved ? (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
          Login credentials updated.
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard title="Contact information" subtitle="Used for account communication and alerts if you enable them.">
          <div className="grid gap-4">
            <div>
              <label className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Full name</label>
              <input className="input mt-2 h-11" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Doe" />
            </div>

            <div>
              <label className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Contact email</label>
              <input
                className="input mt-2 h-11"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="you@example.com"
                inputMode="email"
              />
              <div className="mt-1 text-xs muted">This is separate from the login email you use to sign in.</div>
            </div>

            <div>
              <label className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Phone</label>
              <input
                className="input mt-2 h-11"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="+1 (555) 123-4567"
                inputMode="tel"
              />
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Preferences" subtitle="Control which insider events rise to the top of your personal feed.">
          <div className="space-y-6">
            <div>
              <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Show trades</div>
              <div className="mt-3 flex flex-wrap gap-2">
                <ChoiceButton active={tradeSide === "buy"} onClick={() => setTradeSide("buy")}>Buys</ChoiceButton>
                <ChoiceButton active={tradeSide === "sell"} onClick={() => setTradeSide("sell")}>Sells</ChoiceButton>
                <ChoiceButton active={tradeSide === "both"} onClick={() => setTradeSide("both")}>Both</ChoiceButton>
              </div>
              <div className="mt-2 text-xs muted">Buys only is the default for new profiles.</div>
            </div>

            <div>
              <div className="flex items-center justify-between gap-3">
                <label className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Minimum AI rating</label>
                <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{minAi.toFixed(1)} / 10</div>
              </div>
              <input
                type="range"
                min={0}
                max={10}
                step={0.5}
                value={minAi}
                onChange={(e) => setMinAi(Number(e.target.value))}
                className="mt-3 w-full accent-purple-500"
              />
              <div className="mt-2 text-xs muted">Higher values show fewer, higher-conviction signals.</div>
            </div>

            <div>
              <label className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Max beta (optional)</label>
              <input
                className="input mt-2 h-11"
                value={maxBeta}
                onChange={(e) => setMaxBeta(e.target.value)}
                placeholder="e.g. 1.5"
                inputMode="decimal"
              />
              <div className="mt-1 text-xs muted">Leave blank to ignore beta when generating recommendations.</div>
            </div>
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.35fr_0.9fr]">
        <SectionCard
          title="Preferred sectors"
          subtitle="Pick the industries you want your “For you” feed to prioritize."
          right={
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-secondary h-9 px-3" onClick={selectAllVisible} disabled={filteredSectors.length === 0}>
                {filteredSectors.length > 0 && filteredSectors.every((sector) => preferredSectors.includes(sector)) ? "Deselect visible" : "Select visible"}
              </button>
              <button type="button" className="btn-ghost h-9 px-3" onClick={clearAllSectors} disabled={preferredSectors.length === 0}>
                Clear all
              </button>
            </div>
          }
        >
          <div className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <input
                className="input h-11"
                value={sectorQuery}
                onChange={(e) => setSectorQuery(e.target.value)}
                placeholder="Search sectors…"
              />
              <div className="text-sm muted">{preferredSectors.length === 0 ? "All sectors are currently allowed." : `${preferredSectors.length} sector${preferredSectors.length === 1 ? "" : "s"} selected.`}</div>
            </div>

            {allSectors.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-zinc-300/70 px-4 py-8 text-center text-sm muted dark:border-zinc-700/70">
                Sector data has not been loaded yet.
              </div>
            ) : filteredSectors.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-zinc-300/70 px-4 py-8 text-center text-sm muted dark:border-zinc-700/70">
                No sectors matched “{sectorQuery}”.
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {filteredSectors.map((sector) => {
                  const active = preferredSectors.includes(sector);
                  return (
                    <SectorButton key={sector} active={active} onClick={() => toggleSector(sector)}>
                      <div className="font-medium">{sector}</div>
                      <div className="mt-1 text-xs muted">{active ? "Included in your feed" : "Click to include"}</div>
                    </SectorButton>
                  );
                })}
              </div>
            )}
          </div>
        </SectionCard>

        <div className="space-y-6">
          <SectionCard title="Alerts & delivery" subtitle="Decide whether saved signals can contact you outside the app.">
            <div className="space-y-3">
              <ToggleRow
                label="Email alerts"
                description="Allow high-signal events to be sent to your contact email."
                checked={emailAlerts}
                onChange={setEmailAlerts}
              />
              <ToggleRow
                label="Daily digest"
                description="Receive a daily summary of the strongest events that matched your profile."
                checked={dailyDigest}
                onChange={setDailyDigest}
              />
            </div>
          </SectionCard>

          <SectionCard title="Account security" subtitle="Update the login email and password used to access the platform.">
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Login email</label>
                <input
                  className="input mt-2 h-11"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="you@example.com"
                  inputMode="email"
                />
                <div className="mt-1 text-xs muted">This changes the credential you use to sign in. It does not change your contact email above.</div>
              </div>

              <div>
                <label className="text-sm font-medium text-zinc-900 dark:text-zinc-100">New password</label>
                <input
                  type="password"
                  className="input mt-2 h-11"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Leave blank to keep your current password"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Confirm new password</label>
                <input
                  type="password"
                  className="input mt-2 h-11"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat the new password"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Current password</label>
                <input
                  type="password"
                  className="input mt-2 h-11"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Required to confirm any login change"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200/70 bg-white/50 p-4 dark:border-zinc-800/60 dark:bg-black/20">
                <div>
                  <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Ready to update your sign-in?</div>
                  <div className="mt-1 text-sm muted">Use your current password to confirm changes to the login email or password.</div>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Link to="/app/account" className="btn-secondary h-10 px-4">
                    Billing & account
                  </Link>
                  <button type="button" className="btn-primary h-10 px-4" onClick={() => void saveCredentials()} disabled={!canSaveCredentials || savingCredentials}>
                    {savingCredentials ? "Updating…" : "Update login"}
                  </button>
                </div>
              </div>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
