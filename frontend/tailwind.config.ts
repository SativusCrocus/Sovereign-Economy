import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "Consolas", "monospace"],
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
      colors: {
        bg:      "#0b0d10",
        panel:   "#12161b",
        border:  "#1f262e",
        text:    "#e6edf3",
        muted:   "#9aa4af",
        accent:  "#7dd3fc",
        accent2: "#38bdf8",
        good:    "#4ade80",
        warn:    "#fbbf24",
        bad:     "#f87171",
      },
      backgroundImage: {
        "hero-glow":
          "radial-gradient(ellipse 60% 50% at 50% 0%, rgba(56,189,248,0.12), transparent 70%)",
        "grid":
          "linear-gradient(to right, rgba(31,38,46,0.4) 1px, transparent 1px), linear-gradient(to bottom, rgba(31,38,46,0.4) 1px, transparent 1px)",
      },
      backgroundSize: {
        "grid": "40px 40px",
      },
      boxShadow: {
        "glow": "0 0 0 1px rgba(125,211,252,0.3), 0 0 24px -4px rgba(56,189,248,0.25)",
      },
      keyframes: {
        pulse2: {
          "0%, 100%": { opacity: "0.6" },
          "50%":      { opacity: "1" },
        },
      },
      animation: {
        "pulse2": "pulse2 2.5s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
export default config;
