import { apiFetch } from "@/lib/api";

export type SiteBranding = {
  logo_mode: "text" | "image";
  logo_text: string;
  logo_image_src: string | null;
};

export const SITE_BRANDING_EVENT = "site-branding-updated";

export const DEFAULT_SITE_BRANDING: SiteBranding = {
  logo_mode: "text",
  logo_text: "InsidrsAI",
  logo_image_src: null,
};

export function normalizeSiteBranding(raw: any): SiteBranding {
  const logoMode = String(raw?.logo_mode || "text").trim().toLowerCase();
  const logoImageSrc =
    typeof raw?.logo_image_src === "string" && raw.logo_image_src.trim() ? raw.logo_image_src.trim() : null;
  const logoText =
    typeof raw?.logo_text === "string" && raw.logo_text.trim()
      ? raw.logo_text.trim()
      : DEFAULT_SITE_BRANDING.logo_text;

  return {
    logo_mode: logoMode === "image" && logoImageSrc ? "image" : "text",
    logo_text: logoText,
    logo_image_src: logoImageSrc,
  };
}

export async function fetchSiteBranding(): Promise<SiteBranding> {
  try {
    const res = await apiFetch("/public/site-branding", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return normalizeSiteBranding(data?.branding ?? data);
  } catch {
    return DEFAULT_SITE_BRANDING;
  }
}

export function emitSiteBrandingUpdated(branding: SiteBranding) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<SiteBranding>(SITE_BRANDING_EVENT, { detail: branding }));
}
