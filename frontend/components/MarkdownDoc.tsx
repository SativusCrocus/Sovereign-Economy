// frontend/components/MarkdownDoc.tsx
// Server-rendered markdown with:
//   - GitHub-flavoured extensions (tables, task lists, autolinks)
//   - Syntax-highlighted code blocks via highlight.js
//   - Mermaid diagrams: ```mermaid blocks are rendered client-side (lazy-
//     loaded) by a small wrapper component, everything else is pure SSR.
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";

import "highlight.js/styles/github.css";

interface Props {
  content: string;
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export function MarkdownDoc({ content }: Props) {
  const components: Components = useMemo(() => ({
    // Intercept fenced code blocks to detect mermaid vs. regular code.
    code({ className, children, ...rest }) {
      const value = String(children ?? "").replace(/\n$/, "");
      const match = /language-(\w+)/.exec(className ?? "");
      const lang = match?.[1];

      // Inline code (no class) stays inline.
      if (!lang) {
        return (
          <code className="rounded bg-accent/10 px-1.5 py-0.5 text-[0.9em] text-accent" {...rest}>
            {children}
          </code>
        );
      }

      if (lang === "mermaid") {
        return <MermaidBlock source={value} />;
      }

      return (
        <code className={className} {...rest}>
          {children}
        </code>
      );
    },
    pre({ children }) {
      return (
        <pre className="my-4 overflow-x-auto rounded-xl border border-border bg-white/70 p-4 text-[12px] leading-relaxed">
          {children}
        </pre>
      );
    },
    h1({ children }) {
      return <h1 className="mt-8 mb-4 text-2xl font-bold tracking-tight text-text">{children}</h1>;
    },
    h2({ children }) {
      return <h2 className="mt-8 mb-3 text-xl font-semibold tracking-tight text-text">{children}</h2>;
    },
    h3({ children }) {
      return <h3 className="mt-6 mb-2 text-lg font-semibold tracking-tight text-text">{children}</h3>;
    },
    p({ children }) {
      return <p className="my-3 text-[14px] leading-relaxed text-text">{children}</p>;
    },
    a({ children, href }) {
      const external = href?.startsWith("http");
      return (
        <a
          href={href}
          target={external ? "_blank" : undefined}
          rel={external ? "noreferrer" : undefined}
          className="link"
        >
          {children}
        </a>
      );
    },
    ul({ children }) { return <ul className="my-3 list-disc pl-5 space-y-1 text-[14px] text-text">{children}</ul>; },
    ol({ children }) { return <ol className="my-3 list-decimal pl-5 space-y-1 text-[14px] text-text">{children}</ol>; },
    li({ children }) { return <li className="marker:text-accent">{children}</li>; },
    blockquote({ children }) {
      return (
        <blockquote className="my-4 rounded-r-lg border-l-4 border-accent/60 bg-accent/5 px-4 py-2 text-[13px] text-text">
          {children}
        </blockquote>
      );
    },
    table({ children }) {
      return (
        <div className="my-4 overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left text-[12px]">
            {children}
          </table>
        </div>
      );
    },
    th({ children }) { return <th className="border-b border-border bg-bg2 px-3 py-2 font-mono text-muted">{children}</th>; },
    td({ children }) { return <td className="border-b border-border/60 px-3 py-2 text-text">{children}</td>; },
    hr() { return <hr className="my-6 border-border" />; },
    img({ alt, src }) {
      return <img alt={alt ?? ""} src={typeof src === "string" ? src : undefined} className="my-3 rounded-lg border border-border" />;
    },
  }), []);

  return (
    <article className="panel-lg">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </article>
  );
}

/* ─── Mermaid (lazy) ─────────────────────────────────────────────────── */

function MermaidBlock({ source }: { source: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useRef(`mmd-${uid()}`);
  const [svg, setSvg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // dynamic import keeps Mermaid out of the initial bundle
        const mod = await import("mermaid");
        const mermaid = mod.default;
        const dark = document.documentElement.classList.contains("dark");
        mermaid.initialize({
          startOnLoad: false,
          theme: dark ? "dark" : "neutral",
          securityLevel: "loose",
          fontFamily: "inherit",
        });
        const { svg } = await mermaid.render(id.current, source);
        if (!cancelled) setSvg(svg);
      } catch (e) {
        if (!cancelled) setErr((e as Error).message);
      }
    })();
    return () => { cancelled = true; };
  }, [source]);

  if (err) {
    return (
      <div className="my-4 rounded-lg border border-bad/40 bg-bad/5 p-3 text-[11px] text-bad">
        mermaid: {err}
        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-[11px] text-muted">{source}</pre>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className="my-4 overflow-x-auto rounded-xl border border-border bg-white/70 p-4"
      // Mermaid returns trusted SVG from our own markdown input.
      dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
    >
      {!svg && <span className="text-[11px] text-muted">rendering diagram…</span>}
    </div>
  );
}
