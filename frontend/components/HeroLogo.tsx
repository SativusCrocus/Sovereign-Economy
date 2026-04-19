// frontend/components/HeroLogo.tsx
"use client";
import { useEffect, useRef } from "react";

export function HeroLogo() {
  const wrapRef = useRef<HTMLDivElement>(null);

  // Subtle parallax tilt following cursor when hovering the hero area.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const handle = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const nx = (e.clientX - r.left) / r.width  - 0.5;   // −0.5 → 0.5
      const ny = (e.clientY - r.top)  / r.height - 0.5;
      el.style.setProperty("--rx", `${-ny * 12}deg`);
      el.style.setProperty("--ry", `${ nx * 16}deg`);
    };
    const reset = () => {
      el.style.setProperty("--rx", `0deg`);
      el.style.setProperty("--ry", `0deg`);
    };
    window.addEventListener("pointermove", handle);
    window.addEventListener("pointerleave", reset);
    return () => {
      window.removeEventListener("pointermove", handle);
      window.removeEventListener("pointerleave", reset);
    };
  }, []);

  return (
    <div
      ref={wrapRef}
      className="relative h-[280px] w-[280px] select-none"
      style={{
        perspective: "1200px",
        ["--rx" as string]: "0deg",
        ["--ry" as string]: "0deg",
      }}
    >
      {/* Rotating orbit ring (outer, very subtle) */}
      <div
        className="absolute inset-0 animate-spin-slow"
        style={{
          transform: "rotateX(var(--rx)) rotateY(var(--ry)) translateZ(0)",
          transformStyle: "preserve-3d",
          transition: "transform 600ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
        aria-hidden
      >
        <svg viewBox="0 0 280 280" className="h-full w-full">
          <defs>
            <linearGradient id="ring-g" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%"  stopColor="#7dd3fc" stopOpacity="0.7" />
              <stop offset="50%" stopColor="#a78bfa" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#f472b6" stopOpacity="0.3" />
            </linearGradient>
          </defs>
          <circle
            cx="140" cy="140" r="128"
            fill="none" stroke="url(#ring-g)" strokeWidth="1"
            strokeDasharray="2 8"
            opacity="0.8"
          />
        </svg>
      </div>

      {/* Glow halo */}
      <div
        className="pointer-events-none absolute inset-6 rounded-full animate-breathe"
        style={{
          background:
            "radial-gradient(circle at 40% 30%, rgba(125,211,252,0.28), transparent 65%)," +
            "radial-gradient(circle at 70% 70%, rgba(167,139,250,0.22), transparent 70%)",
          filter: "blur(16px)",
        }}
        aria-hidden
      />

      {/* Main logo — tilts on cursor */}
      <div
        className="absolute inset-0 flex items-center justify-center animate-float"
        style={{
          transform: "rotateX(var(--rx)) rotateY(var(--ry)) translateZ(0)",
          transformStyle: "preserve-3d",
          transition: "transform 600ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        <svg
          viewBox="0 0 64 64"
          className="h-40 w-40 md:h-48 md:w-48"
          aria-label="DAES"
          style={{ filter: "drop-shadow(0 20px 40px rgba(56,189,248,0.35))" }}
        >
          <defs>
            <linearGradient id="hero-g" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%"  stopColor="#7dd3fc" />
              <stop offset="55%" stopColor="#a78bfa" />
              <stop offset="100%" stopColor="#f472b6" />
            </linearGradient>
            <radialGradient id="hero-fill" cx="50%" cy="50%" r="50%">
              <stop offset="0%"  stopColor="#7dd3fc" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#7dd3fc" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* outer diamond */}
          <path
            d="M32 4 L60 32 L32 60 L4 32 Z"
            stroke="url(#hero-g)" strokeWidth="2.25" fill="none" strokeLinejoin="round"
          />
          {/* inner diamond with radial tint */}
          <path
            d="M32 18 L46 32 L32 46 L18 32 Z"
            stroke="url(#hero-g)" strokeWidth="1.75"
            fill="url(#hero-fill)" strokeLinejoin="round"
          />
          {/* connectors */}
          <line x1="32" y1="18" x2="32" y2="8"  stroke="url(#hero-g)" strokeWidth="1.25" strokeLinecap="round" />
          <line x1="46" y1="32" x2="56" y2="32" stroke="url(#hero-g)" strokeWidth="1.25" strokeLinecap="round" />
          <line x1="32" y1="46" x2="32" y2="56" stroke="url(#hero-g)" strokeWidth="1.25" strokeLinecap="round" />
          <line x1="18" y1="32" x2="8"  y2="32" stroke="url(#hero-g)" strokeWidth="1.25" strokeLinecap="round" />
          {/* corner nodes */}
          <circle cx="32" cy="6"  r="2.5" fill="#f1f5f9" />
          <circle cx="58" cy="32" r="2.5" fill="#f1f5f9" />
          <circle cx="32" cy="58" r="2.5" fill="#f1f5f9" />
          <circle cx="6"  cy="32" r="2.5" fill="#f1f5f9" />
          {/* signal core */}
          <circle cx="32" cy="32" r="3.5" fill="url(#hero-g)" />
          <circle cx="32" cy="32" r="1.5" fill="#ffffff" opacity="0.9" />
        </svg>
      </div>
    </div>
  );
}
