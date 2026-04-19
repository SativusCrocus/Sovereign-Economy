// frontend/components/GrafanaEmbed.tsx
"use client";
import { GRAFANA_URL } from "@/lib/config";

export function GrafanaEmbed({
  dashboardUid = "daes-overview",
  height = 480,
}: { dashboardUid?: string; height?: number }) {
  const src = `${GRAFANA_URL}/d/${dashboardUid}?orgId=1&kiosk=tv&theme=dark`;
  return (
    <section className="panel">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="label">Grafana · {dashboardUid}</h2>
          <span className="chip-n">live</span>
        </div>
        <a
          className="link text-xs"
          href={src}
          target="_blank"
          rel="noreferrer"
        >
          open in Grafana ↗
        </a>
      </div>
      <iframe
        src={src}
        title={`Grafana ${dashboardUid}`}
        className="w-full rounded-md border border-border bg-bg"
        style={{ height }}
        // sandbox is intentionally omitted: Grafana needs its own scripts,
        // and Grafana is inside our trust boundary (same origin behind the
        // ingress). Do NOT re-enable 'strict' sandbox without testing.
      />
    </section>
  );
}
