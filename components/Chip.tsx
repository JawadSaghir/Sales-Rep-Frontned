import { c } from "@/lib/ui";

export default function Chip({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "red" | "green" | "amber" }) {
  const map = {
    neutral: { fg: "#4b5563", bg: "#f9fafb", border: "#e9ebee" },
    red: { fg: c.redInk, bg: c.redSoft, border: c.redLine },
    green: { fg: c.greenInk, bg: c.greenSoft, border: c.greenSoft },
    amber: { fg: c.amberInk, bg: c.amberSoft, border: c.amberSoft },
  }[tone];
  return (
    <span style={{ padding: "4px 11px", borderRadius: 999, border: `1px solid ${map.border}`, background: map.bg, color: map.fg, fontSize: 12, fontWeight: 650 }}>
      {children}
    </span>
  );
}
