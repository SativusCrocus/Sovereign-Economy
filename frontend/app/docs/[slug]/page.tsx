// frontend/app/docs/[slug]/page.tsx — render a single markdown doc.
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { listDocs, readDoc } from "@/lib/docs";
import { MarkdownDoc } from "@/components/MarkdownDoc";

export function generateStaticParams() {
  return listDocs().map(d => ({ slug: d.slug }));
}

export async function generateMetadata({
  params,
}: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const doc = readDoc(slug);
  return { title: doc?.meta.title ?? "Docs" };
}

export default async function DocPage({
  params,
}: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = readDoc(slug);
  if (!doc) notFound();
  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <Link href="/docs" className="link text-xs">← all docs</Link>
        <div className="flex items-center gap-2">
          <span className="chip-n">doc</span>
          <span className="chip">{(doc.meta.bytes / 1024).toFixed(1)} KB</span>
          <span className="chip">updated {new Date(doc.meta.mtimeMs).toLocaleDateString()}</span>
        </div>
        <h1 className="heading">{doc.meta.title}</h1>
      </header>
      <MarkdownDoc content={doc.content} />
    </div>
  );
}
