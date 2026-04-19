// frontend/components/HeroLogo.tsx
"use client";
import { useEffect, useRef } from "react";

export function HeroLogo() {
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const handle = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const nx = (e.clientX - r.left) / r.width  - 0.5;
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
      {/* Rotating orbit ring */}
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
              <stop offset="0%"  stopColor="#0ea5e9" stopOpacity="0.75" />
              <stop offset="50%" stopColor="#7c3aed" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#db2777" stopOpacity="0.35" />
            </linearGradient>
          </defs>
          <circle
            cx="140" cy="140" r="128"
            fill="none" stroke="url(#ring-g)" strokeWidth="1"
            strokeDasharray="2 8"
            opacity="0.85"
          />
        </svg>
      </div>

      {/* Glow halo */}
      <div
        className="pointer-events-none absolute inset-6 rounded-full animate-breathe"
        style={{
          background:
            "radial-gradient(circle at 40% 30%, rgba(14,165,233,0.32), transparent 65%)," +
            "radial-gradient(circle at 70% 70%, rgba(124,58,237,0.22), transparent 70%)",
          filter: "blur(18px)",
        }}
        aria-hidden
      />

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
          style={{ filter: "drop-shadow(0 20px 36px rgba(14,165,233,0.35))" }}
        >
          <defs>
            <linearGradient id="hero-g" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%"  stopColor="#0ea5e9" />
              <stop offset="55%" stopColor="#7c3aed" />
              <stop offset="100%" stopColor="#db2777" />
            </linearGradient>
            <radialGradient id="hero-fill" cx="50%" cy="50%" r="50%">
              <stop offset="0%"  stopColor="#0ea5e9" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0" />
            </radialGradient>
          </defs>

          <path d="M32 4 L60 32 L32 60 L4 32 Z"   stroke="url(#hero-g)" strokeWidth="2.25" fill="none" strokeLinejoin="round" />
          <path d="M32 18 L46 32 L32 46 L18 32 Z" stroke="url(#hero-g)" strokeWidth="1.75" fill="url(#hero-fill)" strokeLinejoin="round" />
          <line x1="32" y1="18" x2="32" y2="8"  stroke="url(#hero-g)" strokeWidth="1.25" strokeLinecap="round" />
          <line x1="46" y1="32" x2="56" y2="32" stroke="url(#hero-g)" strokeWidth="1.25" strokeLinecap="round" />
          <line x1="32" y1="46" x2="32" y2="56" stroke="url(#hero-g)" strokeWidth="1.25" strokeLinecap="round" />
          <line x1="18" y1="32" x2="8"  y2="32" stroke="url(#hero-g)" strokeWidth="1.25" strokeLinecap="round" />
          <circle cx="32" cy="6"  r="2.5" fill="#0f172a" />
          <circle cx="58" cy="32" r="2.5" fill="#0f172a" />
          <circle cx="32" cy="58" r="2.5" fill="#0f172a" />
          <circle cx="6"  cy="32" r="2.5" fill="#0f172a" />
          <circle cx="32" cy="32" r="3.5" fill="url(#hero-g)" />
          <circle cx="32" cy="32" r="1.4" fill="#ffffff" />
        </svg>
      </div>
    </div>
  );
}
