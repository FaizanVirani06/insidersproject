import * as React from "react";

import { SiteBrandMark } from "@/components/site-brand-mark";
import { apiFetch } from "@/lib/api";
import {
  DEFAULT_SITE_BRANDING,
  emitSiteBrandingUpdated,
  normalizeSiteBranding,
  type SiteBranding,
} from "@/lib/site-branding";

type PricingDisplay = {
  currency: string;
  monthly_usd: number;
  yearly_usd: number;
};

function PreviewBrand({ branding }: { branding: SiteBranding }) {
  const showImage = branding.logo_mode === "image" && !!branding.logo_image_src;

  return (
    <div className="rounded-2xl border border-zinc-800/60 bg-black/25 p-5">
      <div className="text-xs font-semibold uppercase tracking-[0.18em] muted">Live preview</div>
      <div className="mt-4 rounded-2xl border border-zinc-800/60 bg-black/35 p-4">
        <div className="flex items-center justify-between gap-4 border-b border-zinc-800/60 pb-4">
          <div className="flex items-center gap-3">
            {showImage ? (
              <img
                src={branding.logo_image_src || undefined}
                alt={branding.logo_text || "InsidrsAI"}
                className="h-9 w-auto max-w-[200px] object-contain"
              />
            ) : (
              <div className="bg-gradient-to-r from-purple-400 via-cyan-300 to-blue-300 bg-clip-text text-xl font-semibold tracking-tight text-transparent">
                {branding.logo_text || "InsidrsAI"}
              </div>
            )}
          </div>
          <div className="rounded-full bg-white/10 px-3 py-2 text-sm text-zinc-300">Header logo</div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <SiteBrandMark textClassName="text-lg" imageClassName="h-8" />
          <span className="text-sm muted">Current saved branding</span>
        </div>
      </div>
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

async function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
}

export function AdminSettingsPage() {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

  const [savingPricing, setSavingPricing] = React.useState(false);
  const [savingBranding, setSavingBranding] = React.useState(false);

  const [display, setDisplay] = React.useState<PricingDisplay | null>(null);
  const [plans, setPlans] = React.useState<{ monthly: string | null; yearly: string | null } | null>(null);

  const [monthlyUsd, setMonthlyUsd] = React.useState<string>("");
  const [yearlyUsd, setYearlyUsd] = React.useState<string>("");
  const [currency, setCurrency] = React.useState<string>("USD");

  const [savedBranding, setSavedBranding] = React.useState<SiteBranding>(DEFAULT_SITE_BRANDING);
  const [logoMode, setLogoMode] = React.useState<"text" | "image">("text");
  const [logoText, setLogoText] = React.useState("InsidrsAI");
  const [logoImageSrc, setLogoImageSrc] = React.useState("");
  const [uploadingLabel, setUploadingLabel] = React.useState<string | null>(null);

  const livePreview = React.useMemo<SiteBranding>(
    () =>
      normalizeSiteBranding({
        logo_mode: logoMode,
        logo_text: logoText,
        logo_image_src: logoImageSrc,
      }),
    [logoMode, logoText, logoImageSrc]
  );

  const hydrateBranding = React.useCallback((branding: SiteBranding) => {
    const normalized = normalizeSiteBranding(branding);
    setSavedBranding(normalized);
    setLogoMode(normalized.logo_mode);
    setLogoText(normalized.logo_text);
    setLogoImageSrc(normalized.logo_image_src || "");
  }, []);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const [dRes, pRes, bRes] = await Promise.all([
        apiFetch("/public/pricing-display", { cache: "no-store" }),
        apiFetch("/billing/plans", { cache: "no-store" }),
        apiFetch("/public/site-branding", { cache: "no-store" }),
      ]);

      if (!dRes.ok) throw new Error(await dRes.text());
      if (!pRes.ok) throw new Error(await pRes.text());
      if (!bRes.ok) throw new Error(await bRes.text());

      const d = (await dRes.json()) as PricingDisplay;
      const p = await pRes.json();
      const b = await bRes.json();

      setDisplay(d);
      setMonthlyUsd(String(d.monthly_usd));
      setYearlyUsd(String(d.yearly_usd));
      setCurrency(d.currency || "USD");

      setPlans({ monthly: p?.monthly ?? null, yearly: p?.yearly ?? null });
      hydrateBranding(b?.branding ?? b);
    } catch (e: any) {
      setError(e?.message || "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, [hydrateBranding]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function savePricing() {
    setSavingPricing(true);
    setError(null);
    setSuccess(null);

    try {
      const monthly = parseFloat(monthlyUsd);
      const yearly = parseFloat(yearlyUsd);
      if (!Number.isFinite(monthly) || monthly <= 0) throw new Error("Monthly price must be a positive number.");
      if (!Number.isFinite(yearly) || yearly <= 0) throw new Error("Yearly price must be a positive number.");

      const res = await apiFetch("/admin/site/pricing-display", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ monthly_usd: monthly, yearly_usd: yearly, currency }),
      });
      if (!res.ok) throw new Error(await res.text());

      const json = await res.json();
      const next = json?.pricing as PricingDisplay | undefined;
      if (next) {
        setDisplay(next);
        setMonthlyUsd(String(next.monthly_usd));
        setYearlyUsd(String(next.yearly_usd));
        setCurrency(next.currency || currency);
      }
      setSuccess("Pricing display saved.");
    } catch (e: any) {
      setError(e?.message || "Failed to save pricing.");
    } finally {
      setSavingPricing(false);
    }
  }

  async function saveBranding() {
    setSavingBranding(true);
    setError(null);
    setSuccess(null);

    try {
      if (!logoText.trim()) throw new Error("Brand text cannot be blank.");
      if (logoMode === "image" && !logoImageSrc.trim()) {
        throw new Error("Choose an image or paste an image URL before saving image mode.");
      }

      const res = await apiFetch("/admin/site/branding", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          logo_mode: logoMode,
          logo_text: logoText.trim(),
          logo_image_src: logoImageSrc.trim() || null,
        }),
      });
      if (!res.ok) throw new Error(await res.text());

      const json = await res.json();
      const branding = normalizeSiteBranding(json?.branding ?? json);
      hydrateBranding(branding);
      emitSiteBrandingUpdated(branding);
      setSuccess("Site branding saved.");
    } catch (e: any) {
      setError(e?.message || "Failed to save branding.");
    } finally {
      setSavingBranding(false);
    }
  }

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadingLabel(file.name);
    setError(null);

    try {
      const dataUrl = await readFileAsDataUrl(file);
      setLogoMode("image");
      setLogoImageSrc(dataUrl);
      setSuccess("Logo loaded into the preview. Save branding to publish it.");
    } catch (e: any) {
      setError(e?.message || "Failed to load logo file.");
    } finally {
      setUploadingLabel(null);
      event.target.value = "";
    }
  }

  const brandingDirty =
    livePreview.logo_mode !== savedBranding.logo_mode ||
    livePreview.logo_text !== savedBranding.logo_text ||
    (livePreview.logo_image_src || "") !== (savedBranding.logo_image_src || "");

  return (
    <div className="space-y-6">
      <div className="glass-panel p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] muted">Admin controls</div>
            <h1 className="mt-2 text-3xl font-semibold text-zinc-900 dark:text-zinc-100">Site settings</h1>
            <p className="mt-2 text-sm muted">
              Update customer-facing pricing copy and change the public site logo without deploying new code.
            </p>
          </div>

          <button type="button" className="btn-secondary h-10 px-4" onClick={() => void load()} disabled={loading}>
            {loading ? "Reloading…" : "Reload settings"}
          </button>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            label="Display pricing"
            value={display ? `${display.currency} ${display.monthly_usd}/mo` : "—"}
            helper={display ? `${display.currency} ${display.yearly_usd}/yr` : "Loading…"}
          />
          <SummaryCard
            label="Stripe plans"
            value={plans?.monthly ? "Monthly ready" : "Monthly missing"}
            helper={plans?.yearly ? "Yearly ready" : "Yearly missing"}
          />
          <SummaryCard
            label="Brand mode"
            value={savedBranding.logo_mode === "image" ? "Image logo" : "Text logo"}
            helper={savedBranding.logo_text}
          />
          <SummaryCard
            label="Brand status"
            value={brandingDirty ? "Unsaved changes" : "Saved"}
            helper={brandingDirty ? "Preview differs from live" : "Header is up to date"}
          />
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
          {success}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="glass-panel p-5">
          <div className="flex items-end justify-between gap-3 flex-wrap">
            <div>
              <div className="text-sm font-semibold">Pricing display</div>
              <div className="mt-1 text-xs muted">
                Controls the numbers shown on the pricing page. This does not change Stripe billing.
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div>
              <label className="block text-sm font-medium text-zinc-900 dark:text-zinc-100">Monthly (USD)</label>
              <input
                className="input mt-1"
                value={monthlyUsd}
                onChange={(e) => setMonthlyUsd(e.target.value)}
                disabled={loading}
              />
              {!plans?.monthly ? <div className="mt-1 text-xs muted">Stripe monthly plan ID not configured.</div> : null}
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-900 dark:text-zinc-100">Yearly (USD)</label>
              <input
                className="input mt-1"
                value={yearlyUsd}
                onChange={(e) => setYearlyUsd(e.target.value)}
                disabled={loading}
              />
              {!plans?.yearly ? <div className="mt-1 text-xs muted">Stripe yearly plan ID not configured.</div> : null}
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-900 dark:text-zinc-100">Currency</label>
              <input
                className="input mt-1"
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                disabled={loading}
              />
              <div className="mt-1 text-xs muted">Usually USD.</div>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-end gap-2">
            <button type="button" className="btn-primary h-10 px-4" onClick={() => void savePricing()} disabled={loading || savingPricing}>
              {savingPricing ? "Saving…" : "Save pricing"}
            </button>
          </div>
        </div>

        <div className="glass-panel p-5">
          <div className="text-sm font-semibold">Current brand</div>
          <div className="mt-1 text-xs muted">The header and footer pull from this saved branding automatically.</div>
          <div className="mt-4 rounded-2xl border border-zinc-800/60 bg-black/25 p-4">
            <SiteBrandMark textClassName="text-xl" imageClassName="h-10" />
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="glass-panel p-5">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="text-sm font-semibold">Site branding</div>
              <div className="mt-1 text-xs muted">
                Choose a text logo or upload an image for the public marketing site and app header.
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                className="btn-secondary h-10 px-4"
                onClick={() => hydrateBranding(savedBranding)}
                disabled={loading || savingBranding || !brandingDirty}
              >
                Reset preview
              </button>
              <button
                type="button"
                className="btn-primary h-10 px-4"
                onClick={() => void saveBranding()}
                disabled={loading || savingBranding}
              >
                {savingBranding ? "Saving…" : "Save branding"}
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-zinc-900 dark:text-zinc-100">Display mode</label>
              <select className="input mt-1" value={logoMode} onChange={(e) => setLogoMode(e.target.value as "text" | "image")}>
                <option value="text">Text logo</option>
                <option value="image">Image logo</option>
              </select>
              <div className="mt-1 text-xs muted">Text mode uses the site name in a gradient. Image mode uses your uploaded or linked logo.</div>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-900 dark:text-zinc-100">Brand text</label>
              <input className="input mt-1" value={logoText} onChange={(e) => setLogoText(e.target.value)} />
              <div className="mt-1 text-xs muted">Used for the text logo, alt text, and fallback when the image cannot load.</div>
            </div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
            <div>
              <label className="block text-sm font-medium text-zinc-900 dark:text-zinc-100">Logo image URL or uploaded data</label>
              <textarea
                className="textarea mt-1 min-h-[110px]"
                value={logoImageSrc}
                onChange={(e) => setLogoImageSrc(e.target.value)}
                placeholder="Paste an https:// image URL or use the upload button below."
              />
              <div className="mt-1 text-xs muted">
                PNG, JPG, SVG, and uploaded data URLs are supported. Leave blank to use text mode.
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-800/60 bg-black/20 p-4">
              <div className="text-sm font-medium text-zinc-100">Upload logo file</div>
              <div className="mt-2 text-xs muted">
                Convert a local image into an embedded logo without leaving the dashboard.
              </div>

              <label className="btn-secondary mt-4 h-10 cursor-pointer px-4">
                Choose file
                <input type="file" accept="image/*" className="hidden" onChange={handleUpload} />
              </label>

              <div className="mt-3 text-xs muted">
                {uploadingLabel ? `Loading ${uploadingLabel}…` : "A saved upload becomes part of the site settings."}
              </div>

              {logoImageSrc ? (
                <button
                  type="button"
                  className="btn-ghost mt-4 h-9 px-3"
                  onClick={() => setLogoImageSrc("")}
                >
                  Clear image
                </button>
              ) : null}
            </div>
          </div>
        </div>

        <PreviewBrand branding={livePreview} />
      </div>
    </div>
  );
}
