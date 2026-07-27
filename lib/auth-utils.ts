const DEFAULT_ALLOWED_DOMAINS = [
  "insidesuccesstv.com",
  "insidesuccess.com",
  "mawercapital.com",
  "nextlevelceotv.com",
];

export function normalizeAuthEmail(email: string | null | undefined) {
  const normalized = email?.trim().toLowerCase();
  return normalized || null;
}

export function getAuthEmailDomain(email: string | null | undefined) {
  const normalized = normalizeAuthEmail(email);
  if (!normalized || !normalized.includes("@")) return null;
  return normalized.split("@").pop() || null;
}

export function getAllowedAuthDomains() {
  const configured = process.env.AUTH_ALLOWED_DOMAINS?.split(",")
    .map((domain) => domain.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);

  return configured?.length ? configured : DEFAULT_ALLOWED_DOMAINS;
}

export function isAllowedAuthEmail(email: string | null | undefined) {
  const domain = getAuthEmailDomain(email);
  return Boolean(domain && getAllowedAuthDomains().includes(domain));
}
