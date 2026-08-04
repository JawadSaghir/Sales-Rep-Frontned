export const c = {
  page: "#f6f7f8",
  ink: "#14161a",
  body: "#4b5563",
  muted: "#8a9099",
  faint: "#a4aab2",
  line: "#eceef1",
  hairline: "#f1f3f5",
  border: "#dfe2e6",
  red: "#d9382a",
  redInk: "#c8372a",
  redSoft: "#fef6f4",
  redLine: "#f0cfc9",
  green: "#17a34a",
  greenInk: "#0f7a3d",
  greenSoft: "#e8f6ed",
  amberInk: "#8a6410",
  amberSoft: "#fdf4e3",
  redChipSoft: "#fdecea",
  teal: "#0d9488",
  tealSoft: "#e6f6f3",
} as const;

export const card: React.CSSProperties = {
  background: "#fff",
  border: `1px solid ${c.line}`,
  borderRadius: 13,
};

export const label: React.CSSProperties = {
  fontSize: 11.5,
  fontWeight: 700,
  letterSpacing: ".1em",
  textTransform: "uppercase",
  color: c.muted,
};

export function statusColors(status: string) {
  if (status === "Needs coaching") return { fg: c.redInk, bg: c.redChipSoft };
  if (status === "On track") return { fg: c.greenInk, bg: c.greenSoft };
  return { fg: c.amberInk, bg: c.amberSoft };
}

export function activityLabel(idleDays: number) {
  if (idleDays === 0) return "active today";
  if (idleDays === 1) return "active yesterday";
  return `inactive ${idleDays} days`;
}

export function deltaLabel(delta: number) {
  if (delta === 0) return "no change";
  return `${delta > 0 ? "+" : "−"}${Math.abs(delta)} pts`;
}

export function deltaColor(delta: number) {
  return delta > 0 ? c.green : delta < 0 ? c.red : c.faint;
}
