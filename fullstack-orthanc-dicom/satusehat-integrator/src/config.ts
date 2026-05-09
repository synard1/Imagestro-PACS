// Normalize path helpers
function ensureLeadingSlash(p?: string, defaultPath: string = "/") {
  const v = (p && p.trim().length > 0 ? p.trim() : defaultPath);
  return v.startsWith("/") ? v : `/${v}`;
}

export const config = {
  port: Number(process.env.PORT || 8081),
  // SATUSEHAT endpoints (prefer project .env variables)
  satusehatBase: process.env.SATUSEHAT_URL || process.env.SATUSEHAT_BASE || "https://api-satusehat-stg.dto.kemkes.go.id",
  fhirBasePath: ensureLeadingSlash(process.env.FHIR_BASE, "/fhir-r4/v1"),
  oauthPath: ensureLeadingSlash(process.env.OAUTH_PATH, "/oauth2/v1/accesstoken"),
  clientId: process.env.CLIENT_ID || "",
  clientSecret: process.env.CLIENT_SECRET || "",
  // Prefer ORG_ID from project .env, fallback to ORG_IHS if provided
  orgIhs: process.env.ORG_ID || process.env.ORG_IHS || "10000004",

  // Identifier system bases
  accessionSystemBase: process.env.ACSN_SYSTEM_BASE || "http://sys-ids.kemkes.go.id/acsn",
  imgAccessionSystem: process.env.IMG_ACSN_SYSTEM || process.env.IMG_ACSN_SYSTEM_BASE || "http://sys-ids.kemkes.go.id/img-accession-no",
  encounterSystemBase: process.env.ENCOUNTER_SYSTEM_BASE || "http://sys-ids.kemkes.go.id/encounter",

  // Orthanc (accept both ORTHANC_USERNAME/PASSWORD and ORTHANC_USER/PASS)
  orthancUrl: process.env.ORTHANC_URL || "http://orthanc:8042",
  orthancUsername: process.env.ORTHANC_USERNAME || process.env.ORTHANC_USER || "orthanc",
  orthancPassword: process.env.ORTHANC_PASSWORD || process.env.ORTHANC_PASS || "orthanc",
  // Database (optional; if not set, logging is skipped)
  databaseUrl: process.env.DATABASE_URL || "",
  pgHost: process.env.PGHOST || "",
  pgPort: Number(process.env.PGPORT || 5432),
  pgDatabase: process.env.PGDATABASE || "",
  pgUser: process.env.PGUSER || "",
  pgPassword: process.env.PGPASSWORD || "",
  // Logging
  logLevel: (process.env.LOG_LEVEL || "info").toLowerCase(),
};

export const urls = {
  oauthToken: () => `${config.satusehatBase}${config.oauthPath}`,
  fhir: (resource: string) => `${config.satusehatBase}${config.fhirBasePath}/${resource}`,
};
