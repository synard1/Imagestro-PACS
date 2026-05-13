#!/usr/bin/env python3
"""
Cloudflare Deployment Diagnostic Test Suite
Adapted from @tests/test_all_frontend_endpoints.py
"""

import requests
import json
import sys
import uuid
from datetime import datetime

# Target Cloudflare Deployment
BASE_URL = "https://imagestro-pacs.pages.dev"
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
                print(f"    {colors.YELLOW}Response: {r.text[:200]}...{colors.RESET}")

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
log("CLOUDFLARE DEPLOYMENT DIAGNOSTIC TEST SUITE", colors.BOLD)
print("=" * 110)

# 1. AUTHENTICATION
log("\n1. AUTHENTICATION", colors.BOLD)
# Testing direct login via /backend-api (which we proxy to /auth/login)
r, resp = test_endpoint("Login", "POST", f"{BACKEND_API}/auth/login",
                        json_data={"username": "superadmin", "password": "SuperAdmin123!@#"})
if not r:
    log("Fatal: Could not login via Cloudflare proxy", colors.RED)
    sys.exit(1)

login_data = resp.json()
token = login_data.get("access_token")
if not token:
    log("Fatal: No access token in login response", colors.RED)
    print(json.dumps(login_data, indent=2))
    sys.exit(1)

auth_headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
log(f"    Token acquired via Cloudflare Proxy", colors.GREEN)

# 1.1 CSRF TOKEN (The most problematic one currently)
log("\n1.1 CSRF TOKEN", colors.BOLD)
test_endpoint("Get CSRF Token", "GET", f"{BASE_URL}/api/csrf/token", headers=auth_headers)

# 2. SAAS: TENANTS
log("\n2. SAAS: TENANTS", colors.BOLD)
success, resp = test_endpoint("List Tenants", "GET", f"{BASE_URL}/api/tenants", headers=auth_headers)
items = get_items(resp.json()) if success else []

if items:
    active_tenant_id = items[0].get('id')
    log(f"    Testing with Tenant ID: {active_tenant_id}", colors.BLUE)
    # Add tenant ID header for context
    tenant_headers = auth_headers.copy()
    tenant_headers["X-Tenant-ID"] = active_tenant_id
    
    test_endpoint("Get Tenant Details (with X-Tenant-ID)", "GET", f"{BASE_URL}/api/tenants/{active_tenant_id}", headers=tenant_headers)
    test_endpoint("List Orders (with X-Tenant-ID)", "GET", f"{BACKEND_API}/orders", headers=tenant_headers)

# 15. HEALTH HUB
log("\n15. HEALTH HUB", colors.BOLD)
for s in ["auth", "pacs", "master", "order", "mwl", "simrs"]:
    test_endpoint(f"Health: {s}", "GET", f"{BACKEND_API}/health/{s}")

print("\n" + "=" * 110)
log("CLOUDFLARE DIAGNOSTIC COMPLETE", colors.BOLD)
print("=" * 110)
