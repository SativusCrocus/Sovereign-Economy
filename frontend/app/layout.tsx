// frontend/app/layout.tsx
import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Providers } from "./providers";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";

const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});
const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3001"),
  title: {
    default: "DAES · Sovereign Economy",
    template: "%s · DAES",
  },
  description:
    "DAES — a Decentralized Autonomous Economic System. 1000-agent GraphRAG swarm, MCP tool execution, 3-of-5 multi-sig bridge. Operator console.",
  applicationName: "DAES Console",
  keywords: [
    "DAES",
    "Sovereign Economy",
    "decentralized",
    "autonomous agents",
    "GraphRAG",
    "MCP",
    "multi-sig bridge",
    "Base",
    "Optimism",
    "ERC-4337",
  ],
  authors: [{ name: "DAES" }],
  openGraph: {
    title: "DAES · Sovereign Economy",
    description:
      "1000-agent swarm → MCP tool execution → 3-of-5 multi-sig bridge. A decentralized autonomous economic system.",
    type: "website",
    siteName: "DAES Console",
  },
  twitter: {
    card: "summary_large_image",
    title: "DAES · Sovereign Economy",
    description:
      "1000-agent swarm → MCP tool execution → 3-of-5 multi-sig bridge.",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#07080b",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${sans.variable} ${mono.variable}`}>
      <body className="relative min-h-screen bg-bg font-sans text-text antialiased selection:bg-accent/30 selection:text-text">
        {/* Ambient layers */}
        <div className="pointer-events-none fixed inset-x-0 top-0 -z-20 h-[90vh] aurora-2" aria-hidden />
        <div className="pointer-events-none fixed inset-0 -z-20 bg-grid opacity-[0.25]" aria-hidden />
        <div className="pointer-events-none fixed inset-0 -z-10 bg-noise mix-blend-overlay" aria-hidden />

        <Providers>
          <Nav />
          <main className="relative mx-auto w-full max-w-6xl px-4 py-8 md:py-12">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
