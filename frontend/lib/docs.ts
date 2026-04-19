// frontend/lib/docs.ts
// Reads the repo-level /docs/*.md files at build time, so /docs can render
// them with Mermaid + syntax highlighting. The docs directory is two levels
// up from this file (frontend/lib/docs.ts -> ../../docs).
import fs from "node:fs";
import path from "node:path";

export interface DocMeta {
  slug: string;
  title: string;
  path: string;     // absolute path on disk
  bytes: number;
  mtimeMs: number;
}

function repoRoot(): string {
  // This file lives in frontend/lib/, so ../ once lands in frontend/ and
  // ../../ lands at the repo root.
  return path.resolve(process.cwd(), "..");
}

function docsDir(): string {
  // Prefer the frontend-local copy (`frontend/docs/`) so production builds
  // that don't upload the repo root — like Vercel — still find the docs.
  // Fall back to the monorepo root for local development.
  const candidates = [
    path.join(process.cwd(), "docs"),
    path.join(repoRoot(), "docs"),
    path.join(process.cwd(), "..", "docs"),
  ];
  for (const c of candidates) {
    try {
      if (fs.statSync(c).isDirectory()) return c;
    } catch {}
  }
  return path.join(process.cwd(), "docs");
}

export function listDocs(): DocMeta[] {
  const dir = docsDir();
  let entries: string[];
  try { entries = fs.readdirSync(dir); }
  catch { return []; }
  const out: DocMeta[] = [];
  for (const e of entries) {
    if (!e.endsWith(".md")) continue;
    const p = path.join(dir, e);
    let st: fs.Stats;
    try { st = fs.statSync(p); } catch { continue; }
    if (!st.isFile()) continue;
    const slug = e.replace(/\.md$/i, "");
    out.push({
      slug,
      title: deriveTitle(p, slug),
      path: p,
      bytes: st.size,
      mtimeMs: st.mtimeMs,
    });
  }
  return out.sort((a, b) => a.title.localeCompare(b.title));
}

export function readDoc(slug: string): { meta: DocMeta; content: string } | null {
  const docs = listDocs();
  const meta = docs.find(d => d.slug === slug);
  if (!meta) return null;
  try {
    const content = fs.readFileSync(meta.path, "utf8");
    return { meta, content };
  } catch {
    return null;
  }
}

function deriveTitle(filePath: string, fallback: string): string {
  try {
    const head = fs.readFileSync(filePath, "utf8").split(/\r?\n/, 20);
    for (const line of head) {
      const m = /^#\s+(.+)$/.exec(line.trim());
      if (m) return m[1].trim();
    }
  } catch {}
  return fallback.replace(/-/g, " ");
}
