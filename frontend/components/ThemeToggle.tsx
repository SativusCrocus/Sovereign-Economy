// frontend/components/ThemeToggle.tsx
// Theme toggle — light by default. Persists to localStorage.
// A small inline script in layout.tsx sets the class before hydration
// so there's no flash of wrong theme.
"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

function readTheme(): Theme {
  if (typeof window === "undefined") return "light";
  try {
    const stored = window.localStorage.getItem("daes.theme");
    if (stored === "dark" || stored === "light") return stored;
  } catch {}
  return "light";
}

function applyTheme(t: Theme) {
  const html = document.documentElement;
  if (t === "dark") html.classList.add("dark"); else html.classList.remove("dark");
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const t = readTheme();
    setTheme(t);
    applyTheme(t);
    setReady(true);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
    try { window.localStorage.setItem("daes.theme", next); } catch {}
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Activate ${theme === "dark" ? "light" : "dark"} theme`}
      title={`${theme === "dark" ? "Light" : "Dark"} theme · t`}
      className={
        "relative inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-white/80 text-muted transition-all duration-300 ease-silk hover:text-accent hover:border-accent/40 hover:shadow-glow " +
        (ready ? "" : "opacity-0")
      }
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {theme === "dark" ? (
          /* Sun icon */
          <g>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 3v1.6M12 19.4V21M3 12h1.6M19.4 12H21M5.1 5.1l1.2 1.2M17.7 17.7l1.2 1.2M5.1 18.9l1.2-1.2M17.7 6.3l1.2-1.2" />
          </g>
        ) : (
          /* Moon icon */
          <path d="M20.5 14.5A8 8 0 1 1 9.5 3.5a7 7 0 0 0 11 11Z" />
        )}
      </svg>
    </button>
  );
}
