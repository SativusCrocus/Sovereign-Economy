// frontend/components/GrafanaEmbed.tsx
"use client";
import { GRAFANA_URL } from "@/lib/config";

export function GrafanaEmbed({ dashboardUid = "daes-overview", height = 480 }: { dashboardUid?: string; height?: number }) {
  const src = `${GRAFANA_URL}/d/${dashboardUid}?orgId=1&kiosk=tv&theme=dark`;
  return (
    <section className="panel">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="label">Grafana: {dashboardUid}</h2>
        <a className="text-xs text-muted hover:text-accent" href={src} target="_blank" rel="noreferrer">open ↗</a>
      </div>
      <iframe
        src={src}
        title={`Grafana ${dashboardUid}`}
        className="w-full rounded-md border border-border"
        style={{ height }}
        // sandbox is intentionally omitted: Grafana needs its own scripts,
        // and Grafana is inside our trust boundary (same origin behind the
        // ingress). Do NOT re-enable 'strict' sandbox without testing.
      />
    </section>
  );
}
