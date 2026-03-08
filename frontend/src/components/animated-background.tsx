import * as React from "react";

/**
 * Subtle “glow + grid” background used across the app.
 *
 * - Safe for all pages (pointer-events disabled)
 * - No extra deps
 * - Includes a few softly animated floating orbs for depth
 */

type Orb = {
  id: number;
  initialX: number;
  initialY: number;
  size: number;
  duration: number;
  delay: number;
  dx1: number;
  dy1: number;
  dx2: number;
  dy2: number;
  dx3: number;
  dy3: number;
};

function rand(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

export function AnimatedBackground() {
  // Generate random floating orb animations once per mount (avoid jitter on re-render)
  const orbs = React.useMemo<Orb[]>(() => {
    return Array.from({ length: 12 }, (_, i) => ({
      id: i,
      initialX: rand(0, 100),
      initialY: rand(0, 100),
      size: rand(18, 60),
      duration: rand(18, 40),
      delay: rand(0, 6),
      dx1: rand(-120, 120),
      dy1: rand(-120, 120),
      dx2: rand(-120, 120),
      dy2: rand(-120, 120),
      dx3: rand(-120, 120),
      dy3: rand(-120, 120),
    }));
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* Base gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-purple-50 via-white to-cyan-50 dark:from-black dark:via-black dark:to-black" />

      {/* Soft glow orbs */}
      <div className="absolute -top-24 left-1/4 h-[34rem] w-[34rem] rounded-full bg-purple-400/30 blur-[120px] animate-pulse [animation-duration:4s] dark:bg-purple-500/20" />
      <div className="absolute top-1/3 -right-24 h-[34rem] w-[34rem] rounded-full bg-cyan-400/30 blur-[120px] animate-pulse [animation-duration:6s] dark:bg-cyan-500/20" />
      <div className="absolute -bottom-24 left-1/3 h-[34rem] w-[34rem] rounded-full bg-blue-400/20 blur-[120px] animate-pulse [animation-duration:5s] dark:bg-blue-500/10" />

      {/* Floating white orbs */}
      {orbs.map((orb) => (
        <div
          key={orb.id}
          className="absolute rounded-full bg-white mix-blend-overlay dark:bg-white"
          style={
            {
              width: orb.size,
              height: orb.size,
              left: `${orb.initialX}%`,
              top: `${orb.initialY}%`,
              filter: "blur(8px)",
              opacity: 0,
              animation: `orb-float ${orb.duration}s ease-in-out ${orb.delay}s infinite`,
              // Custom properties consumed by the keyframes (see globals.css)
              ["--dx1" as any]: `${orb.dx1}px`,
              ["--dy1" as any]: `${orb.dy1}px`,
              ["--dx2" as any]: `${orb.dx2}px`,
              ["--dy2" as any]: `${orb.dy2}px`,
              ["--dx3" as any]: `${orb.dx3}px`,
              ["--dy3" as any]: `${orb.dy3}px`,
            } as React.CSSProperties
          }
        />
      ))}

      {/* Grid overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#00000008_1px,transparent_1px),linear-gradient(to_bottom,#00000008_1px,transparent_1px)] bg-[size:4rem_4rem] dark:bg-[linear-gradient(to_right,#ffffff06_1px,transparent_1px),linear-gradient(to_bottom,#ffffff06_1px,transparent_1px)]" />

      {/* Vignette */}
      <div className="absolute inset-0 bg-gradient-to-t from-white/70 via-transparent to-white/50 dark:from-black/70 dark:to-black/50" />
    </div>
  );
}
