import requests
import time
import sys

BASE_URL = "https://api-gateway-v2.xolution.workers.dev"

def test_thumbnail_flow():
    print("=" * 80)
    print("THUMBNAIL DURABLE OBJECT + R2 INTEGRATION TEST")
    print("=" * 80)

    # 1. Login
    print("\n1. Authenticating...")
    login_url = f"{BASE_URL}/auth/login"
    try:
        r = requests.post(login_url, json={"username": "superadmin", "password": "SuperAdmin123!@#"}, timeout=10)
        if r.status_code != 200:
            print(f"FAILED: Auth failed with {r.status_code}")
            return
        token = r.json().get("access_token")
        print("SUCCESS: Token acquired.")
    except Exception as e:
        print(f"ERROR: {str(e)}")
        return

    # 2. Get Tenant List
    print("\n2. Getting Tenant List...")
    headers = {"Authorization": f"Bearer {token}"}
    r = requests.get(f"{BASE_URL}/api/tenants", headers=headers)
    tenants = r.json()
    if isinstance(tenants, list) and len(tenants) > 0:
        tenant_id = tenants[0]['id']
        print(f"SUCCESS: Using Tenant ID {tenant_id}")
    else:
        tenant_id = "default"
        print("WARN: No tenants found, using 'default'")

    headers["X-Tenant-ID"] = tenant_id

    # 3. Request Thumbnail
    study_id = "1.2.392.200036.9125.2.2322162091861962.65114710399.439619"
    series_id = "1.2.392.200036.9125.3.2322162091861962.65114710399.439620"
    instance_id = "1.2.392.200036.9125.4.0.672101369.482072808.3134259908"
    
    thumb_url = f"{BASE_URL}/api/thumbnail/studies/{study_id}/series/{series_id}/instances/{instance_id}"
    
    print(f"\n3. Requesting Thumbnail (First time - CACHE MISS expected)")
    print(f"Target: {thumb_url}")
    
    start_time = time.time()
    r = requests.get(thumb_url, headers=headers, timeout=60)
    duration = time.time() - start_time
    
    cache_status = r.headers.get("X-Cache-Status", "NONE")
    print(f"Response: {r.status_code} ({duration:.2f}s)")
    print(f"Cache Header: {cache_status}")
    
    if r.status_code == 200:
        print(f"SUCCESS: Image received ({len(r.content)} bytes)")
    elif r.status_code == 202:
        print("PENDING: Thumbnail is being generated. Waiting 10s...")
        time.sleep(10)
        r = requests.get(thumb_url, headers=headers, timeout=10)
        print(f"Retry Response: {r.status_code}")
    else:
        print(f"FAILED: {r.text}")

    # 4. Request again (Second time - CACHE HIT expected)
    print("\n4. Requesting Thumbnail again (Second time - CACHE HIT expected)")
    
    start_time = time.time()
    r = requests.get(thumb_url, headers=headers, timeout=10)
    duration = time.time() - start_time
    
    cache_status = r.headers.get("X-Cache-Status", "NONE")
    print(f"Response: {r.status_code} ({duration:.2f}s)")
    print(f"Cache Header: {cache_status}")
    
    if cache_status == "HIT":
        print("SUCCESS: Cache HIT verified! Data served from Cloudflare R2.")
    else:
        print("FAILED: Expected Cache HIT but got MISS/NONE.")

    print("\n" + "=" * 80)
    print("TEST SUITE COMPLETE")
    print("=" * 80)

if __name__ == "__main__":
    test_thumbnail_flow()
