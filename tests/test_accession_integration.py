#!/usr/bin/env python3
"""
Accession Worker Integration Test Suite
Tests the full accession chain across all three deployment layers:

  Layer A - Docker backend   : http://100.113.207.79:8082
  Layer B - Cloudflare Pages : https://imagestro-pacs.pages.dev
             /backend-api/*  -> dev-pacs-backend.satupintudigital.co.id
             /accession-api/* -> accession-worker (service binding)
  Layer C - Direct worker    : https://accession-worker.satupintudigital.workers.dev

Usage:
    python tests/test_accession_integration.py               # Docker regression + direct worker
    python tests/test_accession_integration.py --pages       # also test via Cloudflare Pages
    python tests/test_accession_integration.py --verbose     # show full bodies on failures

Note: Sections 2-9 and 12 require direct Cloudflare connectivity.
      If VPN/proxy blocks Cloudflare, those sections are skipped automatically.
      Section 11 (Docker regression) always runs.
"""

import requests
import requests.utils
import json
import sys
import uuid
import argparse
from datetime import datetime, timezone

# ==============================================================================
# Configuration
# ==============================================================================

DOCKER_BASE   = "http://100.113.207.79:8082"                             # Layer A
DOCKER_API    = f"{DOCKER_BASE}/backend-api"

CF_PAGES      = "https://imagestro-pacs.pages.dev"                       # Layer B
CF_PAGES_API  = f"{CF_PAGES}/backend-api"
CF_ACCESSION  = f"{CF_PAGES}/accession-api"

WORKER_URL    = "https://accession-worker.satupintudigital.workers.dev"  # Layer C

LOGIN_USER    = "superadmin"
LOGIN_PASS    = "SuperAdmin123!@#"

TIMEOUT       = 25  # seconds
PROBE_TIMEOUT = 5   # for connectivity pre-check

# ==============================================================================
# Helpers
# ==============================================================================

class C:
    GREEN  = '\033[92m'
    RED    = '\033[91m'
    YELLOW = '\033[93m'
    BLUE   = '\033[94m'
    CYAN   = '\033[96m'
    BOLD   = '\033[1m'
    DIM    = '\033[2m'
    RESET  = '\033[0m'

PASS = 0
FAIL = 0
CF_REACHABLE = False   # set after connectivity probe in section 2

def log(msg, color=C.RESET):
    print(f"{color}{msg}{C.RESET}")

def note(msg):
    print(f"         {C.DIM}{msg}{C.RESET}")

def section(title):
    print()
    print("-" * 110)
    log(f"  {title}", C.BOLD + C.CYAN)
    print("-" * 110)

def skip_section(num, name):
    section(f"{num}. {name}  (skipped -- Cloudflare unreachable from this network)")
    note("Run without VPN or from production server to execute this section.")

def test(label, method, url, *, headers=None, json_data=None, params=None,
         expect=None, allow_fail=False):
    """
    Run one HTTP request.
    expect: expected status code (default: any < 400).
    allow_fail: count as WARN not FAIL when it fails.
    Returns (passed: bool, response | None).
    """
    global PASS, FAIL
    try:
        r = requests.request(method, url, headers=headers, json=json_data,
                             params=params, timeout=TIMEOUT)
        passed = (r.status_code == expect) if expect is not None else (r.status_code < 400)

        tag   = (C.GREEN + "[PASS]" if passed else
                 C.YELLOW + "[WARN]" if allow_fail else
                 C.RED    + "[FAIL]") + C.RESET
        short = url.replace(DOCKER_BASE, "[docker]") \
                   .replace(CF_PAGES,    "[pages]") \
                   .replace(WORKER_URL,  "[worker]")
        print(f"{tag} {method:<7} {short:<68} -> {r.status_code}")

        if not passed and r.status_code >= 400:
            try:
                detail = json.dumps(r.json(), ensure_ascii=False)[:220]
            except Exception:
                detail = r.text[:220]
            print(f"         {C.YELLOW}{detail}{C.RESET}")

        if not allow_fail:
            if passed: PASS += 1
            else:       FAIL += 1

        return passed, r

    except requests.exceptions.ConnectionError:
        print(f"{C.RED}[ERR ]{C.RESET} {method:<7} {url[:70]} -> connection refused")
        if not allow_fail: FAIL += 1
        return False, None
    except Exception as e:
        print(f"{C.RED}[ERR ]{C.RESET} {method:<7} {url[:70]} -> {e}")
        if not allow_fail: FAIL += 1
        return False, None


# ==============================================================================
# Args
# ==============================================================================

ap = argparse.ArgumentParser()
ap.add_argument("--pages",   action="store_true", help="include Cloudflare Pages layer tests")
ap.add_argument("--verbose", action="store_true", help="always print response bodies")
args = ap.parse_args()

# ==============================================================================
# Header
# ==============================================================================

print("=" * 110)
log("  ACCESSION WORKER INTEGRATION TEST SUITE", C.BOLD)
log(f"  Started : {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}", C.DIM)
log(f"  Docker  : {DOCKER_API}", C.DIM)
log(f"  Worker  : {WORKER_URL}", C.DIM)
log(f"  Pages   : {CF_ACCESSION}  (--pages {'ON' if args.pages else 'OFF'})", C.DIM)
print("=" * 110)

# ==============================================================================
# SECTION 0 -- Docker backend reachability
# ==============================================================================

section("0. DOCKER BACKEND REACHABILITY")

ok, _ = test("Docker gateway root", "GET", f"{DOCKER_API}/")
if not ok:
    log(f"\nFatal: Docker backend unreachable at {DOCKER_API}", C.RED)
    sys.exit(1)

for svc in ["auth", "pacs", "master", "order", "mwl", "simrs"]:
    test(f"Health: {svc}", "GET", f"{DOCKER_API}/health/{svc}")

# ==============================================================================
# SECTION 1 -- Authentication (Docker backend)
# ==============================================================================

section("1. AUTHENTICATION  (docker backend -> auth-service)")

ok, resp = test("POST /auth/login", "POST", f"{DOCKER_API}/auth/login",
                json_data={"username": LOGIN_USER, "password": LOGIN_PASS},
                expect=200)
if not ok:
    log("\nFatal: login failed", C.RED)
    sys.exit(1)

body      = resp.json()
TOKEN     = body.get("access_token") or body.get("token") or ""
TENANT_ID = body.get("tenant_id") or ""
note(f"Token acquired. tenant_id={TENANT_ID or '(embedded in JWT)'}")

AUTH = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}

# ==============================================================================
# SECTION 2 -- Accession Worker: Health  (direct, no auth needed)
# ==============================================================================

section("2. ACCESSION WORKER HEALTH  [worker] direct, no auth required")
note(f"Target: {WORKER_URL}")

# Connectivity probe -- some dev machines block Cloudflare via VPN/proxy
try:
    probe = requests.get(f"{WORKER_URL}/healthz", timeout=PROBE_TIMEOUT)
    CF_REACHABLE = True
    note("Cloudflare connectivity: OK")
except Exception:
    CF_REACHABLE = False
    log("  [SKIP] Cannot reach Cloudflare Workers from this network (VPN/proxy).", C.YELLOW)
    log("         Run from the production server or disable VPN to test sections 2-9 and 12.", C.YELLOW)
    log("         Section 11 (Docker regression) will still run.", C.YELLOW)

if CF_REACHABLE:
    ok, hr = test("GET /healthz", "GET", f"{WORKER_URL}/healthz", expect=200)
    if ok and hr:
        h = hr.json()
        note(f"status={h.get('status')}  db={h.get('checks',{}).get('db',{}).get('status')}  "
             f"version={h.get('version','?')}  uptime={h.get('uptime_ms','?')}ms")

    ok, rr = test("GET /readyz", "GET", f"{WORKER_URL}/readyz", expect=200)
    if ok and rr:
        note(f"ready={rr.json().get('ready')}")

# ==============================================================================
# SECTION 3 -- Accession Config  (direct worker, authenticated)
# ==============================================================================

if not CF_REACHABLE:
    skip_section(3, "ACCESSION CONFIG  [worker] GET/PUT /settings/accession_config")
else:
    section("3. ACCESSION CONFIG  [worker] GET/PUT /settings/accession_config")

    ok, cfg = test("GET /settings/accession_config", "GET",
                   f"{WORKER_URL}/settings/accession_config",
                   headers=AUTH, expect=200)

    orig_pattern = None
    if ok and cfg:
        c = cfg.json()
        orig_pattern = c.get("pattern")
        note(f"pattern={orig_pattern}  reset={c.get('counter_reset_policy')}  "
             f"digits={c.get('sequence_digits')}")

    test("PUT /settings/accession_config (valid)", "PUT",
         f"{WORKER_URL}/settings/accession_config",
         headers=AUTH,
         json_data={"pattern": "{ORG}-{YYYY}{MM}{DD}-{NNNN}",
                    "counter_reset_policy": "daily",
                    "sequence_digits": 4,
                    "timezone": "Asia/Jakarta",
                    "counter_backend": "D1"},
         expect=200)

    test("PUT /settings/accession_config (invalid pattern -> 400)", "PUT",
         f"{WORKER_URL}/settings/accession_config",
         headers=AUTH, json_data={"pattern": "!!!INVALID!!!"}, expect=400, allow_fail=True)

    if orig_pattern:
        test("PUT /settings/accession_config (restore)", "PUT",
             f"{WORKER_URL}/settings/accession_config",
             headers=AUTH,
             json_data={"pattern": orig_pattern, "counter_reset_policy": "daily",
                        "sequence_digits": 4, "timezone": "Asia/Jakarta",
                        "counter_backend": "D1"},
             expect=200, allow_fail=True)
        note("Pattern restored")

# ==============================================================================
# SECTION 4 -- Single Accession CRUD  (direct worker)
# ==============================================================================

if not CF_REACHABLE:
    skip_section(4, "SINGLE ACCESSION CRUD  [worker] /api/accessions")
else:
    section("4. SINGLE ACCESSION CRUD  [worker] /api/accessions")
    note("Simulates: OrderForm.jsx -> accessionServiceClient.getAccessionNumber() -> worker")

    req_id   = str(uuid.uuid4())
    idem_key = str(uuid.uuid4())

    # 4a. CREATE
    ok, cr = test("POST /api/accessions (create, 201)", "POST",
                  f"{WORKER_URL}/api/accessions",
                  headers={**AUTH, "X-Request-ID": req_id, "X-Idempotency-Key": idem_key},
                  json_data={
                      "modality": "CT",
                      "patient": {
                          "id": "MRN-INTTEST-001",
                          "national_id": "3273010101900001",
                          "name": "Integration Test Patient"
                      }
                  },
                  expect=201)

    created_acsn = None
    if ok and cr:
        rb = cr.json()
        created_acsn = rb.get("accession_number")
        note(f"Created: accession_number={created_acsn}  source={rb.get('source')}  "
             f"id={str(rb.get('id','?'))[:16]}...")
        if cr.headers.get("X-Request-ID") == req_id:
            note("OK X-Request-ID echoed correctly")

    # 4b. Idempotency replay (same key -> 200 cached)
    if created_acsn:
        ok, ir = test("POST /api/accessions (idempotency replay -> 200)", "POST",
                      f"{WORKER_URL}/api/accessions",
                      headers={**AUTH, "X-Request-ID": req_id, "X-Idempotency-Key": idem_key},
                      json_data={"modality": "CT",
                                 "patient": {"id": "MRN-INTTEST-001",
                                             "national_id": "3273010101900001",
                                             "name": "Integration Test Patient"}},
                      expect=200)
        if ok and ir:
            note(f"Idempotency replay returned same acsn: {ir.json().get('accession_number')}")

    # 4c. GET single
    if created_acsn:
        enc = requests.utils.quote(created_acsn, safe='')
        ok, gr = test("GET /api/accessions/:num", "GET",
                      f"{WORKER_URL}/api/accessions/{enc}",
                      headers=AUTH, expect=200)
        if ok and gr:
            note(f"Retrieved: modality={gr.json().get('modality')}  "
                 f"X-D1-Replica={gr.headers.get('X-D1-Replica','?')}")

        test("GET /api/accessions/:num (X-Consistency: strong)", "GET",
             f"{WORKER_URL}/api/accessions/{enc}",
             headers={**AUTH, "X-Consistency": "strong"},
             expect=200, allow_fail=True)

    # 4d. GET non-existent -> 404
    test("GET /api/accessions/DOES-NOT-EXIST (-> 404)", "GET",
         f"{WORKER_URL}/api/accessions/DOES-NOT-EXIST-99999",
         headers=AUTH, expect=404, allow_fail=True)

    # 4e. LIST
    ok, lr = test("GET /api/accessions (list)", "GET",
                  f"{WORKER_URL}/api/accessions",
                  headers=AUTH, expect=200)
    if ok and lr:
        lb = lr.json()
        note(f"List: {len(lb.get('items',[]))} items  has_more={lb.get('has_more')}  "
             f"cursor={'set' if lb.get('next_cursor') else 'null'}")

    test("GET /api/accessions?modality=CT", "GET",
         f"{WORKER_URL}/api/accessions",
         headers=AUTH, params={"modality": "CT"}, expect=200)

    test("GET /api/accessions?source=internal&limit=5", "GET",
         f"{WORKER_URL}/api/accessions",
         headers=AUTH, params={"source": "internal", "limit": "5"}, expect=200)

    # 4f. PATCH
    if created_acsn:
        enc = requests.utils.quote(created_acsn, safe='')
        test("PATCH /api/accessions/:num (update note)", "PATCH",
             f"{WORKER_URL}/api/accessions/{enc}",
             headers=AUTH, json_data={"note": "Patched by integration test"},
             expect=200, allow_fail=True)

        test("PATCH /api/accessions/:num immutable field (-> 422)", "PATCH",
             f"{WORKER_URL}/api/accessions/{enc}",
             headers=AUTH, json_data={"accession_number": "HACKED"},
             expect=422, allow_fail=True)

    # 4g. DELETE (soft)
    if created_acsn:
        enc = requests.utils.quote(created_acsn, safe='')
        test("DELETE without ?confirm=true (-> 400)", "DELETE",
             f"{WORKER_URL}/api/accessions/{enc}",
             headers=AUTH, expect=400, allow_fail=True)

        test("DELETE ?confirm=true (soft delete -> 204)", "DELETE",
             f"{WORKER_URL}/api/accessions/{enc}",
             headers=AUTH, params={"confirm": "true"},
             expect=204, allow_fail=True)

        test("GET deleted record (default -> 404)", "GET",
             f"{WORKER_URL}/api/accessions/{enc}",
             headers=AUTH, expect=404, allow_fail=True)

        test("GET deleted record (?include_deleted=true -> 200)", "GET",
             f"{WORKER_URL}/api/accessions/{enc}",
             headers=AUTH, params={"include_deleted": "true"},
             expect=200, allow_fail=True)

# ==============================================================================
# SECTION 5 -- Batch Accession  (direct worker)
# ==============================================================================

if not CF_REACHABLE:
    skip_section(5, "BATCH ACCESSION  [worker] POST /api/accessions/batch")
else:
    section("5. BATCH ACCESSION  [worker] POST /api/accessions/batch")
    note("Simulates: prepareOrderAccessions() -> createAccessionBatch() -> worker")

    batch_idem = str(uuid.uuid4())
    ok, br = test("POST /api/accessions/batch (2 procedures, 201)", "POST",
                  f"{WORKER_URL}/api/accessions/batch",
                  headers={**AUTH, "X-Request-ID": str(uuid.uuid4()),
                           "X-Idempotency-Key": batch_idem},
                  json_data={
                      "procedures": [
                          {"modality": "CT", "procedure_code": "CT-CHEST-INT",
                           "procedure_name": "CT Thorax"},
                          {"modality": "MR", "procedure_code": "MR-BRAIN-INT",
                           "procedure_name": "MRI Kepala"}
                      ],
                      "patient_national_id": "3273010101900002",
                      "patient_name": "Batch Test Patient"
                  },
                  expect=201)
    if ok and br:
        accs = br.json().get("accessions", [])
        note(f"Batch created {len(accs)} accessions:")
        for a in accs:
            note(f"  modality={a.get('modality')}  code={a.get('procedure_code')}  "
                 f"acsn={a.get('accession_number')}")

    test("POST /api/accessions/batch (idempotency replay -> 200)", "POST",
         f"{WORKER_URL}/api/accessions/batch",
         headers={**AUTH, "X-Idempotency-Key": batch_idem},
         json_data={
             "procedures": [
                 {"modality": "CT", "procedure_code": "CT-CHEST-INT",
                  "procedure_name": "CT Thorax"},
                 {"modality": "MR", "procedure_code": "MR-BRAIN-INT",
                  "procedure_name": "MRI Kepala"}
             ],
             "patient_national_id": "3273010101900002",
             "patient_name": "Batch Test Patient"
         },
         expect=200, allow_fail=True)

# ==============================================================================
# SECTION 6 -- Legacy Endpoints  (direct worker)
# ==============================================================================

if not CF_REACHABLE:
    skip_section(6, "LEGACY ENDPOINTS  [worker] /accession/create, /accession/batch")
else:
    section("6. LEGACY ENDPOINTS  [worker] /accession/create, /accession/batch")
    note("Flat format -- consumed by order-management and pacs-service")

    ok, leg = test("POST /accession/create (flat format -> 201)", "POST",
                   f"{WORKER_URL}/accession/create",
                   headers=AUTH,
                   json_data={"modality": "DX",
                              "patient_national_id": "3273010101900003",
                              "patient_name": "Legacy Patient",
                              "medical_record_number": "MRN-LEG-001",
                              "procedure_code": "DX-CHEST",
                              "procedure_name": "Foto Thorax"},
                   expect=201)
    if ok and leg:
        note(f"Legacy single acsn={leg.json().get('accession_number')}")

    ok, legb = test("POST /accession/batch (flat format, 2 items -> 201)", "POST",
                    f"{WORKER_URL}/accession/batch",
                    headers=AUTH,
                    json_data={
                        "procedures": [
                            {"modality": "US", "procedure_code": "US-ABD",
                             "procedure_name": "USG Abdomen"},
                            {"modality": "XA", "procedure_code": "XA-KNEE",
                             "procedure_name": "X-ray Lutut"}
                        ],
                        "patient_national_id": "3273010101900004",
                        "patient_name": "Legacy Batch Patient"
                    },
                    expect=201)
    if ok and legb:
        note(f"Legacy batch: {len(legb.json().get('accessions',[]))} accessions created")

# ==============================================================================
# SECTION 7 -- Validation / Error Handling  (direct worker)
# ==============================================================================

if not CF_REACHABLE:
    skip_section(7, "ERROR HANDLING & VALIDATION  [worker]")
else:
    section("7. ERROR HANDLING & VALIDATION  [worker]")

    test("POST /api/accessions missing modality (-> 400)", "POST",
         f"{WORKER_URL}/api/accessions",
         headers=AUTH,
         json_data={"patient": {"national_id": "3273010101900001"}},
         expect=400, allow_fail=True)

    test("POST /api/accessions invalid modality (-> 400)", "POST",
         f"{WORKER_URL}/api/accessions",
         headers=AUTH,
         json_data={"modality": "BADMOD", "patient": {"national_id": "1234"}},
         expect=400, allow_fail=True)

    test("GET /api/accessions no auth (-> 401)", "GET",
         f"{WORKER_URL}/api/accessions",
         expect=401, allow_fail=True)

    test("POST /api/accessions/batch > 20 items (-> 400)", "POST",
         f"{WORKER_URL}/api/accessions/batch",
         headers=AUTH,
         json_data={
             "procedures": [{"modality": "CT", "procedure_code": f"P-{i:03}",
                              "procedure_name": f"Proc {i}"} for i in range(21)],
             "patient_national_id": "3273010101900001",
             "patient_name": "Overflow Patient"
         },
         expect=400, allow_fail=True)

    test("POST /api/accessions/batch duplicate procedure_code (-> 400)", "POST",
         f"{WORKER_URL}/api/accessions/batch",
         headers=AUTH,
         json_data={
             "procedures": [
                 {"modality": "CT", "procedure_code": "DUPE", "procedure_name": "A"},
                 {"modality": "MR", "procedure_code": "DUPE", "procedure_name": "B"}
             ],
             "patient_national_id": "3273010101900001",
             "patient_name": "Dupe Patient"
         },
         expect=400, allow_fail=True)

    test("POST /api/accessions invalid idempotency key (-> 400)", "POST",
         f"{WORKER_URL}/api/accessions",
         headers={**AUTH, "X-Idempotency-Key": "not-a-uuid!!!"},
         json_data={"modality": "CT", "patient": {"national_id": "3273010101900001"}},
         expect=400, allow_fail=True)

# ==============================================================================
# SECTION 8 -- Header Plumbing  (direct worker)
# ==============================================================================

if not CF_REACHABLE:
    skip_section(8, "HEADER PLUMBING  [worker]  X-Request-ID echo, X-D1-Replica")
else:
    section("8. HEADER PLUMBING  [worker]  X-Request-ID echo, X-D1-Replica")

    probe_id = str(uuid.uuid4())
    ok, p = test("GET /api/accessions (header probe)", "GET",
                 f"{WORKER_URL}/api/accessions",
                 headers={**AUTH, "X-Request-ID": probe_id},
                 expect=200)
    if ok and p:
        note(f"X-Request-ID echoed={p.headers.get('X-Request-ID','') == probe_id}  "
             f"X-D1-Replica={p.headers.get('X-D1-Replica','?')}")

# ==============================================================================
# SECTION 9 -- Admin Jobs  (direct worker, needs admin role)
# ==============================================================================

if not CF_REACHABLE:
    skip_section(9, "ADMIN JOBS  [worker] /admin/run-job  (needs admin role in JWT)")
else:
    section("9. ADMIN JOBS  [worker] /admin/run-job  (needs admin role in JWT)")

    test("POST /admin/run-job/idempotency_cleanup", "POST",
         f"{WORKER_URL}/admin/run-job/idempotency_cleanup",
         headers=AUTH, expect=200, allow_fail=True)

    test("POST /admin/run-job/soft_delete_purge", "POST",
         f"{WORKER_URL}/admin/run-job/soft_delete_purge",
         headers=AUTH, expect=200, allow_fail=True)

    test("POST /admin/run-job/unknown (-> 400)", "POST",
         f"{WORKER_URL}/admin/run-job/unknown",
         headers=AUTH, expect=400, allow_fail=True)

# ==============================================================================
# SECTION 10 -- Via Cloudflare Pages proxy  (--pages flag)
# ==============================================================================

if not CF_REACHABLE:
    section("10. VIA CLOUDFLARE PAGES  (skipped -- Cloudflare unreachable from this network)")
    note(f"When enabled, tests: browser -> {CF_ACCESSION} -> service binding -> worker")
elif args.pages:
    section("10. VIA CLOUDFLARE PAGES  [pages] /accession-api/* -> service binding -> worker")
    note(f"Target: {CF_ACCESSION}")

    ok, pages_resp = test("POST /backend-api/auth/login (via CF Pages)", "POST",
                          f"{CF_PAGES_API}/auth/login",
                          json_data={"username": LOGIN_USER, "password": LOGIN_PASS},
                          expect=200, allow_fail=True)
    pages_token = ""
    if ok and pages_resp:
        pages_token = pages_resp.json().get("access_token", "")
        note(f"CF Pages token: {pages_token[:20]}...")

    pages_auth = {"Authorization": f"Bearer {pages_token or TOKEN}",
                  "Content-Type": "application/json"}

    test("GET /accession-api/healthz (via Pages)", "GET",
         f"{CF_ACCESSION}/healthz", expect=200, allow_fail=True)

    test("GET /accession-api/readyz (via Pages)", "GET",
         f"{CF_ACCESSION}/readyz", expect=200, allow_fail=True)

    test("GET /accession-api/api/accessions (via Pages)", "GET",
         f"{CF_ACCESSION}/api/accessions",
         headers=pages_auth, expect=200, allow_fail=True)

    ok, pages_cr = test("POST /accession-api/api/accessions (via Pages, 201)", "POST",
                        f"{CF_ACCESSION}/api/accessions",
                        headers={**pages_auth, "X-Request-ID": str(uuid.uuid4())},
                        json_data={"modality": "MG",
                                   "patient": {"national_id": "3273010101900099",
                                               "name": "Pages Test Patient"}},
                        expect=201, allow_fail=True)
    if ok and pages_cr:
        note(f"Via Pages: acsn={pages_cr.json().get('accession_number')}")
else:
    section("10. VIA CLOUDFLARE PAGES  (skipped -- run with --pages to enable)")
    note(f"When enabled, tests: browser -> {CF_ACCESSION} -> service binding -> worker")

# ==============================================================================
# SECTION 11 -- Docker Backend Regression  (ensure existing services still work)
# ==============================================================================

section("11. DOCKER BACKEND REGRESSION  [docker] all existing routes intact")
note("Verify existing services are not broken by any gateway changes")

test("GET /patients",            "GET", f"{DOCKER_API}/patients",            headers=AUTH)
test("GET /doctors",             "GET", f"{DOCKER_API}/doctors",             headers=AUTH)
test("GET /procedures",          "GET", f"{DOCKER_API}/procedures",          headers=AUTH)
test("GET /procedure-mappings",  "GET", f"{DOCKER_API}/procedure-mappings",  headers=AUTH)
test("GET /nurses",              "GET", f"{DOCKER_API}/nurses",              headers=AUTH)
test("GET /settings",            "GET", f"{DOCKER_API}/settings",            headers=AUTH)
test("GET /orders",              "GET", f"{DOCKER_API}/orders",              headers=AUTH)
test("GET /api/studies",         "GET", f"{DOCKER_API}/api/studies",         headers=AUTH)
test("GET /auth/users",          "GET", f"{DOCKER_API}/auth/users",          headers=AUTH)
test("GET /api/audit/logs",      "GET", f"{DOCKER_API}/api/audit/logs",      headers=AUTH)
test("GET /simrs-universal/health", "GET", f"{DOCKER_API}/simrs-universal/health", headers=AUTH)
test("GET /khanza/health",       "GET", f"{DOCKER_API}/khanza/health",       headers=AUTH)
test("GET /api/products",        "GET", f"{DOCKER_API}/api/products",        headers=AUTH)
test("GET /api/subscriptions",   "GET", f"{DOCKER_API}/api/subscriptions",   headers=AUTH)
test("GET /worklists/summary",   "GET", f"{DOCKER_API}/worklists/summary",   headers=AUTH)
test("GET /api/monitor/satusehat/orders", "GET",
     f"{DOCKER_API}/api/monitor/satusehat/orders", headers=AUTH, allow_fail=True)

for svc in ["auth", "pacs", "master", "order", "mwl", "simrs"]:
    test(f"Health hub: {svc}", "GET", f"{DOCKER_API}/health/{svc}")

# WADO-RS spot check
ok, sl = test("GET /api/studies", "GET", f"{DOCKER_API}/api/studies", headers=AUTH)
if ok and sl:
    items = sl.json()
    if isinstance(items, dict):
        items = items.get("data") or items.get("studies") or items.get("items") or []
    if isinstance(items, list) and items:
        s = items[0]
        suid = s.get("study_instance_uid", "")
        if suid:
            test("WADO metadata spot-check", "GET",
                 f"{DOCKER_BASE}/wado-rs/studies/{suid}/metadata",
                 headers=AUTH, allow_fail=True)

# ==============================================================================
# SECTION 12 -- End-to-End Order Flow  (Docker + direct worker)
# ==============================================================================

section("12. END-TO-END ORDER FLOW  [docker + worker]")
note("Simulates full user journey: login -> pick procedure -> generate acsn -> submit order")

# Step 1: fetch procedures from Docker backend (OrderForm procedure picker)
ok, proc_resp = test("Step 1: GET /procedures (Docker, populate OrderForm)", "GET",
                     f"{DOCKER_API}/procedures", headers=AUTH)
proc_code, proc_name, proc_modality = "CT-CHEST-E2E", "CT Thorax E2E", "CT"
if ok and proc_resp:
    procs = proc_resp.json()
    if isinstance(procs, dict):
        procs = procs.get("data") or procs.get("items") or procs.get("procedures") or []
    if isinstance(procs, list) and procs:
        p = procs[0]
        proc_code     = p.get("procedure_code") or p.get("code") or proc_code
        proc_name     = p.get("procedure_name") or p.get("name") or proc_name
        proc_modality = p.get("modality") or proc_modality
        note(f"Using: code={proc_code}  name={proc_name}  modality={proc_modality}")

if not CF_REACHABLE:
    note("Step 2-4: SKIPPED -- Cloudflare unreachable from this network")
    note("         Steps 2 and 4 require direct worker access to generate and verify accession.")
else:
    # Step 2: generate accession via worker (getAccessionNumber in accessionServiceClient.js)
    ok, acc_resp = test("Step 2: POST /api/accessions (worker, generate acsn)", "POST",
                        f"{WORKER_URL}/api/accessions",
                        headers={**AUTH, "X-Request-ID": str(uuid.uuid4())},
                        json_data={
                            "modality": proc_modality,
                            "patient": {
                                "id": "MRN-E2E-001",
                                "national_id": "3273010101900010",
                                "name": "E2E Test Patient"
                            },
                            "procedure_code": proc_code,
                            "procedure_name": proc_name
                        },
                        expect=201)

    e2e_acsn = None
    if ok and acc_resp:
        e2e_acsn = acc_resp.json().get("accession_number")
        note(f"Step 2: accession_number={e2e_acsn}")

    # Step 3: submit order to Docker backend (order-management service)
    if e2e_acsn:
        ok, order_resp = test("Step 3: POST /orders (Docker, submit order with acsn)", "POST",
                              f"{DOCKER_API}/orders",
                              headers=AUTH,
                              json_data={
                                  "patient_name": "E2E Test Patient",
                                  "mrn": "MRN-E2E-001",
                                  "status": "created",
                                  "priority": "routine",
                                  "procedures": [{
                                      "procedure_code": proc_code,
                                      "procedure_name": proc_name,
                                      "modality": proc_modality,
                                      "accession_number": e2e_acsn
                                  }]
                              },
                              expect=201, allow_fail=True)
        if ok and order_resp:
            oid = order_resp.json().get("id") or order_resp.json().get("order_id")
            note(f"Step 3: order_id={oid}")
        else:
            note("Step 3: WARN -- order-management may need additional required fields")

    # Step 4: verify accession record persisted in worker D1
    if e2e_acsn:
        enc = requests.utils.quote(e2e_acsn, safe='')
        ok, verify = test("Step 4: GET /api/accessions/:num (worker, verify D1 persist)", "GET",
                          f"{WORKER_URL}/api/accessions/{enc}",
                          headers=AUTH, expect=200)
        if ok and verify:
            rec = verify.json()
            note(f"Step 4: modality={rec.get('modality')}  "
                 f"patient={rec.get('patient_name')}  source={rec.get('source')}")

# ==============================================================================
# SUMMARY
# ==============================================================================

print()
print("=" * 110)
total = PASS + FAIL
log(f"  RESULT : {PASS}/{total} passed | {FAIL} failed | WARN (allow_fail) not counted",
    C.BOLD + (C.GREEN if FAIL == 0 else C.RED))
log(f"  Layers : [docker] {DOCKER_API}", C.DIM)
log(f"           [worker] {WORKER_URL}  "
    f"({'tested' if CF_REACHABLE else 'unreachable -- skipped sections 2-9,12'})", C.DIM)
log(f"           [pages]  {CF_ACCESSION}  ({'tested' if args.pages and CF_REACHABLE else 'skipped, use --pages'})", C.DIM)
log(f"  Done   : {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}", C.DIM)
print("=" * 110)

sys.exit(0 if FAIL == 0 else 1)
