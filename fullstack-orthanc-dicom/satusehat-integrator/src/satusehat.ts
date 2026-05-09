import { config, urls } from "./config";
import { logSatusehatHttp, saveToken, getLatestValidTokenFromDb, upsertSetting } from "./db";

// Enhanced token cache with metadata
interface TokenCache {
  token: string | null;
  exp: number;
  refreshThreshold: number;
  lastRefresh: number;
  retryCount: number;
  isRefreshing: boolean;
}

// Configuration for retry and timeout behavior
const TOKEN_CONFIG = {
  maxRetries: 3,
  retryDelayMs: 1000,
  timeoutMs: 30000,
  refreshBufferSeconds: 300, // Refresh token 5 minutes before expiry
  maxRefreshInterval: 3600, // Maximum 1 hour between refreshes
} as const;

let tokenCache: TokenCache = {
  token: null,
  exp: 0,
  refreshThreshold: 0,
  lastRefresh: 0,
  retryCount: 0,
  isRefreshing: false,
};

// Enhanced error types for better error handling
class SatusehatError extends Error {
  constructor(
    message: string,
    public status?: number,
    public code?: string,
    public retryable: boolean = false
  ) {
    super(message);
    this.name = 'SatusehatError';
  }
}

class TokenRefreshError extends SatusehatError {
  constructor(message: string, status?: number) {
    super(message, status, 'TOKEN_REFRESH_ERROR', true);
    this.name = 'TokenRefreshError';
  }
}

// Utility function for exponential backoff
function calculateBackoffDelay(attempt: number, baseDelay: number = TOKEN_CONFIG.retryDelayMs): number {
  return Math.min(baseDelay * Math.pow(2, attempt), 10000); // Max 10 seconds
}

// Utility function for timeout handling
function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Request timeout')), timeoutMs)
    ),
  ]);
}

// Enhanced token fetching with retry logic and comprehensive error handling
async function fetchToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  
  // Check if token is still valid (with buffer time)
  if (tokenCache.token && now < tokenCache.refreshThreshold) {
    return tokenCache.token;
  }

  // Prevent concurrent token refreshes
  if (tokenCache.isRefreshing) {
    // Wait for ongoing refresh with timeout
    const maxWaitTime = 10000; // 10 seconds
    const startWait = Date.now();
    while (tokenCache.isRefreshing && (Date.now() - startWait) < maxWaitTime) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    if (tokenCache.token && now < tokenCache.refreshThreshold) {
      return tokenCache.token;
    }
  }

  tokenCache.isRefreshing = true;

  try {
    // Validate configuration
    if (!config.clientId || !config.clientSecret) {
      throw new SatusehatError(
        "CLIENT_ID/CLIENT_SECRET belum di-set.",
        500,
        'MISSING_CREDENTIALS',
        false
      );
    }

    // 1) Coba gunakan token terbaru dari DB sebagai persistent cache
    try {
      const dbToken = await getLatestValidTokenFromDb(config.clientId);
      if (dbToken && dbToken.accessToken) {
        const issuedAt = dbToken.issuedAt || Math.floor(Date.now() / 1000);
        const expiresIn = dbToken.expiresIn || 0;
        const nowSec = Math.floor(Date.now() / 1000);

        // Pastikan masih valid dengan sedikit buffer
        const exp = issuedAt + expiresIn;
        if (expiresIn > 0 && nowSec < exp - 60) {
          const buffer = Math.min(TOKEN_CONFIG.refreshBufferSeconds, expiresIn / 2);
          tokenCache.token = dbToken.accessToken;
          tokenCache.exp = exp;
          tokenCache.refreshThreshold = exp - buffer;
          tokenCache.lastRefresh = nowSec;
          console.log("[satusehat] Loaded valid token from DB cache");
          return tokenCache.token;
        }
      }
    } catch (e) {
      console.warn("[satusehat] Gagal membaca token dari DB cache:", e);
    }

    // 2) Jika tidak ada yang valid di DB, fetch token baru dari SatuSehat (dengan retry)
    const token = await fetchTokenWithRetry();

    // Reset retry count on success
    tokenCache.retryCount = 0;
    tokenCache.lastRefresh = now;

    return token;
  } finally {
    tokenCache.isRefreshing = false;
  }
}

async function fetchTokenWithRetry(): Promise<string> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= TOKEN_CONFIG.maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const delay = calculateBackoffDelay(attempt - 1);
        console.log(`[satusehat] Retrying token fetch (attempt ${attempt + 1}/${TOKEN_CONFIG.maxRetries + 1}) after ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      const token = await performTokenFetch();
      console.log(`[satusehat] Token fetched successfully on attempt ${attempt + 1}`);
      return token;
    } catch (error) {
      lastError = error as Error;
      console.warn(`[satusehat] Token fetch attempt ${attempt + 1} failed:`, error);
      
      // Don't retry on certain errors
      if (error instanceof SatusehatError && !error.retryable) {
        break;
      }
      
      // Don't retry on 4xx errors (except 429)
      if (error instanceof SatusehatError && error.status) {
        if (error.status >= 400 && error.status < 500 && error.status !== 429) {
          break;
        }
      }
    }
  }

  throw new TokenRefreshError(
    `Failed to fetch token after ${TOKEN_CONFIG.maxRetries + 1} attempts: ${lastError?.message}`,
    lastError instanceof SatusehatError ? lastError.status : 500
  );
}

async function performTokenFetch(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const u = new URL(urls.oauthToken());
  u.searchParams.set("grant_type", "client_credentials");
  
  const reqBody = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: config.clientId!,
    client_secret: config.clientSecret!,
  }).toString();

  const start = Date.now();
  
  try {
    const resp = await withTimeout(
      fetch(u.toString(), {
        method: "POST",
        headers: { 
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "satusehat-integrator/1.0.0"
        },
        body: reqBody,
      }),
      TOKEN_CONFIG.timeoutMs
    );

    const txt = await resp.clone().text().catch(() => "");
    
    // Log the request (with masked credentials)
    await logSatusehatHttp({
      method: "POST",
      url: u.toString(),
      requestHeaders: { "Content-Type": "application/x-www-form-urlencoded" },
      requestBody: reqBody.replace(/client_secret=[^&]+/, "client_secret=***"),
      responseStatus: resp.status,
      responseHeaders: { "Content-Type": resp.headers.get("Content-Type") || "" },
      responseBody: txt.length > 1000 ? txt.substring(0, 1000) + "..." : txt,
      durationMs: Date.now() - start,
    });

    if (!resp.ok) {
      const errorCode = resp.status === 401 ? 'INVALID_CREDENTIALS' : 
                       resp.status === 429 ? 'RATE_LIMITED' : 
                       resp.status >= 500 ? 'SERVER_ERROR' : 'REQUEST_ERROR';
      
      throw new SatusehatError(
        `OAuth error ${resp.status}: ${txt || '<empty body>'}`,
        resp.status,
        errorCode,
        resp.status >= 500 || resp.status === 429 // Retry on server errors and rate limits
      );
    }

    let responseData;
    try {
      responseData = JSON.parse(txt);
    } catch (parseError) {
      throw new SatusehatError(
        `Invalid JSON response: ${txt}`,
        500,
        'INVALID_RESPONSE',
        false
      );
    }

    if (!responseData.access_token) {
      throw new SatusehatError(
        "No access_token in response",
        500,
        'MISSING_TOKEN',
        false
      );
    }

    // Calculate expiration with buffer
    const expiresIn = parseInt(responseData.expires_in ?? "3599") || 3599;
    const bufferSeconds = Math.min(TOKEN_CONFIG.refreshBufferSeconds, expiresIn / 2);
    
    tokenCache.token = responseData.access_token;
    tokenCache.exp = now + expiresIn;
    tokenCache.refreshThreshold = now + expiresIn - bufferSeconds;

    // Save token to database (histori / audit)
    try {
      await saveToken({
        clientId: config.clientId!,
        organizationName: responseData.organization_name,
        developerEmail: responseData["developer.email"],
        tokenType: responseData.token_type,
        accessToken: responseData.access_token,
        refreshToken: responseData.refresh_token,
        expiresIn: parseInt(responseData.expires_in ?? "0"),
        issuedAt: parseInt(responseData.issued_at ?? "0"),
        scope: responseData.scope,
        status: responseData.status,
        rawResponse: responseData,
        requestData: {
          grant_type: "client_credentials",
          client_id: config.clientId!,
        }
      });
    } catch (e) {
      console.warn("[satusehat] Gagal menyimpan token ke satusehat_tokens:", e);
    }

    // Upsert token terbaru ke tabel settings agar bisa digunakan oleh service/UI lain
    try {
      const issuedAt = parseInt(responseData.issued_at ?? `${now}`);
      const latestTokenSetting = {
        access_token: responseData.access_token,
        token_type: responseData.token_type,
        scope: responseData.scope,
        expires_in: expiresIn,
        issued_at: issuedAt,
        // metadata tambahan (tidak menyimpan clientSecret)
        source: "satusehat-integrator",
        env: config.satusehatBase,
        organizationId: config.orgIhs
      };
      await upsertSetting("satusehat_latest_token", latestTokenSetting);
    } catch (e) {
      console.warn("[satusehat] Gagal menyimpan token ke settings:", e);
    }

    console.log(
      `[satusehat] Token cached, expires in ${expiresIn}s, will refresh in ${expiresIn - bufferSeconds}s`
    );

    // Fix the return type issue
    return tokenCache.token ?? ""; // Ensure we always return a string
  } catch (error) {
    if (error instanceof SatusehatError) {
      throw error;
    }
    
    // Handle network and other errors
    throw new SatusehatError(
      `Network error during token fetch: ${error instanceof Error ? error.message : String(error)}`,
      0,
      'NETWORK_ERROR',
      true
    );
  }
}

// Enhanced HTTP request functions with retry logic
async function makeAuthenticatedRequest(
  url: string,
  options: RequestInit = {},
  retryCount: number = 0
): Promise<Response> {
  try {
    const token = await fetchToken();
    
    const response = await withTimeout(
      fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          Authorization: `Bearer ${token}`,
          "User-Agent": "satusehat-integrator/1.0.0",
        },
      }),
      TOKEN_CONFIG.timeoutMs
    );

    // Handle token expiration
    if (response.status === 401 && retryCount < 2) {
      console.log(`[satusehat] Received 401, invalidating token and retrying`);
      // Invalidate current token
      tokenCache.token = null;
      tokenCache.exp = 0;
      tokenCache.refreshThreshold = 0;
      
      // Retry with fresh token
      return makeAuthenticatedRequest(url, options, retryCount + 1);
    }

    return response;
  } catch (error) {
    if (retryCount < TOKEN_CONFIG.maxRetries && error instanceof SatusehatError && error.retryable) {
      const delay = calculateBackoffDelay(retryCount);
      console.log(`[satusehat] Request failed, retrying in ${delay}ms (attempt ${retryCount + 1}/${TOKEN_CONFIG.maxRetries + 1})`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return makeAuthenticatedRequest(url, options, retryCount + 1);
    }
    throw error;
  }
}

async function fhirGet(path: string, params?: Record<string, string>) {
  const u = new URL(path);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) {
        u.searchParams.set(k, v);
      }
    }
  }
  
  const start = Date.now();
  
  try {
    const resp = await makeAuthenticatedRequest(u.toString(), { method: "GET" });
    const txt = await resp.clone().text().catch(() => "");
    
    await logSatusehatHttp({
      method: "GET",
      url: u.toString(),
      requestHeaders: { Authorization: "Bearer ***" },
      responseStatus: resp.status,
      responseHeaders: { "Content-Type": resp.headers.get("Content-Type") || "" },
      responseBody: txt.length > 2000 ? txt.substring(0, 2000) + "..." : txt,
      durationMs: Date.now() - start,
    });
    
    return resp;
  } catch (error) {
    await logSatusehatHttp({
      method: "GET",
      url: u.toString(),
      requestHeaders: { Authorization: "Bearer ***" },
      responseStatus: 0,
      responseHeaders: {},
      responseBody: `Error: ${error instanceof Error ? error.message : String(error)}`,
      durationMs: Date.now() - start,
    });
    throw error;
  }
}

async function fhirPost(path: string, body: any) {
  const start = Date.now();
  const requestBody = JSON.stringify(body);
  
  try {
    const resp = await makeAuthenticatedRequest(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/fhir+json",
      },
      body: requestBody,
    });
    
    const txt = await resp.clone().text().catch(() => "");
    
    await logSatusehatHttp({
      method: "POST",
      url: path,
      requestHeaders: { Authorization: "Bearer ***", "Content-Type": "application/fhir+json" },
      requestBody: requestBody.length > 1000 ? requestBody.substring(0, 1000) + "..." : requestBody,
      responseStatus: resp.status,
      responseHeaders: { "Content-Type": resp.headers.get("Content-Type") || "" },
      responseBody: txt.length > 2000 ? txt.substring(0, 2000) + "..." : txt,
      durationMs: Date.now() - start,
    });
    
    return resp;
  } catch (error) {
    await logSatusehatHttp({
      method: "POST",
      url: path,
      requestHeaders: { Authorization: "Bearer ***", "Content-Type": "application/fhir+json" },
      requestBody: requestBody.length > 1000 ? requestBody.substring(0, 1000) + "..." : requestBody,
      responseStatus: 0,
      responseHeaders: {},
      responseBody: `Error: ${error instanceof Error ? error.message : String(error)}`,
      durationMs: Date.now() - start,
    });
    throw error;
  }
}

// Health check function for token validity
async function checkTokenHealth(): Promise<{ valid: boolean; expiresIn?: number; error?: string }> {
  try {
    const now = Math.floor(Date.now() / 1000);
    
    if (!tokenCache.token) {
      return { valid: false, error: "No token cached" };
    }
    
    if (now >= tokenCache.exp) {
      return { valid: false, error: "Token expired" };
    }
    
    const expiresIn = tokenCache.exp - now;
    return { valid: true, expiresIn };
  } catch (error) {
    return { valid: false, error: error instanceof Error ? error.message : String(error) };
  }
}

// Force token refresh
async function refreshToken(): Promise<string> {
  tokenCache.token = null;
  tokenCache.exp = 0;
  tokenCache.refreshThreshold = 0;
  return fetchToken();
}

export const Satusehat = {
  // Enhanced token method with health check
  token: fetchToken,
  
  // Health check method
  tokenHealth: checkTokenHealth,
  
  // Force token refresh
  refreshToken: refreshToken,

  // ServiceRequest search by subject + img-accession-no
  searchServiceRequestByAccession: async (subjectId: string, accessionNumber: string) => {
    const base = urls.fhir("ServiceRequest");
    const idParam = `${config.imgAccessionSystem}/${subjectId}|${accessionNumber}`;
    const resp = await fhirGet(base, { subject: subjectId, identifier: idParam });
    return resp;
  },

  // ServiceRequest generic search passthrough via query params
  searchServiceRequest: async (params?: Record<string, string | undefined>) => {
    const base = urls.fhir("ServiceRequest");
    const sanitized: Record<string, string> = {};
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && String(v).length > 0) {
          sanitized[k] = String(v);
        }
      }
    }
    return fhirGet(base, sanitized);
  },

  // ServiceRequest detail by id
  getServiceRequestById: async (id: string) => {
    const base = urls.fhir("ServiceRequest");
    return fhirGet(`${base}/${id}`);
  },

  // Create ServiceRequest for external radiology referral
  createServiceRequest: async (serviceRequestData: {
    patientId: string;
    encounterId: string;
    practitionerId: string;
    locationId: string;
    code: string;
    codeDisplay: string;
    category?: string;
    priority?: string;
    intent?: string;
    status?: string;
    authoredOn?: string;
    reasonCode?: string;
    reasonDisplay?: string;
    note?: string;
    performerId?: string;
  }) => {
    console.log("[satusehat] Creating service request with data:", JSON.stringify(serviceRequestData, null, 2));
    
    // Ensure all required fields are present and properly formatted
    if (!serviceRequestData.patientId || !serviceRequestData.encounterId || 
        !serviceRequestData.practitionerId || !serviceRequestData.locationId || 
        !serviceRequestData.code || !serviceRequestData.codeDisplay) {
      throw new Error("Missing required fields for service request");
    }
    
    const {
      patientId,
      encounterId,
      practitionerId,
      locationId,
      code,
      codeDisplay,
      category = "108252007",
      priority = "routine",
      intent = "original-order",
      status = "active",
      authoredOn,
      reasonCode,
      reasonDisplay,
      note,
      performerId
    } = serviceRequestData;

    // Generate proper authoredOn date - ensure it's not in the future and not before June 3, 2014
    let validAuthoredOn: string;
    if (authoredOn) {
      const providedDate = new Date(authoredOn);
      const now = new Date();
      const minDate = new Date('2014-06-03T00:00:00Z');
      
      // If provided date is in the future or before min date, use current date
      if (providedDate > now || providedDate < minDate) {
        validAuthoredOn = now.toISOString();
      } else {
        validAuthoredOn = providedDate.toISOString();
      }
    } else {
      validAuthoredOn = new Date().toISOString();
    }

    const body: any = {
      resourceType: "ServiceRequest",
      identifier: [
        {
          system: "http://sys-ids.kemkes.go.id/servicerequest/" + config.orgIhs,
          value: `SR-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        }
      ],
      status: status,
      intent: intent,
      priority: priority,
      category: [
        {
          coding: [
            {
              system: "http://snomed.info/sct",
              code: category,
              display: "Laboratory procedure"
            }
          ]
        }
      ],
      code: {
        coding: [
          {
            system: "http://loinc.org",
            code: code,
            display: codeDisplay
          }
        ]
      },
      subject: {
        reference: `Patient/${patientId}`
      },
      encounter: {
        reference: `Encounter/${encounterId}`
      },
      authoredOn: validAuthoredOn,
      requester: {
        reference: `Practitioner/${practitionerId}`
      },
      // Add mandatory performer field - use performerId if provided, otherwise use practitionerId
      performer: [
        {
          reference: `Practitioner/${performerId || practitionerId}`
        }
      ],
      locationReference: [
        {
          reference: `Location/${locationId}`
        }
      ]
    };

    // Add reason code if provided
    if (reasonCode && reasonDisplay) {
      body.reasonCode = [
        {
          coding: [
            {
              system: "http://hl7.org/fhir/sid/icd-10",
              code: reasonCode,
              display: reasonDisplay
            }
          ]
        }
      ];
    }

    // Add note if provided
    if (note) {
      body.note = [
        {
          text: note
        }
      ];
    }

    const base = urls.fhir("ServiceRequest");
    const resp = await fhirPost(base, body);
    return resp;
  },

  // Minimal ImagingStudy creation (basedOn -> ServiceRequest)
  createImagingStudy: async (patientId: string, basedOnServiceRequestId: string, accessionNumber?: string) => {
    const body = {
      resourceType: "ImagingStudy",
      subject: { reference: `Patient/${patientId}` },
      basedOn: [{ reference: `ServiceRequest/${basedOnServiceRequestId}` }],
      identifier: accessionNumber
        ? [{ system: `${config.accessionSystemBase}/${config.orgIhs}`, value: accessionNumber }]
        : undefined,
      status: "available",
    };
    const base = urls.fhir("ImagingStudy");
    const resp = await fhirPost(base, body);
    return resp;
  },

  // Submit raw ImagingStudy resource
  postImagingStudyRaw: async (resource: any) => {
    const base = urls.fhir("ImagingStudy");
    return fhirPost(base, resource);
  },
  // ImagingStudy search helpers
  searchImagingStudyByIdentifier: async (identifier: string) => {
    const base = urls.fhir("ImagingStudy");
    return fhirGet(base, { identifier });
  },
  searchImagingStudy: async (params?: Record<string, string | undefined>) => {
    const base = urls.fhir("ImagingStudy");
    const sanitized: Record<string, string> = {};
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && String(v).length > 0) {
          sanitized[k] = String(v);
        }
      }
    }
    return fhirGet(base, sanitized);
  },
  getImagingStudyById: async (id: string) => {
    const base = urls.fhir("ImagingStudy");
    return fhirGet(`${base}/${id}`);
  },

  // DICOM upload placeholder - needs SATUSEHAT DICOM Store endpoint
  uploadDicomToSatusehat: async (_dicomBytes: Uint8Array) => {
    return new Response(JSON.stringify({
      status: "not-implemented",
      message: "Konfigurasi endpoint DICOM Store SATUSEHAT belum di-set",
    }), { status: 501, headers: { "Content-Type": "application/json" } });
  },

  // Minimal Encounter creation for sandbox/testing
  createEncounterMinimal: async (patientId: string, opts?: { classCode?: string; status?: string; locationRef?: string; serviceType?: string }) => {
    const body: any = {
      resourceType: "Encounter",
      status: opts?.status || "in-progress",
      class: {
        system: "http://terminology.hl7.org/CodeSystem/v3-ActCode",
        code: opts?.classCode || "AMB",
      },
      subject: { reference: `Patient/${patientId}` },
      period: { start: new Date().toISOString() },
    };
    if (opts?.locationRef) {
      body.location = [{ location: { reference: opts.locationRef } }];
    }
    if (opts?.serviceType) {
      body.serviceType = [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/service-type", code: opts.serviceType }] }];
    }
    const base = urls.fhir("Encounter");
    const resp = await fhirPost(base, body);
    return resp;
  },

  // Encounter creation following Postman-style example (identifier + serviceProvider)
  createEncounterAdvanced: async (
    patientId: string,
    opts?: { status?: string; classCode?: string; registrationNumber?: string; locationRef?: string; locationDisplay?: string; serviceType?: string; serviceProviderOrgId?: string; periodStartIso?: string; subjectDisplay?: string; practitionerRef?: string; practitionerDisplay?: string }
  ) => {
    const body: any = {
      resourceType: "Encounter",
      status: opts?.status || "planned",
      statusHistory: opts?.periodStartIso
        ? [
            {
              status: "in-progress",
              period: { start: opts.periodStartIso },
            },
          ]
        : undefined,
      class: {
        system: "http://terminology.hl7.org/CodeSystem/v3-ActCode",
        code: opts?.classCode || "AMB",
        display: "Ambulatory",
      },
      subject: { reference: `Patient/${patientId}` },
      period: opts?.periodStartIso ? { start: opts.periodStartIso } : undefined,
      serviceProvider: { reference: `Organization/${opts?.serviceProviderOrgId || config.orgIhs}` },
    };
    if (opts?.subjectDisplay) {
      body.subject.display = opts.subjectDisplay;
    }
    if (opts?.registrationNumber) {
      body.identifier = [
        {
          system: `${config.encounterSystemBase}/${config.orgIhs}`,
          value: opts.registrationNumber,
        },
      ];
    }
    if (opts?.locationRef) {
      body.location = [
        {
          location: {
            reference: opts.locationRef,
            ...(opts.locationDisplay ? { display: opts.locationDisplay } : {}),
          },
        },
      ];
    }
    if (opts?.serviceType) {
      body.serviceType = [
        {
          coding: [
            { system: "http://terminology.hl7.org/CodeSystem/service-type", code: opts.serviceType },
          ],
        },
      ];
    }
    if (opts?.practitionerRef) {
      body.participant = [
        {
          individual: {
            reference: opts.practitionerRef,
            ...(opts.practitionerDisplay ? { display: opts.practitionerDisplay } : {}),
          },
        },
      ];
    }
    const base = urls.fhir("Encounter");
    const resp = await fhirPost(base, body);
    return resp;
  },
  searchEncounter: async (params?: Record<string, string | undefined>) => {
    const base = urls.fhir("Encounter");
    const sanitized: Record<string, string> = {};
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && String(v).length > 0) {
          sanitized[k] = String(v);
        }
      }
    }
    return fhirGet(base, sanitized);
  },
  getEncounterById: async (id: string) => {
    const base = urls.fhir("Encounter");
    return fhirGet(`${base}/${id}`);
  },

  // Patient helpers
  searchPatientByIdentifier: async (systemAndValue: string) => {
    // Example: "https://fhir.kemkes.go.id/id/nik|9271060312000001" or IHS
    const base = urls.fhir("Patient");
    return fhirGet(base, { identifier: systemAndValue });
  },
  searchPatient: async (params?: Record<string, string | undefined>) => {
    const base = urls.fhir("Patient");
    const sanitized: Record<string, string> = {};
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && String(v).length > 0) {
          sanitized[k] = String(v);
        }
      }
    }
    return fhirGet(base, sanitized);
  },
  getPatientById: async (id: string) => {
    const base = urls.fhir("Patient");
    return fhirGet(`${base}/${id}`);
  },
  // Practitioner helpers
  searchPractitionerByIdentifier: async (systemAndValue: string) => {
    const base = urls.fhir("Practitioner");
    return fhirGet(base, { identifier: systemAndValue });
  },
  searchPractitioner: async (params?: Record<string, string | undefined>) => {
    const base = urls.fhir("Practitioner");
    const sanitized: Record<string, string> = {};
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && String(v).length > 0) {
          sanitized[k] = String(v);
        }
      }
    }
    return fhirGet(base, sanitized);
  },
  getPractitionerById: async (id: string) => {
    const base = urls.fhir("Practitioner");
    return fhirGet(`${base}/${id}`);
  },
  // Location helpers
  searchLocation: async (params?: Record<string, string | undefined>) => {
    const base = urls.fhir("Location");
    const sanitized: Record<string, string> = {};
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && String(v).length > 0) {
          sanitized[k] = String(v);
        }
      }
    }
    return fhirGet(base, sanitized);
  },
  getLocationById: async (id: string) => {
    const base = urls.fhir("Location");
    return fhirGet(`${base}/${id}`);
  },
  searchLocationByOrganization: async (orgId: string) => {
    const base = urls.fhir("Location");
    return fhirGet(base, { organization: orgId });
  },
};
