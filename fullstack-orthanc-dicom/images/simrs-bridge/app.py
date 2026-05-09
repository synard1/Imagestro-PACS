from fastapi import FastAPI, HTTPException, Response
from pydantic import BaseModel
import httpx, os, time, datetime as dt

API_BASE = os.getenv("SATUSEHAT_BASE", "https://api-satusehat-stg.dto.kemkes.go.id")
FHIR_BASE = API_BASE + "/fhir-r4/v1"
OAUTH_URL = API_BASE + "/oauth2/v1/accesstoken"
CLIENT_ID = os.getenv("CLIENT_ID")
CLIENT_SECRET = os.getenv("CLIENT_SECRET")
ORG_IHS = os.getenv("ORG_IHS", "10000004")
ACCESSION_API = os.getenv("ACCESSION_API", "http://accession-api:8180/api/accessions")
REQUESTER_REF = os.getenv("REQUESTER_REF")          # contoh "Practitioner/N10000001"
PERFORMER_REF = os.getenv("PERFORMER_REF")          # contoh "Organization/10000004"
ACSN_SYSTEM_BASE = os.getenv("ACSN_SYSTEM_BASE", "http://sys-ids.kemkes.go.id/accessionno")

api = FastAPI(title="SIMRS Bridge (SATUSEHAT Staging)")
_token = {"val": None, "exp": 0}

@api.get("/health")
async def health_check():
    return {"status": "healthy"}

class OrderIn(BaseModel):
    patientId: str        # HANYA ID: "100000030009"
    encounterId: str      # HANYA ID: "<uuid>"
    loincCode: str
    modality: str
    note: str | None = None

def now_utc_fhir():
    # FHIR datetime dengan timezone & tanpa microseconds; mundurkan 60s agar tidak future
    t = dt.datetime.utcnow() - dt.timedelta(seconds=60)
    return t.replace(microsecond=0).isoformat() + "Z"

async def oauth_token():
    now = time.time()
    if _token["val"] and now < _token["exp"]:
        return _token["val"]
    if not CLIENT_ID or not CLIENT_SECRET:
        raise HTTPException(500, "CLIENT_ID/CLIENT_SECRET belum di-set.")
    async with httpx.AsyncClient(timeout=30) as s:
        r = await s.post(OAUTH_URL,
                         params={"grant_type":"client_credentials"},
                         headers={"Content-Type":"application/x-www-form-urlencoded"},
                         data={"client_id":CLIENT_ID, "client_secret":CLIENT_SECRET})
    if r.status_code != 200:
        raise HTTPException(502, f"OAuth error {r.status_code}: {r.text or '<empty body>'}")
    j = r.json()
    _token["val"] = j["access_token"]
    _token["exp"] = now + max(300, int(j.get("expires_in","3599")) - 60)
    return _token["val"]

def oo_to_text(obj: dict) -> str:
    if not isinstance(obj, dict): return ""
    if obj.get("resourceType") != "OperationOutcome": return ""
    out = []
    for i in obj.get("issue", []):
        msg = (i.get("details") or {}).get("text") or i.get("diagnostics") or i.get("code")
        if msg: out.append(str(msg))
    return " | ".join(out)

def summarize_resp(r: httpx.Response, url: str):
    rid = r.headers.get("x-request-id") or r.headers.get("x-correlation-id") or "-"
    try:
        js = r.json()
    except Exception:
        js = None
    if js:
        msg = oo_to_text(js) or (str(js)[:2000])
    else:
        msg = (r.text or "<empty body>")[:2000]
    return {
        "status": r.status_code,
        "reason": r.reason_phrase,
        "x_request_id": rid,
        "url": url,
        "body_snippet": msg
    }

@api.post("/api/orders")
async def create_order(inp: OrderIn, response: Response):
    # Validasi env referensi wajib
    if not REQUESTER_REF or not PERFORMER_REF:
        raise HTTPException(500, "REQUESTER_REF & PERFORMER_REF wajib di-set ke resource valid (Practitioner/.., Organization/.., atau PractitionerRole/..).")

    # 1) Accession
    acc_payload = {
        "modality": inp.modality,
        "procedure_code": inp.loincCode,
        "scheduled_at": now_utc_fhir(),   # tidak dipakai FHIR, tapi tersimpan di registry kamu
        "patient": {"id": inp.patientId},
        "note": inp.note or ""
    }
    try:
        async with httpx.AsyncClient(timeout=30) as s:
            acc = await s.post(ACCESSION_API, json=acc_payload)
    except httpx.RequestError as e:
        raise HTTPException(502, f"Cannot reach accession-api: {e!s}")
    if acc.status_code >= 300:
        raise HTTPException(502, f"Accession API {acc.status_code}: {acc.text or '<empty body>'}")
    try:
        aj = acc.json()
    except Exception:
        raise HTTPException(502, f"Accession API non-JSON: {acc.text[:500]}")
    acsn = aj.get("accession_number") or aj.get("accessionNumber")
    if not acsn:
        raise HTTPException(500, f"Accession number missing in response: {aj}")

    # 2) Token
    token = await oauth_token()

    # 3) ServiceRequest (fix authoredOn, requester/performer, identifier system)
    sr = {
        "resourceType": "ServiceRequest",
        "status": "active",
        "intent": "order",
        "code": {"coding":[{"system":"http://loinc.org","code": inp.loincCode}]},
        "subject": {"reference": f"Patient/{inp.patientId}"},
        "encounter": {"reference": f"Encounter/{inp.encounterId}"},
        "requester": {"reference": REQUESTER_REF},
        "performer": [{"reference": PERFORMER_REF}],
        "identifier": [{
            "system": f"{ACSN_SYSTEM_BASE.rstrip('/')}/{ORG_IHS}",
            "value": acsn
        }],
        "authoredOn": now_utc_fhir(),
        "note": [{"text": inp.note}] if inp.note else []
    }

    url = f"{FHIR_BASE}/ServiceRequest"
    async with httpx.AsyncClient(timeout=45) as s:
        r = await s.post(url,
                         headers={"Authorization": f"Bearer {token}",
                                  "Content-Type":"application/fhir+json"},
                         json=sr)

    # Tambahkan header debug di response bridge
    response.headers["X-Upstream-Request-ID"] = r.headers.get("x-request-id", "")
    response.headers["X-Upstream-Status"] = str(r.status_code)
    response.headers["X-Upstream-URL"] = url
    response.headers["X-Accession-Number"] = acsn

    if r.status_code >= 300:
        # balas body kaya JSON �enriched� supaya gampang debug
        return {
            "error": "ServiceRequest rejected by SATUSEHAT",
            "upstream": summarize_resp(r, url),
            "sent": sr
        }

    # sukses
    return {
        "service_request_id": r.json().get("id"),
        "accession_number": acsn,
        "identifier_system": f"{ACSN_SYSTEM_BASE.rstrip('/')}/{ORG_IHS}",
        "upstream": {
            "status": r.status_code,
            "x_request_id": r.headers.get("x-request-id"),
            "url": url
        }
    }
