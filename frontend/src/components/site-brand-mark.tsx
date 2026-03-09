import * as React from "react";

import {
  DEFAULT_SITE_BRANDING,
  SITE_BRANDING_EVENT,
  fetchSiteBranding,
  normalizeSiteBranding,
  type SiteBranding,
} from "@/lib/site-branding";

type SiteBrandMarkProps = {
  className?: string;
  textClassName?: string;
  imageClassName?: string;
};

export function SiteBrandMark({
  className = "",
  textClassName = "",
  imageClassName = "",
}: SiteBrandMarkProps) {
  const [branding, setBranding] = React.useState<SiteBranding>(DEFAULT_SITE_BRANDING);
  const [imageFailed, setImageFailed] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;

    void fetchSiteBranding().then((next) => {
      if (!cancelled) {
        setBranding(next);
        setImageFailed(false);
      }
    });

    const onUpdate = (event: Event) => {
      const detail = (event as CustomEvent<SiteBranding>).detail;
      setBranding(normalizeSiteBranding(detail));
      setImageFailed(false);
    };

    window.addEventListener(SITE_BRANDING_EVENT, onUpdate as EventListener);
    return () => {
      cancelled = true;
      window.removeEventListener(SITE_BRANDING_EVENT, onUpdate as EventListener);
    };
  }, []);

  const showImage = branding.logo_mode === "image" && !!branding.logo_image_src && !imageFailed;

  return (
    <div className={className}>
      {showImage ? (
        <img
          src={branding.logo_image_src || undefined}
          alt={branding.logo_text || "InsidrsAI"}
          className={["h-8 w-auto object-contain", imageClassName].join(" ")}
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span
          className={[
            "bg-gradient-to-r from-purple-400 via-cyan-300 to-blue-300 bg-clip-text text-lg font-semibold tracking-tight text-transparent",
            textClassName,
          ].join(" ")}
        >
          {branding.logo_text || "InsidrsAI"}
        </span>
      )}
    </div>
  );
}
