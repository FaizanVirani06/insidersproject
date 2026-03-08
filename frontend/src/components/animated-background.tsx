import * as React from "react";

/**
 * A subtle “glow + grid” background, inspired by the provided Figma homepage.
 *
 * - Uses only Tailwind utilities (no extra deps)
 * - Safe for all pages (pointer-events disabled)
 */
export function AnimatedBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* Base gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-purple-50 via-white to-cyan-50 dark:from-black dark:via-black dark:to-black" />

      {/* Soft glow orbs */}
      <div className="absolute -top-24 left-1/4 h-[34rem] w-[34rem] rounded-full bg-purple-400/30 blur-[120px] animate-pulse [animation-duration:4s] dark:bg-purple-500/20" />
      <div className="absolute top-1/3 -right-24 h-[34rem] w-[34rem] rounded-full bg-cyan-400/30 blur-[120px] animate-pulse [animation-duration:6s] dark:bg-cyan-500/20" />
      <div className="absolute -bottom-24 left-1/3 h-[34rem] w-[34rem] rounded-full bg-blue-400/20 blur-[120px] animate-pulse [animation-duration:5s] dark:bg-blue-500/10" />

      {/* Grid overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#00000008_1px,transparent_1px),linear-gradient(to_bottom,#00000008_1px,transparent_1px)] bg-[size:4rem_4rem] dark:bg-[linear-gradient(to_right,#ffffff06_1px,transparent_1px),linear-gradient(to_bottom,#ffffff06_1px,transparent_1px)]" />

      {/* Vignette */}
      <div className="absolute inset-0 bg-gradient-to-t from-white/70 via-transparent to-white/50 dark:from-black/70 dark:to-black/50" />
    </div>
  );
}
