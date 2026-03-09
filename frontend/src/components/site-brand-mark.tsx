import * as React from "react";

import { useSiteBranding } from "@/lib/site-branding";

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
  const branding = useSiteBranding();
  const [imageFailed, setImageFailed] = React.useState(false);

  React.useEffect(() => {
    setImageFailed(false);
  }, [branding.logo_image_src, branding.logo_mode, branding.logo_text]);

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
