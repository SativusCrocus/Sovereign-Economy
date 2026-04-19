// frontend/components/Notifier.tsx
// Local notifier. Polls the /api/circuit and /api/governance/proposals feeds
// and — when the user has granted Notification permission — fires a desktop
// notification on meaningful state changes:
//   * circuit breaker trips (isPaused transitions false → true)
//   * a governance proposal enters Queued state (new timelock countdown)
//   * a proposal's timelock passes below 60 seconds (unlock imminent)
//
// This is an intentional fallback for environments without a real Web Push
// server. When real push is wired up, the same events will be emitted by the
// server into the SW's push handler — the rest of the UI stays unchanged.
"use client";

import { useEffect, useRef } from "react";

interface CircuitState { failuresInWindow: number; isPaused: boolean; demo?: boolean }
interface Proposal {
  id: number;
  title: string;
  state: "Pending" | "Active" | "Succeeded" | "Queued" | "Executed" | "Defeated" | "Canceled";
  timelockEta: number | null;
}

const LS_ENABLED = "daes.notify";
const LS_SEEN    = "daes.notify.seen";

function wantsNotifications(): boolean {
  try {
    const v = window.localStorage.getItem(LS_ENABLED);
    return v === "1";
  } catch { return false; }
}

function alreadyNotified(key: string): boolean {
  try {
    const raw = window.localStorage.getItem(LS_SEEN);
    if (!raw) return false;
    const set = JSON.parse(raw) as string[];
    return set.includes(key);
  } catch { return false; }
}
function markNotified(key: string) {
  try {
    const raw = window.localStorage.getItem(LS_SEEN);
    const set = raw ? (JSON.parse(raw) as string[]) : [];
    const next = [...set, key].slice(-40); // cap to last 40
    window.localStorage.setItem(LS_SEEN, JSON.stringify(next));
  } catch {}
}

async function fire(title: string, body: string, url: string, tag: string) {
  if (typeof window === "undefined") return;
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  // Prefer routing via the service worker so notificationclick also reuses
  // the existing window on click. Fall back to `new Notification(...)`.
  try {
    const reg = await navigator.serviceWorker?.ready;
    if (reg) {
      await reg.showNotification(title, {
        body, tag, icon: "/icon.svg", badge: "/icon.svg", data: { url },
      });
      return;
    }
  } catch {}
  try {
    new Notification(title, { body, tag, icon: "/icon.svg" });
  } catch {}
}

export function Notifier() {
  const prevPaused = useRef<boolean | null>(null);
  const prevStates = useRef<Map<number, Proposal["state"]>>(new Map());

  useEffect(() => {
    let cancelled = false;
    let tid: number | null = null;

    const tick = async () => {
      if (cancelled || !wantsNotifications()) return schedule();
      try {
        const [cbResp, govResp] = await Promise.all([
          fetch("/api/circuit", { cache: "no-store" }),
          fetch("/api/governance/proposals", { cache: "no-store" }),
        ]);
        if (cbResp.ok) {
          const cb = (await cbResp.json()) as CircuitState;
          if (prevPaused.current === null) prevPaused.current = cb.isPaused;
          if (cb.isPaused && !prevPaused.current) {
            const key = `cb:${Date.now() / 60_000 | 0}`;
            if (!alreadyNotified(key)) {
              fire(
                "DAES · circuit breaker tripped",
                `${cb.failuresInWindow} failures in the 600s window — system auto-paused.`,
                "/",
                "cb-trip",
              );
              markNotified(key);
            }
          }
          prevPaused.current = cb.isPaused;
        }
        if (govResp.ok) {
          const body = (await govResp.json()) as { proposals: Proposal[] };
          const now = Date.now();
          for (const p of body.proposals) {
            const prev = prevStates.current.get(p.id);
            if (prev === "Active" && p.state === "Queued") {
              const key = `prop-queued:${p.id}`;
              if (!alreadyNotified(key)) {
                fire(
                  `Proposal #${p.id} queued`,
                  `"${p.title}" — timelock has started.`,
                  "/",
                  `prop-${p.id}-queued`,
                );
                markNotified(key);
              }
            }
            if (p.state === "Queued" && p.timelockEta !== null) {
              const ms = p.timelockEta - now;
              if (ms > 0 && ms <= 60 * 60 * 1000) {
                const bucket = Math.floor(ms / (15 * 60 * 1000)); // hourly snapshots
                const key = `prop-eta:${p.id}:${bucket}`;
                if (!alreadyNotified(key)) {
                  const h = Math.floor(ms / 3_600_000);
                  const m = Math.floor((ms % 3_600_000) / 60_000);
                  fire(
                    `Proposal #${p.id} nearly ready`,
                    `"${p.title}" unlocks in ${h > 0 ? `${h}h ${m}m` : `${m}m`}.`,
                    "/",
                    `prop-${p.id}-eta`,
                  );
                  markNotified(key);
                }
              }
            }
            prevStates.current.set(p.id, p.state);
          }
        }
      } catch {
        // swallow — we'll try again on the next tick
      }
      schedule();
    };

    const schedule = () => {
      tid = window.setTimeout(tick, 20_000);
    };
    tick();
    return () => { cancelled = true; if (tid !== null) window.clearTimeout(tid); };
  }, []);

  return null;
}

export function isNotificationsEnabled(): boolean {
  if (typeof window === "undefined") return false;
  if (!("Notification" in window)) return false;
  if (Notification.permission !== "granted") return false;
  return wantsNotifications();
}

export async function requestNotifications(): Promise<"granted" | "denied" | "default" | "unsupported"> {
  if (typeof window === "undefined") return "unsupported";
  if (!("Notification" in window)) return "unsupported";
  if (Notification.permission === "granted") {
    try { window.localStorage.setItem(LS_ENABLED, "1"); } catch {}
    return "granted";
  }
  const res = await Notification.requestPermission();
  if (res === "granted") {
    try { window.localStorage.setItem(LS_ENABLED, "1"); } catch {}
  }
  return res;
}

export function disableNotifications() {
  try { window.localStorage.setItem("daes.notify", "0"); } catch {}
}
