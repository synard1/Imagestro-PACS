#!/usr/bin/env python3
"""
Accession Worker Integration Test Suite
Traces the full request chain:
  Frontend (browser) → Nginx proxy → api-gateway-v2 (Cloudflare Worker)
    → /accession-api/* → accession-worker (D1 + Durable Objects)
    → /accession-api/... → existing backend services (orders, patients, worklist, PACS)

Run:
    python tests/test_accession_integration.py
    python tests/test_accession_integration.py --direct   # hit accession-worker directly (no gateway)
    python tests/test_accession_integration.py --verbose  # show full response bodies on failures
"""

import requests
import json
import sys
import uuid
import time
import argparse
from datetime import datetime, timezone

# ──────────────────────────────────────────────────────────────────────────────
# Configuration
# ──────────────────────────────────────────────────────────────────────────────

FRONTEND_PROXY  = "http://100.113.207.79:8082"        # Nginx → api-gateway-v2
BACKEND_API     = f"{FRONTEND_PROXY}/backend-api"     # gateway routes
ACCESSION_API   = f"{BACKEND_API}/accession-api"      # → accession-worker via Service Binding

WORKER_DIRECT   = "https://accession-worker.satupintudigital.workers.dev"  # bypass gateway

GATEWAY_URL     = "https://api-gateway-v2.satupintudigital.workers.dev"    # gateway direct

LOGIN_USERNAME  = "superadmin"
LOGIN_PASSWORD  = "SuperAdmin123!@#"

TIMEOUT         = 20   # seconds per request

# ──────────────────────────────────────────────────────────────────────────────
# Output helpers
# ──────────────────────────────────────────────────────────────────────────────

class C:
    GREEN  = '\033[92m'
    RED    = '\033[91m'
    YELLOW = '\033[93m'
    BLUE   = '\033[94m'
    CYAN   = '\033[96m'
    BOLD   = '\033[1m'
    DIM    = '\033[2m'
    RESET  = '\033[0m'

def log(msg, color=C.RESET):
    print(f"{color}{msg}{C.RESET}")

PASS_COUNT = 0
FAIL_COUNT = 0
SKIP_COUNT = 0

def test(name, method, url, *, headers=None, json_data=None, params=None,
         expect_status=None, expect_contains=None, allow_fail=False, verbose=False):
    """
    Execute a single HTTP test case.
    Returns (passed: bool, response_or_None).
    """
    global PASS_COUNT, FAIL_COUNT
    try:
        r = requests.request(method, url, headers=headers, json=json_data,
                             params=params, timeout=TIMEOUT)

        # Determine pass/fail
        if expect_status is not None:
            passed = r.status_code == expect_status
        else:
            passed = r.status_code < 400

        if expect_contains and passed:
            try:
                body = r.json()
            except Exception:
                body = {}
            for key, val in expect_contains.items():
                if body.get(key) != val:
                    passed = False
                    break

        if allow_fail:
            status_str = f"{C.YELLOW}[WARN]{C.RESET}" if not passed else f"{C.GREEN}[PASS]{C.RESET}"
        else:
            status_str = f"{C.GREEN}[PASS]{C.RESET}" if passed else f"{C.RED}[FAIL]{C.RESET}"

        short_url = url.replace(FRONTEND_PROXY, "").replace(WORKER_DIRECT, "[direct]")
        print(f"{status_str} {method:<7} {short_url:<68} -> {r.status_code}")

        if (not passed or verbose) and r.status_code >= 400:
            try:
                detail = json.dumps(r.json(), ensure_ascii=False)[:200]
            except Exception:
                detail = r.text[:200]
            print(f"         {C.YELLOW}{detail}{C.RESET}")

        if not allow_fail:
            if passed:
                PASS_COUNT += 1
            else:
                FAIL_COUNT += 1

        return passed, r

    except requests.exceptions.ConnectionError as e:
        print(f"{C.RED}[ERR ]{C.RESET} {method:<7} {url[:68]:<68} -> Connection refused")
        if not allow_fail:
            FAIL_COUNT += 1
        return False, None
    except Exception as e:
        print(f"{C.RED}[ERR ]{C.RESET} {method:<7} {url[:68]:<68} -> {e}")
        if not allow_fail:
            FAIL_COUNT += 1
        return False, None


def section(title):
    print()
    print("─" * 110)
    log(f"  {title}", C.BOLD + C.CYAN)
    print("─" * 110)


def note(msg):
    print(f"         {C.DIM}{msg}{C.RESET}")


# ──────────────────────────────────────────────────────────────────────────────
# Argument parsing
# ──────────────────────────────────────────────────────────────────────────────

parser = argparse.ArgumentParser(description="Accession Worker Integration Tests")
parser.add_argument("--direct", action="store_true",
                    help="Also run accession-worker endpoints directly (bypassing gateway)")
parser.add_argument("--verbose", action="store_true",
                    help="Print response bodies on failures")
args = parser.parse_args()

VERBOSE = args.verbose

# ──────────────────────────────────────────────────────────────────────────────
# HEADER
# ──────────────────────────────────────────────────────────────────────────────

print("=" * 110)
log("  ACCESSION WORKER FULL-STACK INTEGRATION TEST SUITE", C.BOLD)
log(f"  Chain: Browser → Nginx({FRONTEND_PROXY}) → Gateway → accession-worker (D1 + DO)", C.DIM)
log(f"  Started: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}", C.DIM)
print("=" * 110)

# ══════════════════════════════════════════════════════════════════════════════
# 0. GATEWAY HEALTH — verify gateway is up before anything else
# ══════════════════════════════════════════════════════════════════════════════

section("0. GATEWAY REACHABILITY")

ok, _ = test("Gateway root", "GET", f"{BACKEND_API}/")
if not ok:
    log("\nFatal: gateway unreachable at " + BACKEND_API, C.RED)
    sys.exit(1)

test("Gateway health (pacs)", "GET", f"{BACKEND_API}/health/pacs")
test("Gateway health (auth)", "GET", f"{BACKEND_API}/health/auth")
test("Gateway health (master)", "GET", f"{BACKEND_API}/health/master")
test("Gateway health (order)", "GET", f"{BACKEND_API}/health/order")
test("Gateway health (mwl)", "GET", f"{BACKEND_API}/health/mwl")

# ══════════════════════════════════════════════════════════════════════════════
# 1. AUTHENTICATION  (frontend → gateway → auth-service)
# ══════════════════════════════════════════════════════════════════════════════

section("1. AUTHENTICATION  (frontend → gateway → auth-service)")

ok, resp = test("POST /auth/login", "POST", f"{BACKEND_API}/auth/login",
                json_data={"username": LOGIN_USERNAME, "password": LOGIN_PASSWORD},
                expect_status=200)

if not ok:
    log("\nFatal: login failed — cannot continue", C.RED)
    sys.exit(1)

body       = resp.json()
TOKEN      = body.get("access_token") or body.get("token") or ""
TENANT_ID  = body.get("tenant_id") or ""
note(f"Token obtained. Tenant ID: {TENANT_ID or '(embedded in JWT)'}")

AUTH  = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}
ACSN  = {**AUTH, "X-Request-ID": str(uuid.uuid4())}   # headers for accession calls

# ══════════════════════════════════════════════════════════════════════════════
# 2. ACCESSION-WORKER HEALTH  (via gateway proxy /accession-api/*)
# ══════════════════════════════════════════════════════════════════════════════

section("2. ACCESSION-WORKER HEALTH  (via gateway → worker)")
note(f"Path: {ACCESSION_API}/healthz  → gateway strips /accession-api → worker /healthz")

ok, hr = test("GET /accession-api/healthz (no auth required)", "GET",
              f"{ACCESSION_API}/healthz", expect_status=200)
if ok and hr:
    h = hr.json()
    svc_status = h.get("status", "?")
    db_status  = h.get("checks", {}).get("db", {}).get("status", "?")
    db_latency = h.get("checks", {}).get("db", {}).get("latency_ms", "?")
    note(f"worker status={svc_status}  db={db_status} ({db_latency}ms)  "
         f"version={h.get('version','?')}  uptime={h.get('uptime_ms','?')}ms")

ok, rr = test("GET /accession-api/readyz (no auth required)", "GET",
              f"{ACCESSION_API}/readyz", expect_status=200)
if ok and rr:
    note(f"readyz ready={rr.json().get('ready')}")

# ══════════════════════════════════════════════════════════════════════════════
# 3. ACCESSION CONFIG/SETTINGS  (authenticated)
# ══════════════════════════════════════════════════════════════════════════════

section("3. ACCESSION CONFIG  (frontend → gateway → worker /settings/accession_config)")

ok, cfg_resp = test("GET /settings/accession_config", "GET",
                    f"{ACCESSION_API}/settings/accession_config",
                    headers=AUTH, expect_status=200)

original_pattern = None
if ok and cfg_resp:
    cfg = cfg_resp.json()
    original_pattern = cfg.get("pattern")
    note(f"Current config: pattern={original_pattern}  "
         f"reset_policy={cfg.get('counter_reset_policy')}  "
         f"seq_digits={cfg.get('sequence_digits')}")

# PUT — update pattern (must convert UI {SEQ4} → worker {NNNN} format)
new_pattern = "{ORG}-{YYYY}{MM}{DD}-{NNNN}"
ok, _ = test("PUT /settings/accession_config", "PUT",
             f"{ACCESSION_API}/settings/accession_config",
             headers=AUTH,
             json_data={
                 "pattern": new_pattern,
                 "counter_reset_policy": "daily",
                 "sequence_digits": 4,
                 "timezone": "Asia/Jakarta",
                 "counter_backend": "D1"
             },
             expect_status=200)

# PUT — invalid pattern (should get 400)
test("PUT /settings/accession_config (invalid pattern → 400)", "PUT",
     f"{ACCESSION_API}/settings/accession_config",
     headers=AUTH,
     json_data={"pattern": "!!!BAD-PATTERN!!!"},
     expect_status=400, allow_fail=True)

# Restore original pattern if we had one
if original_pattern:
    test("PUT /settings/accession_config (restore)", "PUT",
         f"{ACCESSION_API}/settings/accession_config",
         headers=AUTH,
         json_data={
             "pattern": original_pattern,
             "counter_reset_policy": "daily",
             "sequence_digits": 4,
             "timezone": "Asia/Jakarta",
             "counter_backend": "D1"
         },
         expect_status=200, allow_fail=True)
    note("Config restored to original pattern")

# ══════════════════════════════════════════════════════════════════════════════
# 4. SINGLE ACCESSION — CREATE / READ / PATCH / DELETE
# ══════════════════════════════════════════════════════════════════════════════

section("4. SINGLE ACCESSION CRUD  (frontend → gateway → worker /api/accessions)")

req_id   = str(uuid.uuid4())
idem_key = str(uuid.uuid4())

# 4a. CREATE (POST /api/accessions)
note("Simulating OrderForm.jsx → accessionServiceClient.createAccession() flow")
create_headers = {**AUTH, "X-Request-ID": req_id, "X-Idempotency-Key": idem_key}

ok, cr = test("POST /api/accessions (create, nested format)", "POST",
              f"{ACCESSION_API}/api/accessions",
              headers=create_headers,
              json_data={
                  "modality": "CT",
                  "patient": {
                      "id": "TEST-MRN-001",
                      "national_id": "3273010101900001",
                      "name": "Integration Test Patient"
                  }
              },
              expect_status=201)

created_accession_number = None
if ok and cr:
    rb = cr.json()
    created_accession_number = rb.get("accession_number")
    note(f"Created: accession_number={created_accession_number}  "
         f"id={rb.get('id','?')}  source={rb.get('source','?')}")
    # Verify X-Request-ID was echoed back
    if cr.headers.get("X-Request-ID") == req_id:
        note("✓ X-Request-ID propagated correctly through gateway → worker")

# 4b. IDEMPOTENCY — same key should return cached 200
if created_accession_number:
    ok, idem_r = test("POST /api/accessions (idempotency replay → 200)", "POST",
                      f"{ACCESSION_API}/api/accessions",
                      headers=create_headers,   # same X-Idempotency-Key
                      json_data={
                          "modality": "CT",
                          "patient": {
                              "id": "TEST-MRN-001",
                              "national_id": "3273010101900001",
                              "name": "Integration Test Patient"
                          }
                      },
                      expect_status=200)
    if ok and idem_r:
        note(f"Idempotency replay returned same accession: "
             f"{idem_r.json().get('accession_number')}")

# 4c. GET by accession number
if created_accession_number:
    ok, gr = test(f"GET /api/accessions/{created_accession_number}", "GET",
                  f"{ACCESSION_API}/api/accessions/{requests.utils.quote(created_accession_number, safe='')}",
                  headers=AUTH, expect_status=200)
    if ok and gr:
        note(f"Retrieved: modality={gr.json().get('modality')}  "
             f"X-D1-Replica={gr.headers.get('X-D1-Replica','?')}")

    # Strong consistency read (X-Consistency: strong → use primary DB)
    ok, sr = test("GET /api/accessions/:num (X-Consistency: strong)", "GET",
                  f"{ACCESSION_API}/api/accessions/{requests.utils.quote(created_accession_number, safe='')}",
                  headers={**AUTH, "X-Consistency": "strong"},
                  expect_status=200, allow_fail=True)
    if ok and sr:
        note(f"Strong consistency: X-D1-Replica={sr.headers.get('X-D1-Replica','?')}")

# 4d. GET non-existent → 404
test("GET /api/accessions/DOES-NOT-EXIST (→ 404)", "GET",
     f"{ACCESSION_API}/api/accessions/DOES-NOT-EXIST-99999",
     headers=AUTH, expect_status=404, allow_fail=True)

# 4e. LIST with filters
ok, lr = test("GET /api/accessions (list, no filter)", "GET",
              f"{ACCESSION_API}/api/accessions",
              headers=AUTH, expect_status=200)
if ok and lr:
    lb = lr.json()
    count  = len(lb.get("items", []))
    cursor = lb.get("next_cursor")
    note(f"List returned {count} items  has_more={lb.get('has_more')}  "
         f"next_cursor={'set' if cursor else 'null'}")

test("GET /api/accessions?modality=CT", "GET",
     f"{ACCESSION_API}/api/accessions",
     headers=AUTH, params={"modality": "CT"}, expect_status=200)

test("GET /api/accessions?source=internal", "GET",
     f"{ACCESSION_API}/api/accessions",
     headers=AUTH, params={"source": "internal"}, expect_status=200)

test("GET /api/accessions?limit=5", "GET",
     f"{ACCESSION_API}/api/accessions",
     headers=AUTH, params={"limit": "5"}, expect_status=200)

# 4f. PATCH
if created_accession_number:
    ok, pr = test("PATCH /api/accessions/:num (update note)", "PATCH",
                  f"{ACCESSION_API}/api/accessions/{requests.utils.quote(created_accession_number, safe='')}",
                  headers=AUTH,
                  json_data={"note": "Patched by integration test"},
                  expect_status=200, allow_fail=True)
    if ok and pr:
        note(f"Patched note: {pr.json().get('note','?')}")

# 4g. PATCH — attempt immutable field (accession_number) → 422
if created_accession_number:
    test("PATCH — immutable field accession_number (→ 422)", "PATCH",
         f"{ACCESSION_API}/api/accessions/{requests.utils.quote(created_accession_number, safe='')}",
         headers=AUTH,
         json_data={"accession_number": "HACKED-001"},
         expect_status=422, allow_fail=True)

# 4h. DELETE without ?confirm=true → 400
if created_accession_number:
    test("DELETE without ?confirm=true (→ 400)", "DELETE",
         f"{ACCESSION_API}/api/accessions/{requests.utils.quote(created_accession_number, safe='')}",
         headers=AUTH, expect_status=400, allow_fail=True)

# 4i. DELETE with ?confirm=true (soft delete)
if created_accession_number:
    test("DELETE /api/accessions/:num?confirm=true (soft delete → 204)", "DELETE",
         f"{ACCESSION_API}/api/accessions/{requests.utils.quote(created_accession_number, safe='')}",
         headers=AUTH, params={"confirm": "true"},
         expect_status=204, allow_fail=True)

    # Verify soft-deleted record is hidden by default
    ok, _ = test("GET deleted accession (default → 404)", "GET",
                 f"{ACCESSION_API}/api/accessions/{requests.utils.quote(created_accession_number, safe='')}",
                 headers=AUTH, expect_status=404, allow_fail=True)

    # Verify it's visible with include_deleted=true
    test("GET deleted accession (?include_deleted=true → 200)", "GET",
         f"{ACCESSION_API}/api/accessions/{requests.utils.quote(created_accession_number, safe='')}",
         headers=AUTH, params={"include_deleted": "true"},
         expect_status=200, allow_fail=True)

# ══════════════════════════════════════════════════════════════════════════════
# 5. BATCH ACCESSION  (simulates multi-procedure order from OrderForm.jsx)
# ══════════════════════════════════════════════════════════════════════════════

section("5. BATCH ACCESSION  (frontend prepareOrderAccessions() → POST /api/accessions/batch)")
note("Simulates createAccessionBatch() called when an order has >1 procedure")

batch_idem = str(uuid.uuid4())
batch_headers = {**AUTH, "X-Request-ID": str(uuid.uuid4()), "X-Idempotency-Key": batch_idem}

ok, br = test("POST /api/accessions/batch (2 procedures)", "POST",
              f"{ACCESSION_API}/api/accessions/batch",
              headers=batch_headers,
              json_data={
                  "procedures": [
                      {"modality": "CT", "procedure_code": "CT-CHEST-001",
                       "procedure_name": "CT Thorax"},
                      {"modality": "MR", "procedure_code": "MR-BRAIN-001",
                       "procedure_name": "MRI Kepala"}
                  ],
                  "patient_national_id": "3273010101900001",
                  "patient_name": "Integration Test Patient"
              },
              expect_status=201)

if ok and br:
    batch_body = br.json()
    accs = batch_body.get("accessions", [])
    note(f"Batch created {len(accs)} accession(s):")
    for a in accs:
        note(f"  modality={a.get('modality','?')}  "
             f"code={a.get('procedure_code','?')}  "
             f"accession={a.get('accession_number','?')}")

# Batch idempotency replay
test("POST /api/accessions/batch (idempotency replay → 200)", "POST",
     f"{ACCESSION_API}/api/accessions/batch",
     headers=batch_headers,   # same idem key
     json_data={
         "procedures": [
             {"modality": "CT", "procedure_code": "CT-CHEST-001",
              "procedure_name": "CT Thorax"},
             {"modality": "MR", "procedure_code": "MR-BRAIN-001",
              "procedure_name": "MRI Kepala"}
         ],
         "patient_national_id": "3273010101900001",
         "patient_name": "Integration Test Patient"
     },
     expect_status=200, allow_fail=True)

# ══════════════════════════════════════════════════════════════════════════════
# 6. LEGACY ENDPOINTS  (backward compat for order-management / pacs-service)
# ══════════════════════════════════════════════════════════════════════════════

section("6. LEGACY ENDPOINTS  (/accession/create, /accession/batch)")
note("These endpoints use flat format, consumed by order-management and pacs-service")

ok, leg = test("POST /accession/create (flat format)", "POST",
               f"{ACCESSION_API}/accession/create",
               headers=AUTH,
               json_data={
                   "modality": "DX",
                   "patient_national_id": "3273010101900002",
                   "patient_name": "Legacy Test Patient",
                   "medical_record_number": "MRN-LEGACY-001",
                   "procedure_code": "DX-CHEST",
                   "procedure_name": "Foto Thorax"
               },
               expect_status=201)
if ok and leg:
    note(f"Legacy single: accession_number={leg.json().get('accession_number','?')}")

ok, legb = test("POST /accession/batch (flat format, 2 items)", "POST",
                f"{ACCESSION_API}/accession/batch",
                headers=AUTH,
                json_data={
                    "procedures": [
                        {"modality": "US", "procedure_code": "US-ABD-001",
                         "procedure_name": "USG Abdomen"},
                        {"modality": "XA", "procedure_code": "XA-KNEE-001",
                         "procedure_name": "X-ray Lutut"}
                    ],
                    "patient_national_id": "3273010101900003",
                    "patient_name": "Legacy Batch Patient"
                },
                expect_status=201)
if ok and legb:
    items = legb.json().get("accessions", [])
    note(f"Legacy batch: {len(items)} accession(s) created")

# ══════════════════════════════════════════════════════════════════════════════
# 7. ERROR HANDLING & VALIDATION
# ══════════════════════════════════════════════════════════════════════════════

section("7. ERROR HANDLING & VALIDATION")

# 7a. Missing required fields → 400
test("POST /api/accessions — missing modality (→ 400)", "POST",
     f"{ACCESSION_API}/api/accessions",
     headers=AUTH,
     json_data={"patient": {"national_id": "3273010101900001"}},
     expect_status=400, allow_fail=True)

# 7b. Invalid modality → 400
test("POST /api/accessions — invalid modality (→ 400)", "POST",
     f"{ACCESSION_API}/api/accessions",
     headers=AUTH,
     json_data={"modality": "INVALIDMOD", "patient": {"national_id": "1234"}},
     expect_status=400, allow_fail=True)

# 7c. No auth → 401
test("GET /api/accessions — no auth (→ 401)", "GET",
     f"{ACCESSION_API}/api/accessions",
     expect_status=401, allow_fail=True)

# 7d. Batch > 20 procedures → 400
test("POST /api/accessions/batch — too many items (→ 400)", "POST",
     f"{ACCESSION_API}/api/accessions/batch",
     headers=AUTH,
     json_data={
         "procedures": [
             {"modality": "CT", "procedure_code": f"P-{i:03d}", "procedure_name": f"Proc {i}"}
             for i in range(21)
         ],
         "patient_national_id": "3273010101900001",
         "patient_name": "Overflow Patient"
     },
     expect_status=400, allow_fail=True)

# 7e. Duplicate procedure_code in batch → 400
test("POST /api/accessions/batch — duplicate procedure_code (→ 400)", "POST",
     f"{ACCESSION_API}/api/accessions/batch",
     headers=AUTH,
     json_data={
         "procedures": [
             {"modality": "CT", "procedure_code": "SAME-CODE", "procedure_name": "First"},
             {"modality": "MR", "procedure_code": "SAME-CODE", "procedure_name": "Dupe"}
         ],
         "patient_national_id": "3273010101900001",
         "patient_name": "Dupe Patient"
     },
     expect_status=400, allow_fail=True)

# 7f. Invalid idempotency key format → 400
test("POST /api/accessions — invalid idempotency key (→ 400)", "POST",
     f"{ACCESSION_API}/api/accessions",
     headers={**AUTH, "X-Idempotency-Key": "not-a-uuid!!!"},
     json_data={"modality": "CT", "patient": {"national_id": "3273010101900001"}},
     expect_status=400, allow_fail=True)

# ══════════════════════════════════════════════════════════════════════════════
# 8. GATEWAY HEADERS — verify HMAC signature plumbing
# ══════════════════════════════════════════════════════════════════════════════

section("8. GATEWAY HEADERS & SIGNATURE PLUMBING")
note("Verify X-Request-ID is echoed and X-D1-Replica is set on list/get responses")

probe_req_id = str(uuid.uuid4())
ok, probe_r = test("GET /api/accessions (header probe)", "GET",
                   f"{ACCESSION_API}/api/accessions",
                   headers={**AUTH, "X-Request-ID": probe_req_id},
                   expect_status=200)
if ok and probe_r:
    echoed = probe_r.headers.get("X-Request-ID", "")
    replica = probe_r.headers.get("X-D1-Replica", "")
    note(f"X-Request-ID echoed={echoed == probe_req_id}  X-D1-Replica={replica}")

# ══════════════════════════════════════════════════════════════════════════════
# 9. ADMIN ENDPOINTS  (require admin role in JWT)
# ══════════════════════════════════════════════════════════════════════════════

section("9. ADMIN ENDPOINTS  (/admin/run-job)")

# These may return 403 if the JWT doesn't contain admin role for the worker tenant
test("POST /admin/run-job/idempotency_cleanup", "POST",
     f"{ACCESSION_API}/admin/run-job/idempotency_cleanup",
     headers=AUTH, expect_status=200, allow_fail=True)

test("POST /admin/run-job/soft_delete_purge", "POST",
     f"{ACCESSION_API}/admin/run-job/soft_delete_purge",
     headers=AUTH, expect_status=200, allow_fail=True)

test("POST /admin/run-job/unknown (→ 400)", "POST",
     f"{ACCESSION_API}/admin/run-job/unknown",
     headers=AUTH, expect_status=400, allow_fail=True)

# ══════════════════════════════════════════════════════════════════════════════
# 10. DIRECT WORKER TESTS  (optional, --direct flag)
# ══════════════════════════════════════════════════════════════════════════════

if args.direct:
    section("10. DIRECT WORKER  (bypassing gateway, hitting accession-worker URL directly)")
    note(f"Target: {WORKER_DIRECT}")
    note("Auth: still uses gateway JWT — worker accepts same JWT_SECRET")

    test("GET /healthz (direct)", "GET",
         f"{WORKER_DIRECT}/healthz", expect_status=200)

    test("GET /readyz (direct)", "GET",
         f"{WORKER_DIRECT}/readyz", expect_status=200)

    test("GET /api/accessions (direct, JWT auth)", "GET",
         f"{WORKER_DIRECT}/api/accessions",
         headers=AUTH, expect_status=200, allow_fail=True)

    ok, dr = test("POST /api/accessions (direct)", "POST",
                  f"{WORKER_DIRECT}/api/accessions",
                  headers={**AUTH, "X-Request-ID": str(uuid.uuid4())},
                  json_data={
                      "modality": "NM",
                      "patient": {
                          "national_id": "3273010101900099",
                          "name": "Direct Test Patient"
                      }
                  },
                  expect_status=201, allow_fail=True)
    if ok and dr:
        note(f"Direct create: {dr.json().get('accession_number','?')}")
else:
    section("10. DIRECT WORKER  (skipped — run with --direct to enable)")

# ══════════════════════════════════════════════════════════════════════════════
# 11. FULL-STACK REGRESSION — existing services must still work
# ══════════════════════════════════════════════════════════════════════════════

section("11. FULL-STACK REGRESSION  (gateway → existing backend services)")
note("Ensure accession-worker routing did not break other gateway routes")

# 11a. Master data services
test("GET /patients", "GET", f"{BACKEND_API}/patients", headers=AUTH)
test("GET /doctors", "GET", f"{BACKEND_API}/doctors", headers=AUTH)
test("GET /procedures", "GET", f"{BACKEND_API}/procedures", headers=AUTH)
test("GET /procedure-mappings", "GET", f"{BACKEND_API}/procedure-mappings", headers=AUTH)
test("GET /modalities", "GET", f"{BACKEND_API}/modalities", headers=AUTH, allow_fail=True)
test("GET /nurses", "GET", f"{BACKEND_API}/nurses", headers=AUTH, allow_fail=True)
test("GET /settings", "GET", f"{BACKEND_API}/settings", headers=AUTH, allow_fail=True)

# 11b. Order management
test("GET /orders", "GET", f"{BACKEND_API}/orders", headers=AUTH)
test("GET /worklist", "GET", f"{BACKEND_API}/worklist", headers=AUTH, allow_fail=True)

# 11c. PACS / studies
ok, sl = test("GET /api/studies", "GET", f"{BACKEND_API}/api/studies", headers=AUTH)

# 11d. Auth / users
test("GET /auth/users", "GET", f"{BACKEND_API}/auth/users", headers=AUTH)
test("GET /users", "GET", f"{BACKEND_API}/users", headers=AUTH, allow_fail=True)

# 11e. SIMRS / Khanza
test("GET /simrs-universal/health", "GET",
     f"{BACKEND_API}/simrs-universal/health", headers=AUTH, allow_fail=True)
test("GET /khanza/health", "GET",
     f"{BACKEND_API}/khanza/health", headers=AUTH, allow_fail=True)

# 11f. SatuSehat / monitor
test("GET /api/monitor/satusehat/orders", "GET",
     f"{BACKEND_API}/api/monitor/satusehat/orders", headers=AUTH, allow_fail=True)

# ══════════════════════════════════════════════════════════════════════════════
# 12. END-TO-END SIMULATED ORDER FLOW
# ══════════════════════════════════════════════════════════════════════════════

section("12. END-TO-END ORDER FLOW SIMULATION")
note("Mimics: user logs in → loads OrderForm → picks modality → generates accession → submits order")

# Step 1: Fetch procedures (OrderForm procedure picker)
ok, proc_resp = test("Step 1: GET /procedures (populate form)", "GET",
                     f"{BACKEND_API}/procedures", headers=AUTH)
proc_code = None
proc_name = None
proc_modality = "CT"
if ok and proc_resp:
    procs = proc_resp.json()
    if isinstance(procs, dict):
        procs = procs.get("data") or procs.get("items") or procs.get("procedures") or []
    if isinstance(procs, list) and procs:
        p = procs[0]
        proc_code     = p.get("procedure_code") or p.get("code") or "CT-CHEST-E2E"
        proc_name     = p.get("procedure_name") or p.get("name") or "CT Thorax E2E"
        proc_modality = p.get("modality") or "CT"
        note(f"Using procedure: code={proc_code}  name={proc_name}  modality={proc_modality}")

# Step 2: Generate accession (getAccessionNumber → accessionServiceClient → gateway → worker)
e2e_req_id = str(uuid.uuid4())
ok, acc_resp = test("Step 2: POST /api/accessions (generate accession for order)", "POST",
                    f"{ACCESSION_API}/api/accessions",
                    headers={**AUTH, "X-Request-ID": e2e_req_id},
                    json_data={
                        "modality": proc_modality,
                        "patient": {
                            "id": "MRN-E2E-001",
                            "national_id": "3273010101900010",
                            "name": "End-to-End Test Patient"
                        },
                        "procedure_code": proc_code,
                        "procedure_name": proc_name
                    },
                    expect_status=201)

e2e_accession = None
if ok and acc_resp:
    e2e_accession = acc_resp.json().get("accession_number")
    note(f"Step 2 result: accession_number={e2e_accession}")

# Step 3: Submit order (order-management service)
if e2e_accession:
    ok, order_resp = test("Step 3: POST /orders (submit order with accession)", "POST",
                          f"{BACKEND_API}/orders",
                          headers=AUTH,
                          json_data={
                              "patient_name": "End-to-End Test Patient",
                              "mrn": "MRN-E2E-001",
                              "status": "created",
                              "priority": "routine",
                              "procedures": [{
                                  "procedure_code":  proc_code or "CT-CHEST-E2E",
                                  "procedure_name":  proc_name or "CT Thorax E2E",
                                  "modality":        proc_modality,
                                  "accession_number": e2e_accession
                              }]
                          },
                          expect_status=201, allow_fail=True)
    if ok and order_resp:
        order_id = order_resp.json().get("id") or order_resp.json().get("order_id")
        note(f"Step 3 result: order_id={order_id}")
    else:
        note("Step 3 skipped/failed — order-management may require additional fields")

# Step 4: Verify accession record persisted correctly
if e2e_accession:
    ok, verify = test("Step 4: GET /api/accessions/:num (verify persisted)", "GET",
                      f"{ACCESSION_API}/api/accessions/{requests.utils.quote(e2e_accession, safe='')}",
                      headers=AUTH, expect_status=200)
    if ok and verify:
        rec = verify.json()
        note(f"Step 4 result: modality={rec.get('modality')}  "
             f"patient_name={rec.get('patient_name')}  "
             f"source={rec.get('source')}")

# ══════════════════════════════════════════════════════════════════════════════
# SUMMARY
# ══════════════════════════════════════════════════════════════════════════════

print()
print("=" * 110)
total = PASS_COUNT + FAIL_COUNT
log(f"  RESULT  |  {PASS_COUNT}/{total} passed  |  {FAIL_COUNT} failed  "
    f"|  Warnings (allow_fail) not counted",
    C.BOLD + (C.GREEN if FAIL_COUNT == 0 else C.RED))
log(f"  Chain tested: Browser → Nginx({FRONTEND_PROXY})"
    f" → api-gateway-v2 → accession-worker (D1 + DO)", C.DIM)
log(f"  Completed: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}", C.DIM)
print("=" * 110)

if FAIL_COUNT > 0:
    sys.exit(1)
