#!/usr/bin/env python3
"""
Comprehensive Data-Aware API Test Suite (Enhanced with SaaS Modules)
Target: Frontend Proxy (Nginx) -> API Gateway
"""

import requests
import json
import sys
import uuid
from datetime import datetime

# Target via Frontend Proxy
BASE_URL = "http://100.113.207.79:8082"
BACKEND_API = f"{BASE_URL}/backend-api"

class colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    RESET = '\033[0m'
    BOLD = '\033[1m'

def log(msg, color=colors.RESET):
    print(f"{color}{msg}{colors.RESET}")

def test_endpoint(name, method, url, headers=None, json_data=None, params=None):
    try:
        r = requests.request(method, url, headers=headers, json=json_data, params=params, timeout=15)
        status = "PASS" if r.status_code < 400 else "FAIL"

        # Format output
        indicator = f"{colors.GREEN if status == 'PASS' else colors.RED}[{status}]{colors.RESET}"
        short_url = url.replace(BASE_URL, "")
        print(f"{indicator} {method:6} {short_url:<70} -> {r.status_code}")

        if r.status_code >= 400:
            try:
                err_detail = r.json()
                print(f"    {colors.YELLOW}Response: {json.dumps(err_detail)}{colors.RESET}")
            except:
                print(f"    {colors.YELLOW}Response: {r.text[:100]}...{colors.RESET}")

        return status == "PASS", r
    except Exception as e:
        print(f"{colors.RED}[ERROR]{colors.RESET} {method:6} {url[:70]:<70} -> {str(e)}")
        return False, None

def get_items(resp_json):
    if not resp_json: return []
    if isinstance(resp_json, list): return resp_json
    if isinstance(resp_json, dict):
        data = resp_json.get('data') or resp_json.get('items') or \
               resp_json.get('patients') or resp_json.get('doctors') or \
               resp_json.get('orders') or resp_json.get('tenants') or \
               resp_json.get('users') or resp_json.get('products') or \
               resp_json.get('subscriptions') or resp_json.get('studies')
        if isinstance(data, list): return data
        if isinstance(data, dict) and 'users' in data: return data['users']
    return []

# ==============================================================================
# MAIN TEST SUITE
# ==============================================================================

print("=" * 110)
log("COMPREHENSIVE FRONTEND-PROXY API TEST SUITE", colors.BOLD)
print("=" * 110)

# 1. AUTHENTICATION
log("\n1. AUTHENTICATION", colors.BOLD)
r, resp = test_endpoint("Login", "POST", f"{BACKEND_API}/auth/login",
                        json_data={"username": "superadmin", "password": "SuperAdmin123!@#"})
if not r:
    log("Fatal: Could not login via frontend proxy", colors.RED)
    sys.exit(1)

token = resp.json().get("access_token")
auth_headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
log(f"    Token acquired via Proxy", colors.GREEN)

# 2. SAAS: TENANTS & ADMIN PROVISIONING
log("\n2. SAAS: TENANTS & ADMIN PROVISIONING", colors.BOLD)
unique_id = str(uuid.uuid4())[:8]
demo_tenant_data = {
    "name": f"Proxy Test Hospital {unique_id}",
    "slug": f"proxy-hosp-{unique_id}",
    "code": f"PHOSP-{unique_id.upper()}",
    "address": "Jl. Proxy No. 123",
    "contact_email": f"admin@proxy-{unique_id}.com",
    "is_active": True
}
success, resp = test_endpoint("Create Demo Tenant", "POST", f"{BACKEND_API}/api/tenants",
                             headers=auth_headers, json_data=demo_tenant_data)

new_tenant_id = resp.json().get('id') if success else None

success, resp = test_endpoint("List Tenants", "GET", f"{BACKEND_API}/api/tenants", headers=auth_headers)
items = get_items(resp.json()) if success else []
active_tenant_id = new_tenant_id or (items[0].get('id') if items else None)

if active_tenant_id:
    log(f"    Active Tenant ID: {active_tenant_id}", colors.BLUE)
    test_endpoint("Get Tenant Details", "GET", f"{BACKEND_API}/api/tenants/{active_tenant_id}", headers=auth_headers)

# 3. SAAS: PRODUCTS & SUBSCRIPTIONS
log("\n3. SAAS: PRODUCTS & SUBSCRIPTIONS", colors.BOLD)
success, resp = test_endpoint("List Products", "GET", f"{BACKEND_API}/api/products", headers=auth_headers)
test_endpoint("List Subscriptions", "GET", f"{BACKEND_API}/api/subscriptions", headers=auth_headers)

# 5. CORE: STUDIES & WADO (Directly via Proxy)
log("\n5. CORE: STUDIES & WADO", colors.BOLD)
success, resp = test_endpoint("List Studies", "GET", f"{BACKEND_API}/api/studies", headers=auth_headers)
items = get_items(resp.json()) if success else []
if items:
    # Use real IDs from the response if available
    # Prefer Skull CT if found, otherwise use first item
    s = next((i for i in items if i.get('study_description') == 'Skull CT'), items[0])
    s_uid = s.get('study_instance_uid')
    ser_uid = s.get('thumbnail_series_uid') or s.get('series_instance_uid')
    ins_uid = s.get('thumbnail_instance_uid') or s.get('sop_instance_uid')

    if not ser_uid or not ins_uid:
        # Fallback to hardcoded Skull CT values if dynamic discovery failed but data was just ingested
        s_uid = "1.3.6.1.4.1.5962.99.1.1761388472.1291962045.1616669124536.2592.0"
        ser_uid = "1.3.6.1.4.1.5962.99.1.1761388472.1291962045.1616669124536.2634.0"
        ins_uid = "1.3.6.1.4.1.5962.99.1.1761388472.1291962045.1616669124536.2700.0"

    log(f"    Testing with Study: {s_uid}", colors.BLUE)

    # WADO-RS via Proxy — pacs-service router is at /wado-rs (no v2 prefix)
    test_endpoint("WADO Metadata", "GET", f"{BASE_URL}/wado-rs/studies/{s_uid}/series/{ser_uid}/instances/{ins_uid}/metadata", headers=auth_headers)

    test_endpoint("WADO Thumbnail", "GET", f"{BASE_URL}/wado-rs/studies/{s_uid}/series/{ser_uid}/instances/{ins_uid}/thumbnail", params={"size": 150}, headers=auth_headers)

    # Critical: /original endpoint used by Enhanced Viewer (DicomViewerEnhanced)
    ok, r = test_endpoint("WADO Original (Enhanced Viewer)", "GET", f"{BASE_URL}/wado-rs/studies/{s_uid}/series/{ser_uid}/instances/{ins_uid}/original", headers=auth_headers)
    if ok and r:
        log(f"    DICOM file size: {len(r.content):,} bytes", colors.GREEN)

    # Rendered image endpoint
    test_endpoint("WADO Rendered", "GET", f"{BASE_URL}/wado-rs/studies/{s_uid}/series/{ser_uid}/instances/{ins_uid}/rendered", params={"quality": 80}, headers=auth_headers)

    # WADO rendered — browser/img-tag simulation (no Authorization header, token in query)
    # This tests the JWT query-param fallback for <img> tags that bypass CORS preflight
    test_endpoint("WADO Rendered (query-token, no auth header)", "GET",
                  f"{BASE_URL}/wado-rs/studies/{s_uid}/series/{ser_uid}/instances/{ins_uid}/rendered",
                  params={"quality": 80, "token": token},
                  headers=None)  # No Authorization header — simulates browser <img> behavior


# 6. CORE: SYSTEM MODULES
log("\n6. CORE: SYSTEM MODULES", colors.BOLD)
test_endpoint("List Users", "GET", f"{BACKEND_API}/auth/users", headers=auth_headers)
test_endpoint("Audit Logs", "GET", f"{BACKEND_API}/api/audit/logs", headers=auth_headers)
test_endpoint("SIMRS Universal Health", "GET", f"{BACKEND_API}/simrs-universal/health", headers=auth_headers)

# 7. CORE: STORAGE MANAGEMENT & MONITORING
log("\n7. CORE: STORAGE MANAGEMENT & MONITORING", colors.BOLD)
test_endpoint("Storage Backends", "GET", f"{BACKEND_API}/api/storage-backends", headers=auth_headers)
test_endpoint("Storage Migration List", "GET", f"{BACKEND_API}/api/storage-migrations", headers=auth_headers)
test_endpoint("Storage Monitor Stats", "GET", f"{BACKEND_API}/api/storage-monitor/stats", headers=auth_headers)

# 15. HEALTH HUB
log("\n15. HEALTH HUB", colors.BOLD)
for s in ["auth", "pacs", "master", "order", "mwl", "simrs"]:
    test_endpoint(f"Health: {s}", "GET", f"{BACKEND_API}/health/{s}")

# 16. EXTERNAL SYSTEMS (KHANZA Integration)
log("\n16. EXTERNAL SYSTEMS", colors.BOLD)
test_endpoint("Khanza Health", "GET", f"{BACKEND_API}/khanza/health", headers=auth_headers)
test_endpoint("External System List", "GET", f"{BACKEND_API}/external-systems", headers=auth_headers)
test_endpoint("External System by ID", "GET", f"{BACKEND_API}/external-systems/78a172da-4c4b-449e-a0a8-fd1e1f854e8f", headers=auth_headers)
test_endpoint("External System by ID + Credentials", "GET", f"{BACKEND_API}/external-systems/78a172da-4c4b-449e-a0a8-fd1e1f854e8f", params={"include_credentials": "true"}, headers=auth_headers)
test_endpoint("External System by ID + include_credentials", "GET", f"{BACKEND_API}/external-systems/78a172da-4c4b-449e-a0a8-fd1e1f854e8f", headers=auth_headers,
              params={"include_credentials": "true"})

# 17. NOTIFICATION ENDPOINTS (Direct /api prefix - mimics frontend)
log('\n18. NEWLY FIXED ENDPOINTS', colors.BOLD)
test_endpoint('Worklist Summary', 'GET', f'{BASE_URL}/backend-api/worklists/summary', headers=auth_headers)
test_endpoint('Procedures List', 'GET', f'{BASE_URL}/backend-api/procedures', headers=auth_headers)
test_endpoint('Procedure Mappings List', 'GET', f'{BASE_URL}/backend-api/procedure-mappings', headers=auth_headers)
test_endpoint('Nurses List', 'GET', f'{BASE_URL}/backend-api/nurses', headers=auth_headers)
test_endpoint('Monitor SatuSehat Orders', 'GET', f'{BASE_URL}/backend-api/api/monitor/satusehat/orders', headers=auth_headers)

log('\n17. NOTIFICATION ENDPOINTS (Direct /api prefix)', colors.BOLD)
test_endpoint('Notification Settings Status (Direct)', 'GET', f'{BASE_URL}/api/v1/settings/notification/status', headers=auth_headers)
test_endpoint('Notification Config List (Direct)', 'GET', f'{BASE_URL}/api/v1/settings/notification/config', headers=auth_headers)
test_endpoint('Send Order Notification (Direct)', 'POST', f'{BASE_URL}/api/v1/settings/notification/send-order-notification', 
                       headers=auth_headers, json_data=[{'order_id': 'TEST-001', 'notification_type': 'STAGNANT_ORDER'}])

# 17.1 NOTIFICATION ENDPOINTS (via /backend-api gateway)
log("\n17. NOTIFICATION ENDPOINTS", colors.BOLD)
test_endpoint("Notification Settings Status", "GET", f"{BACKEND_API}/api/v1/settings/notification/status", headers=auth_headers)
test_endpoint("Notification Config List", "GET", f"{BACKEND_API}/api/v1/settings/notification/config", headers=auth_headers)
test_endpoint("Send Order Notification", "POST", f"{BACKEND_API}/api/v1/settings/notification/send-order-notification",
                       headers=auth_headers, json_data=[{"order_id": "TEST-001", "notification_type": "NEW_ORDER"}])

print("\n" + "=" * 110)
log("FRONTEND PROXY TEST SUITE COMPLETE", colors.BOLD)
print("=" * 110)
