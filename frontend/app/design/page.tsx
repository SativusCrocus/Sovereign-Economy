// frontend/app/design/page.tsx — public design-tokens showcase.
// A single page that documents every visual primitive the console uses:
// palette, typography, panels, chips, buttons, inputs, shadows, spacings,
// animations, and a live dark-mode preview. Doubles as smoke-test for the
// component layer.
import Link from "next/link";

const CORE_COLORS: { name: string; value: string; note: string }[] = [
  { name: "bg",       value: "#fafbfd", note: "root surface" },
  { name: "bg2",      value: "#f3f6fb", note: "inset surface" },
  { name: "panel",    value: "#ffffff", note: "glass base" },
  { name: "panel2",   value: "#f8fafc", note: "tile secondary" },
  { name: "border",   value: "#e4e9f0", note: "hairlines" },
  { name: "border2",  value: "#cbd5e1", note: "emphasised" },
  { name: "text",     value: "#0f172a", note: "primary ink" },
  { name: "muted",    value: "#64748b", note: "secondary ink" },
  { name: "subtle",   value: "#94a3b8", note: "placeholder ink" },
];

const ACCENTS: { name: string; value: string; role: string }[] = [
  { name: "accent",  value: "#0284c7", role: "links, primary CTAs" },
  { name: "accent2", value: "#0ea5e9", role: "gradient partner" },
  { name: "iris",    value: "#7c3aed", role: "archetypes, v-gradients" },
  { name: "magenta", value: "#db2777", role: "bridge, tertiary CTA" },
  { name: "amber",   value: "#d97706", role: "warnings" },
  { name: "good",    value: "#059669", role: "success, live" },
  { name: "warn",    value: "#d97706", role: "threshold, preview" },
  { name: "bad",     value: "#dc2626", role: "errors, reject" },
];

const ARCHETYPE_PALETTE: { name: string; value: string }[] = [
  { name: "arch1 · Speculator",  value: "#f43f5e" },
  { name: "arch2 · Arbitrageur", value: "#14b8a6" },
  { name: "arch3 · Sovereign",   value: "#8b5cf6" },
  { name: "arch4 · MarketMaker", value: "#f97316" },
  { name: "arch5 · BlackSwan",   value: "#475569" },
];

const SHADOWS = [
  { name: "glow",    cls: "shadow-glow",    note: "accent ring" },
  { name: "glow-v",  cls: "shadow-glow-v",  note: "iris ring" },
  { name: "card",    cls: "shadow-card",    note: "default elevation" },
  { name: "card-lg", cls: "shadow-card-lg", note: "panel-lg" },
  { name: "tilt",    cls: "shadow-tilt",    note: "3D hover" },
];

const RADII = ["rounded-md", "rounded-lg", "rounded-xl", "rounded-2xl", "rounded-full"];

export const metadata = { title: "Design" };

export default function DesignPage() {
  return (
    <div className="space-y-12">
      <header className="space-y-3">
        <div className="flex items-center gap-2">
          <Link href="/" className="link text-xs">← dashboard</Link>
          <span className="chip-n">reference</span>
        </div>
        <h1 className="heading">Design tokens</h1>
        <p className="subheading">
          Every visual primitive the console uses. This page is a reference — and a smoke-test
          for the component layer. Toggle the theme in the nav to see both palettes side-by-side.
        </p>
      </header>

      {/* ─── Palette ─── */}
      <section className="space-y-3">
        <h2 className="label">Surface & ink</h2>
        <div className="grid gap-2 md:grid-cols-3">
          {CORE_COLORS.map(c => (
            <div key={c.name} className="panel flex items-center gap-3">
              <span
                className={"h-10 w-10 shrink-0 rounded-lg border border-border"}
                style={{ background: c.value }}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[12px] text-text">{c.name}</span>
                  <code className="text-[11px] text-muted">{c.value}</code>
                </div>
                <p className="mt-0.5 text-[11px] text-muted">{c.note}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="label">Accent palette</h2>
        <div className="grid gap-2 md:grid-cols-4">
          {ACCENTS.map(c => (
            <div key={c.name} className="panel flex items-center gap-3">
              <span className="h-10 w-10 shrink-0 rounded-lg" style={{ background: c.value }} aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[12px] text-text">{c.name}</span>
                  <code className="text-[11px] text-muted">{c.value}</code>
                </div>
                <p className="mt-0.5 text-[11px] text-muted">{c.role}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="label">Archetype palette</h2>
        <div className="grid gap-2 md:grid-cols-5">
          {ARCHETYPE_PALETTE.map(c => (
            <div key={c.name} className="panel flex items-center gap-2">
              <span className="h-6 w-6 rounded-full" style={{ background: c.value }} aria-hidden />
              <span className="font-mono text-[11px] text-text">{c.name}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Typography ─── */}
      <section className="space-y-3">
        <h2 className="label">Typography</h2>
        <div className="panel-lg space-y-4">
          <div>
            <span className="label">display</span>
            <p className="display">The Sovereign Economy, gated.</p>
          </div>
          <div>
            <span className="label">heading</span>
            <p className="heading">A 2000-agent swarm.</p>
          </div>
          <div>
            <span className="label">subheading</span>
            <p className="subheading">Streaming cognition, gated action, timelocked settlement.</p>
          </div>
          <div>
            <span className="label">body</span>
            <p className="text-sm text-text">
              Inter at 14/16/18 · JetBrains Mono for numerics, hashes, and chips. Text uses{" "}
              <code className="rounded bg-accent/10 px-1.5 py-0.5 text-accent">cv11 · ss01 · liga · calt</code>.
            </p>
          </div>
        </div>
      </section>

      {/* ─── Components ─── */}
      <section className="space-y-3">
        <h2 className="label">Buttons</h2>
        <div className="panel-lg flex flex-wrap items-center gap-3">
          <button className="btn">.btn · secondary</button>
          <button className="btn-p sheen">.btn-p · primary</button>
          <button className="btn-iris sheen">.btn-iris · iris</button>
          <button className="btn" disabled>disabled</button>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="label">Inputs</h2>
        <div className="panel-lg grid gap-3 md:grid-cols-2">
          <label className="block">
            <span className="label">text input</span>
            <input className="input mt-1.5" defaultValue="0xabcd…" />
          </label>
          <label className="block">
            <span className="label">select</span>
            <select className="input mt-1.5">
              <option>BUY</option><option>SELL</option><option>HOLD</option>
            </select>
          </label>
          <label className="md:col-span-2 block">
            <span className="label">textarea</span>
            <textarea className="input mt-1.5 min-h-24 font-mono" defaultValue={`{"note":"hello"}`} />
          </label>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="label">Chips</h2>
        <div className="panel-lg flex flex-wrap items-center gap-2">
          <span className="chip">default</span>
          <span className="chip-n pulse-dot text-good">live</span>
          <span className="chip-ok">ok</span>
          <span className="chip-w">preview</span>
          <span className="chip-b">down</span>
          <span className="chip-i">iris</span>
          <span className="chip border-magenta/40 text-magenta bg-magenta/10">magenta</span>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="label">Panels</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="panel">
            <div className="label">panel</div>
            <p className="mt-1 text-[12px] text-muted">base glass surface · 16px radius</p>
          </div>
          <div className="panel-lg">
            <div className="label">panel-lg</div>
            <p className="mt-1 text-[12px] text-muted">elevated · 20px radius · bigger shadow</p>
          </div>
          <div className="panel-hero">
            <div className="label">panel-hero</div>
            <p className="mt-1 text-[12px] text-muted">hero glass · colored gradient overlay</p>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="label">Shadows</h2>
        <div className="panel-lg grid gap-3 md:grid-cols-5">
          {SHADOWS.map(s => (
            <div key={s.name} className={`flex h-24 flex-col items-center justify-center rounded-xl border border-border bg-white/80 ${s.cls}`}>
              <span className="font-mono text-[11px] text-text">{s.name}</span>
              <span className="mt-1 text-[10px] text-muted">{s.note}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="label">Radii</h2>
        <div className="panel-lg flex flex-wrap items-center gap-4">
          {RADII.map(r => (
            <div key={r} className={`h-16 w-16 border border-border bg-white/80 ${r}`} aria-label={r} title={r} />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="label">Animations</h2>
        <div className="panel-lg grid gap-3 md:grid-cols-4">
          <div className="flex h-20 items-center justify-center rounded-xl border border-border bg-white/80">
            <span className="pulse-dot text-good">pulse-dot</span>
          </div>
          <div className="flex h-20 items-center justify-center rounded-xl border border-border bg-white/80">
            <span className="text-shine font-mono text-[13px]">text-shine</span>
          </div>
          <div className="relative flex h-20 items-center justify-center overflow-hidden rounded-xl border border-border bg-accent/10">
            <span className="sheen text-[12px] font-mono text-accent">sheen · hovered CTA</span>
          </div>
          <div className="flex h-20 items-center justify-center rounded-xl border border-border bg-white/80">
            <span className="animate-breathe font-mono text-[12px] text-iris">breathe</span>
          </div>
        </div>
      </section>

      {/* ─── Notes ─── */}
      <section className="panel-lg space-y-2 text-[12px] text-muted">
        <p>
          All surface + ink tokens are driven by CSS variables defined in{" "}
          <code className="text-accent">app/globals.css</code>. The dark palette overrides them via{" "}
          <code className="text-accent">html.dark</code> — accent hues stay constant and pop against both surfaces.
        </p>
        <p>
          Components never hard-code hex values; they compose Tailwind utilities and the{" "}
          <code className="text-accent">.glass</code> / <code className="text-accent">.panel*</code> primitives.
          A full Storybook scaffold can replace this page later — for now, this is the public token reference.
        </p>
      </section>
    </div>
  );
}
