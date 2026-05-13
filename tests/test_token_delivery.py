#!/usr/bin/env python3
import requests
import json
import sys

BASE_URL = "https://imagestro-pacs.pages.dev"
BACKEND_API = f"{BASE_URL}/backend-api"

print("1. Login...")
r = requests.post(f"{BACKEND_API}/auth/login", json={"username": "superadmin", "password": "SuperAdmin123!@#"})
print(f"Status: {r.status_code}")
print(f"Response: {r.text[:500]}")

if r.status_code == 200:
    token = r.json().get("access_token")
    print(f"Token acquired: {token[:20]}...")

    print("\n2. Test with Authorization Header...")
    r = requests.get(f"{BASE_URL}/api/tenants", headers={"Authorization": f"Bearer {token}"})
    print(f"Result (Header): {r.status_code}")
    print(f"Response: {r.text}")

    print("\n3. Test with token in Query Param...")
    r = requests.get(f"{BASE_URL}/api/tenants", params={"token": token})
    print(f"Result (Query): {r.status_code}")
    print(f"Response: {r.text}")

print("\n4. Test direct health check (Public)...")
r = requests.get(f"{BACKEND_API}/health/auth")
print(f"Result (Health): {r.status_code}")
print(f"Response: {r.text}")
