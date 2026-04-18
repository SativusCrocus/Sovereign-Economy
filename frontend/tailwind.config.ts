import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "monospace"],
      },
      colors: {
        bg:      "#0b0d10",
        panel:   "#12161b",
        border:  "#1f262e",
        text:    "#e6edf3",
        muted:   "#9aa4af",
        accent:  "#7dd3fc",
        good:    "#4ade80",
        warn:    "#fbbf24",
        bad:     "#f87171",
      },
    },
  },
  plugins: [],
};
export default config;
