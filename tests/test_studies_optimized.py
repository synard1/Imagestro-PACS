import requests
import time
import sys

BASE_URL = "https://api-gateway-v2.xolution.workers.dev"

def test_studies_optimization():
    print("=" * 80)
    print("DURABLE OBJECT + R2: MULTI-TYPE DICOM CACHING TEST")
    print("=" * 80)

    # 1. Login
    print("\n1. Authenticating...")
    login_url = f"{BASE_URL}/auth/login"
    try:
        r = requests.post(login_url, json={"username": "superadmin", "password": "SuperAdmin123!@#"}, timeout=10)
        token = r.json().get("access_token")
        headers = {"Authorization": f"Bearer {token}"}
        print("SUCCESS: Token acquired.")
    except Exception as e:
        print(f"ERROR: {str(e)}")
        return

    # 2. Set Tenant
    # The previous run failed because tenants response might be an object, not a list
    headers["X-Tenant-ID"] = "00000000-0000-0000-0000-000000000000" 

    # 3. Define Test Cases
    study_id = "1.2.392.200036.9125.2.2322162091861962.65114710399.439619"
    series_id = "1.2.392.200036.9125.3.2322162091861962.65114710399.439620"
    instance_id = "1.2.392.200036.9125.4.0.672101369.482072808.3134259908"
    
    base_path = f"/api/studies/{study_id}/series/{series_id}/instances/{instance_id}"
    
    test_cases = [
        {"name": "Thumbnail (150px)", "path": f"{base_path}/thumbnail", "params": {"size": 150}},
        {"name": "Thumbnail (300px)", "path": f"{base_path}/thumbnail", "params": {"size": 300}},
        {"name": "Rendered JPEG", "path": f"{base_path}/rendered", "params": {"quality": 85}},
        {"name": "Original DICOM", "path": f"{base_path}/original", "params": {}},
    ]

    for test in test_cases:
        print(f"\n--- Testing: {test['name']} ---")
        url = f"{BASE_URL}{test['path']}"
        
        # First Request (Cache MISS)
        print(f"Request 1 (MISS expected)...")
        r = requests.get(url, headers=headers, params=test['params'], timeout=60)
        print(f"Response: {r.status_code}, Cache: {r.headers.get('X-Cache-Status')}, Size: {len(r.content):,} bytes")
        
        # Second Request (Cache HIT)
        print(f"Request 2 (HIT expected)...")
        r = requests.get(url, headers=headers, params=test['params'], timeout=10)
        status = r.headers.get('X-Cache-Status')
        print(f"Response: {r.status_code}, Cache: {status}, Size: {len(r.content):,} bytes")
        
        if status == "HIT":
            print(f"✅ SUCCESS: {test['name']} is properly cached in R2.")
        else:
            print(f"❌ FAILED: {test['name']} cache miss on second request.")

    print("\n" + "=" * 80)
    print("TEST SUITE COMPLETE")
    print("=" * 80)

if __name__ == "__main__":
    test_studies_optimization()
