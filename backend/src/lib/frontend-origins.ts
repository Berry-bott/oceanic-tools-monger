const configuredOrigins = [
  process.env.FRONTEND_ORIGIN || "http://localhost:3000",
  ...(process.env.FRONTEND_ORIGINS ?? "").split(","),
]
  .map((value) => value.trim())
  .filter(Boolean);

function normalizeOrigin(value: string) {
  const parsed = new URL(value);
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error(`Invalid frontend origin configuration: ${value}`);
  }
  return parsed.origin;
}

const allowedOrigins = new Set(configuredOrigins.map(normalizeOrigin));

export function isAllowedFrontendOrigin(origin: string | undefined) {
  return origin === undefined || allowedOrigins.has(origin);
}
