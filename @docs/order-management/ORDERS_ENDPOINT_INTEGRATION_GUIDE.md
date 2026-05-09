# Orders Endpoint Integration Guide

## Overview
Endpoint `/api/external-systems/{system_id}/orders` telah dibuat dengan struktur dasar. Panduan ini menjelaskan cara mengintegrasikan dengan external system API untuk fetch orders yang sebenarnya.

## Current Implementation
Endpoint saat ini mengembalikan empty list dengan struktur pagination yang benar:
```json
{
  "items": [],
  "total": 0,
  "page": 1,
  "page_size": 10,
  "total_pages": 0,
  "has_next_page": false,
  "has_previous_page": false
}
```

## Integration Steps

### Step 1: Get External System Configuration
```python
# In list_orders function
system = db.query(ExternalSystem).filter(ExternalSystem.id == system_id).first()
if not system:
    raise HTTPException(status_code=404, detail="External system not found")

# Get decrypted credentials
credentials = system.get_decrypted_credentials()
base_url = system.base_url
auth_type = system.auth_type
```

### Step 2: Build Request to External System
```python
import httpx

# Build headers based on auth type
headers = {"Accept": "application/json"}

if auth_type == "api_key":
    headers["X-API-Key"] = credentials.get("api_key")
elif auth_type == "bearer":
    headers["Authorization"] = f"Bearer {credentials.get('api_key')}"

# Build auth for basic auth
auth = None
if auth_type == "basic":
    auth = (credentials.get("username"), credentials.get("password"))

# Build query parameters
params = {
    "page": page,
    "page_size": page_size,
}
if search:
    params["search"] = search
if start_date:
    params["start_date"] = start_date
if end_date:
    params["end_date"] = end_date
```

### Step 3: Call External System API
```python
# Example for Khanza
async with httpx.AsyncClient(timeout=30) as client:
    # Khanza endpoint: /radiologi
    url = f"{base_url}/radiologi"
    
    response = await client.get(
        url,
        params=params,
        headers=headers,
        auth=auth
    )
    
    if response.status_code != 200:
        raise HTTPException(
            status_code=response.status_code,
            detail=f"External system returned {response.status_code}"
        )
    
    external_orders = response.json()
```

### Step 4: Map Response to Standard Format
```python
# Map external system fields to standard format
orders = []
for ext_order in external_orders:
    order = {
        "id": ext_order.get("noorder") or ext_order.get("id"),
        "order_number": ext_order.get("noorder") or ext_order.get("order_number"),
        "patient_name": ext_order.get("nm_pasien") or ext_order.get("patient_name"),
        "patient_mrn": ext_order.get("no_rkm_medis") or ext_order.get("patient_mrn"),
        "procedure_name": ext_order.get("nm_perawatan") or ext_order.get("procedure_name"),
        "request_date": ext_order.get("tgl_permintaan") or ext_order.get("request_date"),
        "priority": ext_order.get("priority", "routine"),
        "status": ext_order.get("status", "pending"),
        "is_imported": await is_order_imported(system_id, ext_order.get("noorder")),
    }
    orders.append(order)
```

### Step 5: Apply Pagination
```python
# Calculate pagination
total = len(orders)
total_pages = math.ceil(total / page_size)
offset = (page - 1) * page_size
paginated_orders = orders[offset:offset + page_size]

return {
    "items": paginated_orders,
    "total": total,
    "page": page,
    "page_size": page_size,
    "total_pages": total_pages,
    "has_next_page": page < total_pages,
    "has_previous_page": page > 1
}
```

## Example Implementation for Khanza

```python
@router.get("/{system_id}/orders", response_model=dict)
async def list_orders(
    system_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    search: Optional[str] = Query(None),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """List orders from external system"""
    try:
        # Get external system
        system = db.query(ExternalSystem).filter(ExternalSystem.id == system_id).first()
        if not system:
            raise HTTPException(status_code=404, detail="External system not found")
        
        # Get credentials
        credentials = system.get_decrypted_credentials()
        
        # Build headers
        headers = {"Accept": "application/json"}
        if system.auth_type == "api_key":
            headers["X-API-Key"] = credentials.get("api_key")
        
        # Build query params
        params = {
            "page": page,
            "page_size": page_size,
        }
        if search:
            params["search"] = search
        if start_date:
            params["start_date"] = start_date
        if end_date:
            params["end_date"] = end_date
        
        # Call external system
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.get(
                f"{system.base_url}/radiologi",
                params=params,
                headers=headers
            )
            
            if response.status_code != 200:
                raise HTTPException(
                    status_code=response.status_code,
                    detail="Failed to fetch orders from external system"
                )
            
            external_orders = response.json()
        
        # Map to standard format
        orders = []
        for ext_order in external_orders.get("items", []):
            order = {
                "id": ext_order.get("noorder"),
                "order_number": ext_order.get("noorder"),
                "patient_name": ext_order.get("nm_pasien"),
                "patient_mrn": ext_order.get("no_rkm_medis"),
                "procedure_name": ext_order.get("nm_perawatan"),
                "request_date": ext_order.get("tgl_permintaan"),
                "priority": "routine",
                "status": "pending",
                "is_imported": False,  # Check from import history
            }
            orders.append(order)
        
        # Pagination
        total = external_orders.get("total", len(orders))
        total_pages = math.ceil(total / page_size)
        
        return {
            "items": orders,
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": total_pages,
            "has_next_page": page < total_pages,
            "has_previous_page": page > 1
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listing orders: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
```

## Error Handling

```python
# Handle connection errors
try:
    response = await client.get(url, ...)
except httpx.ConnectError:
    raise HTTPException(
        status_code=503,
        detail="Cannot connect to external system"
    )
except httpx.TimeoutException:
    raise HTTPException(
        status_code=504,
        detail="External system request timeout"
    )
except Exception as e:
    logger.error(f"Error: {str(e)}")
    raise HTTPException(status_code=500, detail=str(e))
```

## Testing

### Unit Test Example
```python
def test_list_orders(client, external_system):
    """Test listing orders"""
    response = client.get(
        f"/api/external-systems/{external_system.id}/orders",
        params={
            "page": 1,
            "page_size": 10,
            "start_date": "2025-12-06",
            "end_date": "2025-12-06"
        }
    )
    
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert "total" in data
    assert "page" in data
    assert "page_size" in data
    assert "total_pages" in data
```

### Integration Test Example
```python
def test_list_orders_with_real_khanza(client, khanza_system):
    """Test listing orders from real Khanza"""
    response = client.get(
        f"/api/external-systems/{khanza_system.id}/orders",
        params={"page": 1, "page_size": 10}
    )
    
    assert response.status_code == 200
    data = response.json()
    
    if data["total"] > 0:
        order = data["items"][0]
        assert "order_number" in order
        assert "patient_name" in order
        assert "patient_mrn" in order
```

## Performance Considerations

1. **Caching**
   - Cache orders for 5-10 minutes
   - Invalidate on new imports
   - Use Redis for distributed caching

2. **Pagination**
   - Always paginate on backend
   - Don't fetch all orders at once
   - Limit page_size to 100

3. **Filtering**
   - Apply filters on external system if possible
   - Otherwise filter in-memory
   - Consider database indexing

4. **Timeout**
   - Set reasonable timeout (30 seconds)
   - Handle timeout gracefully
   - Return partial results if needed

## Security Considerations

1. **Credentials**
   - Always decrypt credentials before use
   - Never log credentials
   - Use HTTPS for external calls

2. **Input Validation**
   - Validate page and page_size
   - Sanitize search input
   - Validate date format

3. **Rate Limiting**
   - Implement rate limiting
   - Prevent abuse
   - Log suspicious activity

## References

- External System Model: `app/models/unified_integration.py`
- Khanza Service: `app/services/khanzaService.py`
- Import Service: `app/services/unifiedImportService.py`
- Frontend Service: `src/services/unifiedImportService.js`
