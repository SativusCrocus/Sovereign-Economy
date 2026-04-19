import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans:    ["var(--font-sans)", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        display: ["var(--font-sans)", "ui-sans-serif", "system-ui", "-apple-system", "sans-serif"],
        mono:    ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "Consolas", "monospace"],
      },
      colors: {
        // Light surfaces — airy, clean, with a whisper of cool tint
        bg:       "#fafbfd",
        bg2:      "#f3f6fb",
        panel:    "#ffffff",
        panel2:   "#f8fafc",
        border:   "#e4e9f0",
        border2:  "#cbd5e1",
        text:     "#0f172a",
        muted:    "#64748b",
        subtle:   "#94a3b8",
        // Accents — more saturated so they pop against white
        accent:   "#0284c7",  // sky-600
        accent2:  "#0ea5e9",  // sky-500
        iris:     "#7c3aed",  // violet-600
        magenta:  "#db2777",  // pink-600
        amber:    "#d97706",  // amber-600
        good:     "#059669",  // emerald-600
        warn:     "#d97706",  // amber-600
        bad:      "#dc2626",  // red-600
        // Archetype palette (used by the swarm graph)
        arch1:    "#f43f5e",  // rose
        arch2:    "#14b8a6",  // teal
        arch3:    "#8b5cf6",  // violet
        arch4:    "#f97316",  // orange
        arch5:    "#475569",  // slate
      },
      fontSize: {
        "display": ["clamp(2.6rem, 5.2vw, 4.5rem)", { lineHeight: "1.02", letterSpacing: "-0.035em", fontWeight: "700" }],
        "hero":    ["clamp(2rem, 3.5vw, 3rem)",      { lineHeight: "1.05", letterSpacing: "-0.025em", fontWeight: "700" }],
      },
      backgroundImage: {
        "aurora":
          "radial-gradient(50rem 30rem at 15% -10%, rgba(186,230,253,0.55), transparent 55%),\
           radial-gradient(45rem 30rem at 85% -5%,  rgba(221,214,254,0.55), transparent 55%),\
           radial-gradient(42rem 32rem at 50% 5%,   rgba(251,207,232,0.40), transparent 55%)",
        "dots":
          "radial-gradient(rgba(148,163,184,0.45) 1px, transparent 1px)",
        "noise":
          "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.1  0 0 0 0 0.12  0 0 0 0 0.18  0 0 0 0.55 0'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.35'/></svg>\")",
        "silk":
          "linear-gradient(135deg, rgba(14,165,233,0.07) 0%, rgba(124,58,237,0.05) 50%, rgba(219,39,119,0.05) 100%)",
        "silk-strong":
          "linear-gradient(135deg, rgba(14,165,233,0.22), rgba(124,58,237,0.14) 55%, rgba(219,39,119,0.14) 100%)",
        "shine":
          "linear-gradient(120deg, transparent 0%, rgba(255,255,255,0.4) 45%, rgba(255,255,255,0.6) 50%, rgba(255,255,255,0.4) 55%, transparent 100%)",
        "iris-grad":
          "linear-gradient(135deg, #0284c7 0%, #7c3aed 55%, #db2777 100%)",
      },
      backgroundSize: {
        "dots": "22px 22px",
        "shine": "200% 100%",
      },
      boxShadow: {
        "glow":     "0 0 0 1px rgba(14,165,233,0.25), 0 10px 30px -8px rgba(14,165,233,0.35)",
        "glow-v":   "0 0 0 1px rgba(124,58,237,0.25), 0 10px 30px -8px rgba(124,58,237,0.32)",
        "card":     "0 1px 2px rgba(15,23,42,0.04), 0 12px 32px -16px rgba(15,23,42,0.16)",
        "card-lg":  "0 1px 2px rgba(15,23,42,0.04), 0 22px 50px -20px rgba(15,23,42,0.18), 0 6px 18px -10px rgba(14,165,233,0.12)",
        "tilt":     "0 32px 64px -24px rgba(14,165,233,0.30), 0 14px 30px -12px rgba(124,58,237,0.22)",
        "hair":     "inset 0 1px 0 rgba(255,255,255,0.6), 0 1px 0 rgba(15,23,42,0.04)",
      },
      blur: {
        "3xl": "64px",
        "4xl": "120px",
      },
      keyframes: {
        aurora: {
          "0%,100%": { transform: "translate3d(0,0,0) scale(1)" },
          "25%":     { transform: "translate3d(3%,2%,0) scale(1.05)" },
          "50%":     { transform: "translate3d(-2%,3%,0) scale(0.97)" },
          "75%":     { transform: "translate3d(2%,-3%,0) scale(1.03)" },
        },
        float: {
          "0%,100%": { transform: "translateY(0) rotate(0)" },
          "50%":     { transform: "translateY(-8px) rotate(0.5deg)" },
        },
        breathe: {
          "0%,100%": { filter: "drop-shadow(0 0 10px rgba(14,165,233,0.22))" },
          "50%":     { filter: "drop-shadow(0 0 24px rgba(14,165,233,0.40))" },
        },
        shimmer: {
          "0%":   { backgroundPosition: "200% 0" },
          "100%": { backgroundPosition: "-200% 0" },
        },
        pulse2: {
          "0%, 100%": { opacity: "0.6" },
          "50%":      { opacity: "1" },
        },
        "spin-slow": {
          "0%":   { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
        marquee: {
          "0%":   { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        heatpulse: {
          "0%,100%": { opacity: "0.85" },
          "50%":     { opacity: "1" },
        },
      },
      animation: {
        aurora:    "aurora 28s ease-in-out infinite",
        float:     "float 7s ease-in-out infinite",
        breathe:   "breathe 4.5s ease-in-out infinite",
        shimmer:   "shimmer 3s linear infinite",
        "pulse2":  "pulse2 2.5s ease-in-out infinite",
        "spin-slow": "spin-slow 40s linear infinite",
        marquee:   "marquee 42s linear infinite",
        heatpulse: "heatpulse 3s ease-in-out infinite",
      },
      transitionTimingFunction: {
        "silk": "cubic-bezier(0.22, 1, 0.36, 1)",
      },
    },
  },
  plugins: [],
};
export default config;
