import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans:    ["var(--font-sans)", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        display: ["var(--font-sans)", "ui-sans-serif", "system-ui", "-apple-system", "sans-serif"],
        mono:    ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "Consolas", "monospace"],
      },
      colors: {
        // Base surface palette — warmer blacks, more air in the mids
        bg:       "#07080b",
        bg2:      "#0a0c11",
        panel:    "#0f1218",
        panel2:   "#141824",
        border:   "#1d2230",
        border2:  "#2a3142",
        text:     "#f1f5f9",
        muted:    "#8892a6",
        subtle:   "#5a6478",
        // Accent spectrum — cyan → violet → magenta
        accent:   "#7dd3fc",
        accent2:  "#38bdf8",
        iris:     "#a78bfa",
        magenta:  "#f472b6",
        amber:    "#fbbf24",
        good:     "#4ade80",
        warn:     "#fbbf24",
        bad:      "#f87171",
      },
      fontSize: {
        "display": ["clamp(2.6rem, 5.2vw, 4.5rem)", { lineHeight: "1.02", letterSpacing: "-0.03em", fontWeight: "700" }],
        "hero":    ["clamp(2rem, 3.5vw, 3rem)",      { lineHeight: "1.05", letterSpacing: "-0.025em", fontWeight: "700" }],
      },
      backgroundImage: {
        "aurora":
          "radial-gradient(60rem 30rem at 10% -10%, rgba(125,211,252,0.20), transparent 60%),\
           radial-gradient(55rem 30rem at 90% -5%, rgba(167,139,250,0.18), transparent 60%),\
           radial-gradient(50rem 35rem at 50% -20%, rgba(244,114,182,0.10), transparent 65%)",
        "grid":
          "linear-gradient(to right, rgba(40,50,70,0.35) 1px, transparent 1px),\
           linear-gradient(to bottom, rgba(40,50,70,0.35) 1px, transparent 1px)",
        "noise":
          "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.5  0 0 0 0 0.55  0 0 0 0 0.65  0 0 0 0.5 0'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.6'/></svg>\")",
        "silk":
          "linear-gradient(135deg, rgba(125,211,252,0.08) 0%, rgba(167,139,250,0.06) 50%, rgba(244,114,182,0.05) 100%)",
        "silk-strong":
          "linear-gradient(135deg, rgba(125,211,252,0.28), rgba(167,139,250,0.18) 55%, rgba(244,114,182,0.18) 100%)",
        "shine":
          "linear-gradient(120deg, transparent 0%, rgba(255,255,255,0.08) 40%, rgba(255,255,255,0.16) 50%, rgba(255,255,255,0.08) 60%, transparent 100%)",
        "iris-grad":
          "linear-gradient(135deg, #7dd3fc 0%, #a78bfa 60%, #f472b6 100%)",
      },
      backgroundSize: {
        "grid": "40px 40px",
        "shine": "200% 100%",
      },
      boxShadow: {
        "glow":     "0 0 0 1px rgba(125,211,252,0.28), 0 0 28px -4px rgba(56,189,248,0.30)",
        "glow-v":   "0 0 0 1px rgba(167,139,250,0.28), 0 0 28px -4px rgba(167,139,250,0.30)",
        "card":     "0 1px 0 0 rgba(255,255,255,0.03) inset, 0 20px 40px -24px rgba(0,0,0,0.6)",
        "card-lg":  "0 1px 0 0 rgba(255,255,255,0.05) inset, 0 30px 80px -28px rgba(0,0,0,0.75), 0 6px 18px -10px rgba(56,189,248,0.15)",
        "tilt":     "0 30px 60px -20px rgba(56,189,248,0.35), 0 14px 30px -12px rgba(167,139,250,0.25)",
      },
      blur: {
        "3xl": "64px",
        "4xl": "120px",
      },
      keyframes: {
        aurora: {
          "0%,100%": { transform: "translate3d(0%,0%,0) scale(1)",   opacity: "0.9" },
          "25%":     { transform: "translate3d(3%,2%,0) scale(1.05)", opacity: "1" },
          "50%":     { transform: "translate3d(-2%,3%,0) scale(0.97)", opacity: "0.85" },
          "75%":     { transform: "translate3d(2%,-3%,0) scale(1.03)", opacity: "0.95" },
        },
        float: {
          "0%,100%": { transform: "translateY(0) rotate(0)" },
          "50%":     { transform: "translateY(-8px) rotate(0.5deg)" },
        },
        breathe: {
          "0%,100%": { filter: "drop-shadow(0 0 12px rgba(56,189,248,0.28))" },
          "50%":     { filter: "drop-shadow(0 0 28px rgba(56,189,248,0.55))" },
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
      },
      animation: {
        aurora:   "aurora 24s ease-in-out infinite",
        float:    "float 7s ease-in-out infinite",
        breathe:  "breathe 4.5s ease-in-out infinite",
        shimmer:  "shimmer 3s linear infinite",
        "pulse2": "pulse2 2.5s ease-in-out infinite",
        "spin-slow": "spin-slow 30s linear infinite",
      },
      transitionTimingFunction: {
        "silk": "cubic-bezier(0.22, 1, 0.36, 1)",
      },
    },
  },
  plugins: [],
};
export default config;
