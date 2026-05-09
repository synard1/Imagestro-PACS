import { config } from "./config";
import { Satusehat } from "./satusehat";
import {
  initLogsTable,
  initServiceRequestsTable,
  initTokenStorageTable,
  saveServiceRequest,
  updateServiceRequestResponse,
  saveToken,
  upsertSetting
} from "./db";

function json(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 
      "Content-Type": "application/json",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Pragma": "no-cache",
      "Expires": "0"
    },
  });
}

async function handleDicomFromOrthanc(instanceId: string): Promise<Uint8Array> {
  // Fetch DICOM bytes from Orthanc REST
  const url = `${config.orthancUrl}/instances/${instanceId}/file`;
  const auth = btoa(`${config.orthancUsername}:${config.orthancPassword}`);
  const resp = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
  if (!resp.ok) throw new Error(`Orthanc fetch error ${resp.status}`);
  const arrBuf = await resp.arrayBuffer();
  return new Uint8Array(arrBuf);
}

// Enhanced readiness checks with detailed error reporting
async function checkSatusehatAuth(): Promise<{ status: boolean; details?: any; error?: string }> {
  try {
    // Since we don't have tokenHealth method, we'll just try to fetch a token
    const token = await Satusehat.token();
    return { 
      status: Boolean(token), 
      details: { 
        message: "Token fetched successfully"
      }
    };
  } catch (error) {
    return { 
      status: false, 
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function checkOrthanc(): Promise<{ status: boolean; error?: string }> {
  try {
    const url = `${config.orthancUrl}/system`;
    const auth = btoa(`${config.orthancUsername}:${config.orthancPassword}`);
    const resp = await fetch(url, { 
      headers: { Authorization: `Basic ${auth}` },
      signal: AbortSignal.timeout(5000) // 5 second timeout
    });
    return { status: resp.ok };
  } catch (error) {
    return { 
      status: false, 
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function searchImagingStudyWithFallback(identifiers: string[]) {
  const tried: string[] = [];
  let lastPayload: any = null;
  let lastStatus = 200;

  for (const id of identifiers) {
    if (!id || tried.includes(id)) continue;
    tried.push(id);
    try {
      const resp = await Satusehat.searchImagingStudyByIdentifier(id);
      const bodyText = await resp.text();
      lastStatus = resp.status;

      let bundle: any = null;
      let imagingStudyId: string | null = null;
      let total = 0;
      try {
        bundle = JSON.parse(bodyText);
        total = Number(bundle?.total || 0);
        const entries = Array.isArray(bundle?.entry) ? bundle.entry : [];
        const firstResource = entries[0]?.resource;
        imagingStudyId = typeof firstResource?.id === "string" ? firstResource.id : null;
      } catch (parseError) {
        console.warn(`[imagingstudy] Failed to parse response body for identifier ${id}:`, parseError);
      }

      const payload = bundle
        ? { imagingStudyId, identifier: id, triedIdentifiers: tried, bundle }
        : { imagingStudyId, identifier: id, triedIdentifiers: tried, raw: bodyText };

      lastPayload = payload;

      if (total > 0) {
        return { payload, status: resp.status };
      }

      // If upstream returns a client error (other than 404), stop early
      if (resp.status >= 400 && resp.status < 500 && resp.status !== 404) {
        return { payload, status: resp.status };
      }
    } catch (error) {
      console.error(`[imagingstudy] search identifier ${id} error:`, error);
      lastPayload = { identifier: id, triedIdentifiers: tried, error: error instanceof Error ? error.message : String(error) };
      lastStatus = 500;
    }
  }

  return { payload: lastPayload || { triedIdentifiers: tried, imagingStudyId: null }, status: lastStatus };
}

const app = {
  port: config.port,
  fetch: async (req: Request) => {
    const { pathname, searchParams } = new URL(req.url);
    const timestamp = new Date().toISOString();
    console.log(`[satusehat-integrator] ${req.method} ${pathname}${searchParams.toString() ? '?' + searchParams.toString() : ''} at ${timestamp}`);

    // CORS handling
    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    // Health (liveness) - basic service availability
    if (pathname === "/health") {
      return json({ 
        status: "ok", 
        service: "satusehat-integrator", 
        version: "1.0.0",
        timestamp 
      });
    }

    // Readiness: external dependencies with detailed status
    if (pathname === "/ready" || pathname === "/healthz") {
      const satusehatCheck = await checkSatusehatAuth();
      const orthancCheck = await checkOrthanc();
      
      const overall = satusehatCheck.status && orthancCheck.status ? "ready" : 
                     (satusehatCheck.status || orthancCheck.status ? "degraded" : "unhealthy");
      const statusCode = overall === "unhealthy" ? 503 : overall === "degraded" ? 206 : 200;
      
      return json({
        status: overall,
        service: "satusehat-integrator",
        version: "1.0.0",
        checks: { 
          satusehatAuth: {
            status: satusehatCheck.status,
            details: satusehatCheck.details,
            error: satusehatCheck.error
          },
          orthanc: {
            status: orthancCheck.status,
            error: orthancCheck.error
          }
        },
        timestamp,
      }, statusCode);
    }

    // Enhanced OAuth token endpoint with automatic generation
    if (pathname === "/oauth/token" && (req.method === "GET" || req.method === "POST")) {
      try {
        const token = await Satusehat.token();
        // Since we don't have tokenHealth method, we'll provide basic info
        return json({ 
          access_token: token,
          token_type: "Bearer",
          expires_in: 3600, // Default value
          scope: "read write",
          generated_at: timestamp
        });
      } catch (e: any) {
        const status = typeof e?.status === "number" ? e.status : 500;
        console.error(`[oauth] token error`, e);
        return json({ 
          error: "token_generation_failed",
          error_description: e.message || String(e),
          timestamp
        }, status);
      }
    }

    // Token health check endpoint - simplified since we don't have tokenHealth method
    if (pathname === "/oauth/health" && req.method === "GET") {
      try {
        // Just try to fetch a token to check if auth is working
        const token = await Satusehat.token();
        return json({
          valid: Boolean(token),
          message: token ? "Token is valid" : "Unable to fetch token",
          timestamp
        });
      } catch (e: any) {
        console.error(`[oauth] health check error`, e);
        return json({ 
          valid: false, 
          error: e.message || String(e),
          timestamp
        }, 500);
      }
    }

    // Force token refresh endpoint - simplified since we don't have refreshToken method
    if (pathname === "/oauth/refresh" && req.method === "POST") {
      try {
        // Reset token cache to force refresh
        (Satusehat as any).tokenCache = { token: null, exp: 0 };
        const token = await Satusehat.token();
        
        return json({ 
          access_token: token,
          token_type: "Bearer",
          expires_in: 3600, // Default value
          scope: "read write",
          refreshed_at: timestamp
        });
      } catch (e: any) {
        const status = typeof e?.status === "number" ? e.status : 500;
        console.error(`[oauth] refresh error`, e);
        return json({ 
          error: "token_refresh_failed",
          error_description: e.message || String(e),
          timestamp
        }, status);
      }
    }

    // ServiceRequest search
    if (pathname === "/servicerequest/search" && req.method === "GET") {
      const subject = searchParams.get("subject") || "";
      const acc = searchParams.get("accessionNumber") || "";
      if (!subject || !acc) {
        return json({ 
          error: "missing_parameters",
          error_description: "subject & accessionNumber wajib",
          timestamp
        }, 400);
      }
      
      try {
        const resp = await Satusehat.searchServiceRequestByAccession(subject, acc);
        console.log(`[servicerequest] search status`, resp.status);
        const body = await resp.text();
        return new Response(body, { 
          status: resp.status, 
          headers: { 
            "Content-Type": "application/json",
            "Cache-Control": "no-cache"
          } 
        });
      } catch (error) {
        console.error(`[servicerequest] search error:`, error);
        return json({
          error: "search_failed",
          error_description: error instanceof Error ? error.message : String(error),
          timestamp
        }, 500);
      }
    }

    // ServiceRequest generic search passthrough via query params
    if (pathname === "/servicerequest" && req.method === "GET") {
      try {
        const paramsObj: Record<string, string> = {};
        searchParams.forEach((v, k) => { paramsObj[k] = v; });
        const resp = await Satusehat.searchServiceRequest(paramsObj);
        console.log(`[servicerequest] generic search status`, resp.status);
        const body = await resp.text();
        return new Response(body, { 
          status: resp.status, 
          headers: { 
            "Content-Type": "application/json",
            "Cache-Control": "no-cache"
          } 
        });
      } catch (error) {
        console.error(`[servicerequest] generic search error:`, error);
        return json({
          error: "search_failed",
          error_description: error instanceof Error ? error.message : String(error),
          timestamp
        }, 500);
      }
    }

    // ServiceRequest by ID
    if (pathname.startsWith("/servicerequest/") && req.method === "GET") {
      const id = pathname.split("/")[2];
      if (!id) return json({ error: "ID diperlukan" }, 400);
      const resp = await Satusehat.getServiceRequestById(id);
      console.log(`[servicerequest] get by ID status`, resp.status);
      const body = await resp.text();
      return new Response(body, { status: resp.status, headers: { "Content-Type": "application/json" } });
    }

    // Create ServiceRequest
    if (pathname === "/servicerequest" && req.method === "POST") {
      try {
        const body = await req.json().catch(() => ({}));
        console.log("[servicerequest] Received payload:", JSON.stringify(body, null, 2));
        
        const { 
          patientId, 
          encounterId, 
          practitionerId, 
          locationId, 
          code, 
          codeDisplay,
          category,
          priority,
          intent,
          status,
          authoredOn,
          reasonCode,
          reasonDisplay,
          note,
          performerId
        } = body;

        // Validate required fields
        if (!patientId || !encounterId || !practitionerId || !locationId || !code || !codeDisplay) {
          console.error("[servicerequest] Missing required fields:", { 
            patientId, encounterId, practitionerId, locationId, code, codeDisplay 
          });
          return json({ 
            error: "missing_required_fields",
            error_description: "patientId, encounterId, practitionerId, locationId, code, dan codeDisplay wajib diisi",
            timestamp: new Date().toISOString()
          }, 400);
        }

        // Save to database first
        const dbId = await saveServiceRequest({
          patientId,
          encounterId,
          practitionerId,
          locationId,
          code,
          codeDisplay,
          category,
          priority,
          intent,
          status,
          authoredOn,
          reasonCode,
          reasonDisplay,
          note,
          requestData: body
        });

        try {
          const resp = await Satusehat.createServiceRequest({
            patientId,
            encounterId,
            practitionerId,
            locationId,
            code,
            codeDisplay,
            category,
            priority,
            intent,
            status,
            authoredOn,
            reasonCode,
            reasonDisplay,
            note,
            performerId
          });

          console.log(`[servicerequest] create status`, resp.status);
          const responseText = await resp.text();
          
          // Update database with response
          if (dbId && resp.status >= 200 && resp.status < 300) {
            try {
              const responseData = JSON.parse(responseText);
              const satusehatId = responseData.id;
              if (satusehatId) {
                await updateServiceRequestResponse(dbId, satusehatId, responseData);
              }
            } catch (parseError) {
              console.warn(`[servicerequest] Failed to parse response for DB update:`, parseError);
            }
          } else if (dbId) {
            await updateServiceRequestResponse(dbId, '', { status: resp.status }, `HTTP ${resp.status}`);
          }

          return new Response(responseText, { 
            status: resp.status, 
            headers: { "Content-Type": "application/json" } 
          });
        } catch (satusehatError) {
          // Update database with error
          if (dbId) {
            await updateServiceRequestResponse(dbId, '', {}, satusehatError instanceof Error ? satusehatError.message : String(satusehatError));
          }
          throw satusehatError;
        }
      } catch (error) {
        console.error(`[servicerequest] create error:`, error);
        return json({
          error: "create_failed",
          error_description: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString()
        }, 500);
      }
    }

    // Encounter search by subject
    if (pathname === "/encounter/search" && req.method === "GET") {
      const subject = searchParams.get("subject") || "";
      if (!subject) return json({ error: "subject wajib" }, 400);
      // Fix the method name - it should be searchEncounter not searchEncounterBySubject
      const resp = await Satusehat.searchEncounter({ subject });
      console.log(`[encounter] search by subject status`, resp.status);
      const body = await resp.text();
      return new Response(body, { status: resp.status, headers: { "Content-Type": "application/json" } });
    }

    // Encounter generic search
    if (pathname === "/encounter" && req.method === "GET") {
      const paramsObj: Record<string, string> = {};
      searchParams.forEach((v, k) => { paramsObj[k] = v; });
      const resp = await Satusehat.searchEncounter(paramsObj);
      console.log(`[encounter] generic search status`, resp.status);
      const body = await resp.text();
      return new Response(body, { status: resp.status, headers: { "Content-Type": "application/json" } });
    }

    // Encounter by ID
    if (pathname.startsWith("/encounter/") && req.method === "GET") {
      const id = pathname.split("/")[2];
      if (!id) return json({ error: "ID diperlukan" }, 400);
      const resp = await Satusehat.getEncounterById(id);
      console.log(`[encounter] get by ID status`, resp.status);
      const body = await resp.text();
      return new Response(body, { status: resp.status, headers: { "Content-Type": "application/json" } });
    }

    // Create Encounter (minimal)
    if (pathname === "/encounter/minimal" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const { patientId, ...opts } = body;
      if (!patientId) return json({ error: "patientId wajib" }, 400);
      const resp = await Satusehat.createEncounterMinimal(patientId, opts);
      console.log(`[encounter] create minimal status`, resp.status);
      const txt = await resp.text();
      return new Response(txt, { status: resp.status, headers: { "Content-Type": "application/json" } });
    }

    // Create Encounter (advanced)
    if (pathname === "/encounter/advanced" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const { patientId, ...opts } = body;
      if (!patientId) return json({ error: "patientId wajib" }, 400);
      const resp = await Satusehat.createEncounterAdvanced(patientId, opts);
      console.log(`[encounter] create advanced status`, resp.status);
      const txt = await resp.text();
      return new Response(txt, { status: resp.status, headers: { "Content-Type": "application/json" } });
    }

    // Patient search by identifier
    if (pathname === "/patient/search" && req.method === "GET") {
      const identifier = searchParams.get("identifier") || "";
      if (!identifier) return json({ error: "identifier wajib" }, 400);
      const resp = await Satusehat.searchPatientByIdentifier(identifier);
      console.log(`[patient] search by identifier status`, resp.status);
      const body = await resp.text();
      return new Response(body, { status: resp.status, headers: { "Content-Type": "application/json" } });
    }

    // Patient generic search
    if (pathname === "/patient" && req.method === "GET") {
      const paramsObj: Record<string, string> = {};
      searchParams.forEach((v, k) => { paramsObj[k] = v; });
      const resp = await Satusehat.searchPatient(paramsObj);
      console.log(`[patient] generic search status`, resp.status);
      const body = await resp.text();
      return new Response(body, { status: resp.status, headers: { "Content-Type": "application/json" } });
    }

    // Patient by ID
    if (pathname.startsWith("/patient/") && req.method === "GET") {
      const id = pathname.split("/")[2];
      if (!id) return json({ error: "ID diperlukan" }, 400);
      const resp = await Satusehat.getPatientById(id);
      console.log(`[patient] get by ID status`, resp.status);
      const body = await resp.text();
      return new Response(body, { status: resp.status, headers: { "Content-Type": "application/json" } });
    }

    // Practitioner search by identifier
    if (pathname === "/practitioner/search" && req.method === "GET") {
      const identifier = searchParams.get("identifier") || "";
      if (!identifier) return json({ error: "identifier wajib" }, 400);
      const resp = await Satusehat.searchPractitionerByIdentifier(identifier);
      console.log(`[practitioner] search by identifier status`, resp.status);
      const body = await resp.text();
      return new Response(body, { status: resp.status, headers: { "Content-Type": "application/json" } });
    }

    // Practitioner generic search
    if (pathname === "/practitioner" && req.method === "GET") {
      const paramsObj: Record<string, string> = {};
      searchParams.forEach((v, k) => { paramsObj[k] = v; });
      const resp = await Satusehat.searchPractitioner(paramsObj);
      console.log(`[practitioner] generic search status`, resp.status);
      const body = await resp.text();
      return new Response(body, { status: resp.status, headers: { "Content-Type": "application/json" } });
    }

    // Practitioner by ID
    if (pathname.startsWith("/practitioner/") && req.method === "GET") {
      const id = pathname.split("/")[2];
      if (!id) return json({ error: "ID diperlukan" }, 400);
      const resp = await Satusehat.getPractitionerById(id);
      console.log(`[practitioner] get by ID status`, resp.status);
      const body = await resp.text();
      return new Response(body, { status: resp.status, headers: { "Content-Type": "application/json" } });
    }

    // ImagingStudy search by identifier / generic fetch
    if (pathname.startsWith("/imagingstudy/search/") && (req.method === "GET" || req.method === "POST")) {
      const accessionFromPath = pathname.split("/")[3] || "";
      const accessionNumber = decodeURIComponent(accessionFromPath);
      const orgId = searchParams.get("orgId") || config.orgIhs;
      const systemBase = searchParams.get("systemBase") || `${config.accessionSystemBase}/${orgId}`;

      if (!accessionNumber) {
        return json({
          error: "missing_parameters",
          error_description: "accessionNumber di path wajib",
          timestamp
        }, 400);
      }

      const identifiers: string[] = [];
      identifiers.push(`${systemBase}|${accessionNumber}`);
      // Fallback to standard acsn base regardless of env overrides
      identifiers.push(`http://sys-ids.kemkes.go.id/acsn/${orgId}|${accessionNumber}`);
      // Legacy fallback to accessionno base
      identifiers.push(`http://sys-ids.kemkes.go.id/accessionno/${orgId}|${accessionNumber}`);

      try {
        const { payload, status } = await searchImagingStudyWithFallback(identifiers);
        console.log(`[imagingstudy] search (path) status`, status, payload?.identifier);
        return new Response(JSON.stringify(payload), {
          status,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-cache"
          }
        });
      } catch (error) {
        console.error(`[imagingstudy] search (path) error:`, error);
        return json({
          error: "search_failed",
          error_description: error instanceof Error ? error.message : String(error),
          timestamp
        }, 500);
      }
    }

    if (pathname === "/imagingstudy/search" && req.method === "GET") {
      const identifierParam = searchParams.get("identifier");
      const accessionNumber = searchParams.get("accessionNumber");
      const orgId = searchParams.get("orgId") || config.orgIhs;
      const systemBase = searchParams.get("systemBase") || `${config.accessionSystemBase}/${orgId}`;

      const identifiers: string[] = [];
      if (identifierParam) identifiers.push(identifierParam);
      if (accessionNumber) {
        identifiers.push(`${systemBase}|${accessionNumber}`);
        identifiers.push(`http://sys-ids.kemkes.go.id/acsn/${orgId}|${accessionNumber}`);
        identifiers.push(`http://sys-ids.kemkes.go.id/accessionno/${orgId}|${accessionNumber}`);
      }

      if (identifiers.length === 0) {
        return json({
          error: "missing_parameters",
          error_description: "identifier atau accessionNumber wajib",
          timestamp
        }, 400);
      }

      try {
        const { payload, status } = await searchImagingStudyWithFallback(identifiers);
        console.log(`[imagingstudy] search status`, status, payload?.identifier);
        return new Response(JSON.stringify(payload), {
          status,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-cache"
          }
        });
      } catch (error) {
        console.error(`[imagingstudy] search error:`, error);
        return json({
          error: "search_failed",
          error_description: error instanceof Error ? error.message : String(error),
          timestamp
        }, 500);
      }
    }

    if (pathname === "/imagingstudy" && req.method === "GET") {
      const paramsObj: Record<string, string> = {};
      searchParams.forEach((v, k) => { paramsObj[k] = v; });
      const resp = await Satusehat.searchImagingStudy(paramsObj);
      console.log(`[imagingstudy] generic search status`, resp.status);
      const body = await resp.text();
      return new Response(body, { status: resp.status, headers: { "Content-Type": "application/json" } });
    }

    if (pathname.startsWith("/imagingstudy/") && req.method === "GET") {
      const id = pathname.split("/")[2];
      if (!id) return json({ error: "ID diperlukan" }, 400);
      const resp = await Satusehat.getImagingStudyById(id);
      console.log(`[imagingstudy] get by ID status`, resp.status);
      const body = await resp.text();
      return new Response(body, { status: resp.status, headers: { "Content-Type": "application/json" } });
    }

    // ImagingStudy creation
    if (pathname === "/imagingstudy" && req.method === "POST") {
      try {
        const body = await req.json().catch(() => ({}));
        
        // If it's a raw FHIR resource (has resourceType)
        if (body.resourceType === "ImagingStudy") {
          console.log("[imagingstudy] Submitting raw FHIR resource");
          const resp = await Satusehat.postImagingStudyRaw(body);
          console.log(`[imagingstudy] raw create status`, resp.status);
          const txt = await resp.text();
          return new Response(txt, { status: resp.status, headers: { "Content-Type": "application/json" } });
        }

        // Legacy format / partial data
        const { patientId, basedOnServiceRequestId, accessionNumber } = body;
        if (!patientId || !basedOnServiceRequestId) {
          return json({ error: "patientId dan basedOnServiceRequestId wajib (atau kirim raw FHIR resource)" }, 400);
        }
        const resp = await Satusehat.createImagingStudy(patientId, basedOnServiceRequestId, accessionNumber);
        console.log(`[imagingstudy] create status`, resp.status);
        const txt = await resp.text();
        return new Response(txt, { status: resp.status, headers: { "Content-Type": "application/json" } });
      } catch (error) {
        console.error(`[imagingstudy] create error:`, error);
        return json({
          error: "create_failed",
          error_description: error instanceof Error ? error.message : String(error),
          timestamp
        }, 500);
      }
    }

    // DICOM upload (placeholder)
    if (pathname === "/dicom/upload" && req.method === "POST") {
      return json({ error: "DICOM upload belum diimplementasi" }, 501);
    }

    // Internal endpoint: simpan token yang sudah digenerate oleh Gateway ke DB + settings
    if (pathname === "/oauth/token/store" && req.method === "POST") {
      try {
        const body = await req.json().catch(() => ({}));

        const accessToken = body?.access_token || body?.token?.access_token;
        if (!accessToken) {
          return json({
            status: "error",
            message: "access_token tidak ditemukan di payload"
          }, 400);
        }

        const tokenType = body?.token_type || body?.token?.token_type || "Bearer";
        const scope = body?.scope || body?.token?.scope;
        const expiresIn = Number(body?.expires_in || body?.token?.expires_in || 0) || 0;
        const issuedAt = Number(body?.issued_at || body?.token?.issued_at || Math.floor(Date.now() / 1000));

        // Simpan ke satusehat_tokens (histori)
        try {
          await saveToken({
            clientId: config.clientId || "unknown",
            organizationName: body?.organizationId || undefined,
            tokenType,
            accessToken,
            refreshToken: body?.refresh_token || body?.token?.refresh_token,
            expiresIn,
            issuedAt,
            scope,
            status: "active",
            rawResponse: body,
            requestData: {
              source: "gateway-direct",
              note: "Stored via /oauth/token/store"
            }
          });
        } catch (e: any) {
          console.warn("[oauth.store] Gagal menyimpan token ke satusehat_tokens:", e?.message || e);
        }

        // Simpan ke settings sebagai satusehat_latest_token
        try {
          const latestTokenSetting = {
            access_token: accessToken,
            token_type: tokenType,
            scope,
            expires_in: expiresIn,
            issued_at: issuedAt,
            source: "gateway-direct",
            env: config.satusehatBase,
            organizationId: body?.organizationId || config.orgIhs
          };
          await upsertSetting("satusehat_latest_token", latestTokenSetting);
        } catch (e: any) {
          console.warn("[oauth.store] Gagal menyimpan token ke settings:", e?.message || e);
        }

        return json({
          status: "ok",
          message: "Token stored successfully"
        }, 200);
      } catch (e: any) {
        console.error("[oauth.store] Error processing token store request:", e);
        return json({
          status: "error",
          message: "Failed to store token",
          detail: e?.message || String(e)
        }, 500);
      }
    }

    // 404 for unmatched routes
    return json({ 
      error: "not_found",
      error_description: `Endpoint ${pathname} tidak ditemukan`,
      available_endpoints: [
        "GET /health",
        "GET /ready",
        "GET|POST /oauth/token",
        "GET /oauth/health",
        "POST /oauth/refresh",
        "GET /patient",
        "GET /practitioner",
        "GET /encounter",
        "GET /servicerequest",
        "GET /imagingstudy/search"
      ],
      timestamp
    }, 404);
  },
};

export default app;

 // Initialize database and start logging
initLogsTable().catch((e: any) => {
  console.error("[init] Failed to initialize logs table:", e);
});

initServiceRequestsTable().catch((e: any) => {
  console.error("[init] Failed to initialize service_requests table:", e);
});

initTokenStorageTable().catch((e: any) => {
  console.error("[init] Failed to initialize satusehat_tokens table:", e);
});

console.log(`[satusehat-integrator] v1.0.0 listening on :${config.port}`);
console.log(`[satusehat-integrator] Enhanced token management enabled`);
console.log(`[satusehat-integrator] Health checks available at /health and /ready`);
