// frontend/components/NotificationsButton.tsx
// Small icon button in the nav. Cycles through:
//   - unsupported/denied: disabled with a hint
//   - default:           click to request permission
//   - granted + on:      click to mute (keeps permission, turns off listener)
//   - granted + off:     click to unmute
"use client";

import { useEffect, useState } from "react";
import { disableNotifications, requestNotifications } from "./Notifier";

type Mode = "unsupported" | "denied" | "default" | "on" | "off";

function readMode(): Mode {
  if (typeof window === "undefined") return "default";
  if (!("Notification" in window)) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  if (Notification.permission !== "granted") return "default";
  try {
    return window.localStorage.getItem("daes.notify") === "1" ? "on" : "off";
  } catch { return "off"; }
}

export function NotificationsButton() {
  const [mode, setMode] = useState<Mode>("default");
  useEffect(() => { setMode(readMode()); }, []);

  async function handle() {
    if (mode === "unsupported" || mode === "denied") return;
    if (mode === "default") {
      const res = await requestNotifications();
      setMode(res === "granted" ? "on" : res === "denied" ? "denied" : "default");
      return;
    }
    if (mode === "on") { disableNotifications(); setMode("off"); return; }
    if (mode === "off") { try { window.localStorage.setItem("daes.notify", "1"); } catch {} setMode("on"); return; }
  }

  const disabled = mode === "unsupported" || mode === "denied";
  const label =
    mode === "on"          ? "Mute notifications" :
    mode === "off"         ? "Enable notifications" :
    mode === "default"     ? "Enable notifications" :
    mode === "denied"      ? "Notifications blocked in browser settings" :
                             "Notifications unsupported";

  return (
    <button
      type="button"
      onClick={handle}
      aria-label={label}
      title={label}
      disabled={disabled}
      className={
        "relative inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-white/80 text-muted transition-all duration-300 ease-silk hover:text-accent hover:border-accent/40 hover:shadow-glow disabled:cursor-not-allowed disabled:opacity-50 " +
        (mode === "on" ? "!text-accent !border-accent/40" : "")
      }
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M6 8a6 6 0 1 1 12 0v5l1.5 2H4.5L6 13Z" />
        <path d="M10 17a2 2 0 0 0 4 0" />
        {(mode === "off" || mode === "denied" || mode === "unsupported") && <path d="M3 3l18 18" />}
      </svg>
      {mode === "on" && (
        <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-good" aria-hidden />
      )}
    </button>
  );
}
