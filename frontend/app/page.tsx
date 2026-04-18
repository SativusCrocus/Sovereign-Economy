// frontend/app/page.tsx — dashboard
import { HealthCard } from "@/components/HealthCard";
import { GrafanaEmbed } from "@/components/GrafanaEmbed";

export default function Page() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">System overview</h1>
      <HealthCard />
      <GrafanaEmbed />
      <section className="panel">
        <h2 className="label mb-2">Quick links</h2>
        <ul className="text-sm leading-relaxed">
          <li><span className="text-muted">Bridge FSM →</span> <a className="text-accent hover:underline" href="/bridge">/bridge</a></li>
          <li><span className="text-muted">Agent accounts (EIP-4337) →</span> <a className="text-accent hover:underline" href="/accounts">/accounts</a></li>
          <li><span className="text-muted">Audit-log browser (IPFS) →</span> <a className="text-accent hover:underline" href="/audit">/audit</a></li>
        </ul>
      </section>
    </div>
  );
}
