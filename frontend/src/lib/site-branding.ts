import * as React from "react";

import { apiFetch } from "@/lib/api";

export type SiteBranding = {
  logo_mode: "text" | "image";
  logo_text: string;
  logo_image_src: string | null;
  favicon_image_src: string | null;
};

export const SITE_BRANDING_EVENT = "site-branding-updated";
export const DEFAULT_FAVICON_PATH = "/default-favicon.png";

export const DEFAULT_SITE_BRANDING: SiteBranding = {
  logo_mode: "text",
  logo_text: "InsidrsAI",
  logo_image_src: null,
  favicon_image_src: null,
};

export function normalizeSiteBranding(raw: any): SiteBranding {
  const logoMode = String(raw?.logo_mode || "text").trim().toLowerCase();
  const logoImageSrc =
    typeof raw?.logo_image_src === "string" && raw.logo_image_src.trim() ? raw.logo_image_src.trim() : null;
  const faviconImageSrc =
    typeof raw?.favicon_image_src === "string" && raw.favicon_image_src.trim() ? raw.favicon_image_src.trim() : null;
  const logoText =
    typeof raw?.logo_text === "string" && raw.logo_text.trim()
      ? raw.logo_text.trim()
      : DEFAULT_SITE_BRANDING.logo_text;

  return {
    logo_mode: logoMode === "image" && logoImageSrc ? "image" : "text",
    logo_text: logoText,
    logo_image_src: logoImageSrc,
    favicon_image_src: faviconImageSrc,
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

export function resolveSiteBrandText(branding: SiteBranding | null | undefined): string {
  const text = typeof branding?.logo_text === "string" ? branding.logo_text.trim() : "";
  return text || DEFAULT_SITE_BRANDING.logo_text;
}

export function resolveSiteFaviconSrc(branding: SiteBranding | null | undefined): string {
  const explicitFavicon = typeof branding?.favicon_image_src === "string" ? branding.favicon_image_src.trim() : "";
  if (explicitFavicon) return explicitFavicon;

  const logoImage = typeof branding?.logo_image_src === "string" ? branding.logo_image_src.trim() : "";
  if (logoImage) return logoImage;

  return DEFAULT_FAVICON_PATH;
}

export function buildSiteDocumentTitle(pageLabel: string | null | undefined, branding: SiteBranding | null | undefined): string {
  const brand = resolveSiteBrandText(branding);
  const label = String(pageLabel || "").trim();
  return label ? `${label} • ${brand}` : brand;
}

export function useSiteBranding(): SiteBranding {
  const [branding, setBranding] = React.useState<SiteBranding>(DEFAULT_SITE_BRANDING);

  React.useEffect(() => {
    let cancelled = false;

    void fetchSiteBranding().then((next) => {
      if (!cancelled) {
        setBranding(next);
      }
    });

    const onUpdate = (event: Event) => {
      const detail = (event as CustomEvent<SiteBranding>).detail;
      setBranding(normalizeSiteBranding(detail));
    };

    if (typeof window !== "undefined") {
      window.addEventListener(SITE_BRANDING_EVENT, onUpdate as EventListener);
    }

    return () => {
      cancelled = true;
      if (typeof window !== "undefined") {
        window.removeEventListener(SITE_BRANDING_EVENT, onUpdate as EventListener);
      }
    };
  }, []);

  return branding;
}
