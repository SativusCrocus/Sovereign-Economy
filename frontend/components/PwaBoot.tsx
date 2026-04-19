// frontend/components/PwaBoot.tsx
// Tiny client boot component — registers the service worker and listens for
// the beforeinstallprompt event so we can surface an "Install app" button
// in the UI on supported browsers. No UI by itself; just side effects.
"use client";

import { useEffect } from "react";

type BIP = Event & {
  prompt?: () => Promise<void>;
  userChoice?: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function PwaBoot() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch((err) => console.warn("sw register failed", err));
    }
    // Stash the install prompt so InstallButton can surface it later.
    const onBip = (e: Event) => {
      e.preventDefault();
      const bip = e as BIP;
      (window as unknown as { __daesInstallPrompt?: BIP }).__daesInstallPrompt = bip;
      window.dispatchEvent(new CustomEvent("daes:installable"));
    };
    const onInstalled = () => {
      (window as unknown as { __daesInstallPrompt?: BIP }).__daesInstallPrompt = undefined;
      window.dispatchEvent(new CustomEvent("daes:installed"));
    };
    window.addEventListener("beforeinstallprompt", onBip);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBip);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);
  return null;
}
