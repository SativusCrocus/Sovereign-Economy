// frontend/app/docs/page.tsx — index of the /docs micro-site
import Link from "next/link";
import { listDocs } from "@/lib/docs";

export const metadata = { title: "Docs" };

export default function DocsIndex() {
  const docs = listDocs();
  return (
    <div className="space-y-10">
      <header className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="chip-n">reference</span>
          <span className="chip">{docs.length} docs</span>
        </div>
        <h1 className="heading">Docs</h1>
        <p className="subheading">
          System-level documentation for DAES — architecture, audit notes, deployment guides.
          All markdown is rendered server-side with syntax highlighting; Mermaid diagrams are
          hydrated client-side.
        </p>
      </header>

      {docs.length === 0 ? (
        <section className="panel-lg text-[13px] text-muted">
          No markdown files found in <code className="text-accent">/docs</code>. Add files there
          and they&apos;ll appear here on the next build.
        </section>
      ) : (
        <section className="grid gap-3 md:grid-cols-2">
          {docs.map(d => (
            <Link
              key={d.slug}
              href={`/docs/${d.slug}`}
              className="panel tile-hover group relative overflow-hidden"
            >
              <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full opacity-60 blur-3xl transition-all duration-500 ease-silk group-hover:opacity-80"
                   style={{ background: "radial-gradient(circle, rgba(14,165,233,0.35), transparent 70%)" }}
                   aria-hidden />
              <div className="relative space-y-2">
                <div className="flex items-center justify-between">
                  <span className="chip-n">doc</span>
                  <span className="text-accent transition-transform duration-300 ease-silk group-hover:translate-x-1">→</span>
                </div>
                <h3 className="text-base font-semibold tracking-tight text-text">{d.title}</h3>
                <p className="text-[11px] font-mono text-muted">{d.slug}.md · {(d.bytes / 1024).toFixed(1)} KB</p>
              </div>
            </Link>
          ))}
        </section>
      )}
    </div>
  );
}
