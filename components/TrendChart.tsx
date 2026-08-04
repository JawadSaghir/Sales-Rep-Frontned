import { c } from "@/lib/ui";

/** Chronological score series, oldest first. Non-zero baseline so the slope is readable. */
export default function TrendChart({ series }: { series: number[] }) {
  if (!series.length) return null;
  const floor = Math.max(0, Math.min(...series) - 6);
  const span = Math.max(6, Math.max(...series) - floor);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 14, height: 96, borderBottom: `1px solid #f0f2f4` }}>
        {series.map((v, i) => {
          const latest = i === series.length - 1;
          return (
            <div key={i} style={{ width: 30, flex: "none", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: 96 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: latest ? c.redInk : c.muted, marginBottom: 5 }}>{v}</span>
              <div style={{ width: "100%", borderRadius: "4px 4px 0 0", height: Math.round(14 + ((v - floor) / span) * 56), background: latest ? c.red : "#c8ccd2" }} />
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 14, marginTop: 7 }}>
        {series.map((_, i) => (
          <div key={i} style={{ width: 30, flex: "none", textAlign: "center", fontSize: 10.5, color: c.faint }}>
            S{i + 1}
          </div>
        ))}
      </div>
    </div>
  );
}
