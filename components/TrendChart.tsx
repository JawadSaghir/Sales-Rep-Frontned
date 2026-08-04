import { c } from "@/lib/ui";

/**
 * Chronological score series, oldest first. Non-zero baseline so the slope is
 * readable.
 *
 * Bars flex instead of taking a fixed 30px each. `series` is every scored
 * session — that is what makes Rep.avg equal mean(series) — so an established
 * rep can have 30+ points, and at a fixed width they needed ~1570px inside a
 * card a few hundred px wide. maxWidth: 30 keeps a short series pixel-identical
 * to the original design; anything longer shrinks to fit.
 *
 * Past `DENSE_AT` points the per-bar value and S-number labels are dropped: at
 * ~4px per bar two-digit numbers overlap into noise. The endpoints are labelled
 * instead, so the axis still reads oldest -> newest.
 */
const DENSE_AT = 12;

export default function TrendChart({ series }: { series: number[] }) {
  if (!series.length) return null;
  const floor = Math.max(0, Math.min(...series) - 6);
  const span = Math.max(6, Math.max(...series) - floor);
  const dense = series.length > DENSE_AT;
  const gap = dense ? 3 : 14;

  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap, height: 96, borderBottom: `1px solid #f0f2f4`, minWidth: 0, overflow: "hidden" }}>
        {series.map((v, i) => {
          const latest = i === series.length - 1;
          return (
            <div key={i} style={{ flex: "1 1 0", minWidth: 0, maxWidth: 30, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: 96 }}>
              {!dense && (
                <span style={{ fontSize: 11, fontWeight: 700, color: latest ? c.redInk : c.muted, marginBottom: 5 }}>{v}</span>
              )}
              <div style={{ width: "100%", borderRadius: "4px 4px 0 0", height: Math.round(14 + ((v - floor) / span) * 56), background: latest ? c.red : "#c8ccd2" }} />
            </div>
          );
        })}
      </div>

      {dense ? (
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 7, fontSize: 10.5, color: c.faint }}>
          <span>S1</span>
          <span style={{ color: c.redInk, fontWeight: 700 }}>
            S{series.length} · {series[series.length - 1]}
          </span>
        </div>
      ) : (
        <div style={{ display: "flex", gap, marginTop: 7, minWidth: 0 }}>
          {series.map((_, i) => (
            <div key={i} style={{ flex: "1 1 0", minWidth: 0, maxWidth: 30, textAlign: "center", fontSize: 10.5, color: c.faint }}>
              S{i + 1}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
