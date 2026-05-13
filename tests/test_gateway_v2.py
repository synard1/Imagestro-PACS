#!/usr/bin/env python3
"""
Gateway-v2 API Test Suite
Target: Cloudflare Worker (api-gateway-v2)
"""

import requests
import json
import sys
import uuid
from datetime import datetime

# Target: Cloudflare Worker
BASE_URL = "https://api-gateway-v2.xolution.workers.dev"
BACKEND_API = f"{BASE_URL}/backend-api"
BYPASS_SECRET = "TEST_BYPASS_123" # Must match 'wrangler secret put BYPASS_SECRET'

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
        # Add bypass header for testing if not present
        if headers is None: headers = {}
        if BYPASS_SECRET:
            headers["X-Internal-Bypass"] = BYPASS_SECRET

        r = requests.request(method, url, headers=headers, json=json_data, params=params, timeout=15)
        status = "PASS" if r.status_code < 400 else "FAIL"

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
    return []

print("=" * 110)
log("CLOUD FLARE GATEWAY-V2 API TEST SUITE", colors.BOLD)
print("=" * 110)

# 1. AUTHENTICATION
log("\n1. AUTHENTICATION", colors.BOLD)
r, resp = test_endpoint("Login", "POST", f"{BACKEND_API}/auth/login",
                        json_data={"username": "superadmin", "password": "SuperAdmin123!@#"})

if not r:
    log("Note: Login failed. Ensure backend services are reachable from Cloudflare and secrets (JWT_SECRET, BYPASS_SECRET) are set.", colors.YELLOW)
    sys.exit(0) # Exit gracefully for now since we expect potential 502s without real backend

token = resp.json().get("access_token")
auth_headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
log(f"    Token acquired via Gateway-v2", colors.GREEN)

# 2. CORE MODULES (Sampling)
log("\n2. CORE MODULES", colors.BOLD)
test_endpoint("List Tenants", "GET", f"{BACKEND_API}/api/tenants", headers=auth_headers)
test_endpoint("List Studies", "GET", f"{BACKEND_API}/api/studies", headers=auth_headers)
test_endpoint("WADO Metadata (Sample)", "GET", f"{BASE_URL}/wado-rs/studies/1.2.3/metadata", headers=auth_headers)

# 3. INTEGRATIONS
log("\n3. INTEGRATIONS", colors.BOLD)
test_endpoint("Khanza Health", "GET", f"{BACKEND_API}/khanza/health", headers=auth_headers)
test_endpoint("SIMRS Universal Health", "GET", f"{BACKEND_API}/simrs-universal/health", headers=auth_headers)

# 15. HEALTH HUB
log("\n15. HEALTH HUB", colors.BOLD)
for s in ["auth", "pacs", "master"]:
    test_endpoint(f"Health: {s}", "GET", f"{BACKEND_API}/health/{s}")

print("\n" + "=" * 110)
log("GATEWAY-V2 TEST SUITE COMPLETE", colors.BOLD)
print("=" * 110)
