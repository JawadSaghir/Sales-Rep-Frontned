import { c, card, label } from "@/lib/ui";

export default function StatCard({
  title,
  value,
  sub,
  delta,
  deltaTone = "neutral",
}: {
  title: string;
  value: string | number;
  sub?: string;
  delta?: string;
  deltaTone?: "up" | "down" | "neutral";
}) {
  const tone = deltaTone === "up" ? c.green : deltaTone === "down" ? c.red : c.muted;
  return (
    <div style={{ ...card, padding: "16px 18px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={label}>{title}</span>
        {delta && <span style={{ fontSize: 12, fontWeight: 700, color: tone }}>{delta}</span>}
      </div>
      <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-.02em", marginTop: 8 }}>{value}</div>
      {sub && <div style={{ fontSize: 12.5, color: c.muted }}>{sub}</div>}
    </div>
  );
}
