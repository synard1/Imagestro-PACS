import os
from fastapi import FastAPI, HTTPException, Request, Header, Depends
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from starlette.staticfiles import StaticFiles
from dotenv import load_dotenv
from typing import Optional, List, Dict, Any
import httpx
import psycopg2
from psycopg2.extras import RealDictCursor
from datetime import datetime, date
import logging
from pydantic import BaseModel
import json

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("mwl-ui")

load_dotenv()

# Configuration
GATEWAY_BASE = os.getenv("GATEWAY_BASE", "http://api-gateway:8888")
APP_DIR = os.path.dirname(__file__)
PUBLIC_DIR = os.path.join(APP_DIR, "public")
INDEX_FILE = os.path.join(PUBLIC_DIR, "index.html")

# Database configuration
PG_CONFIG = {
    "host": os.getenv("POSTGRES_HOST", "postgres"),
    "port": int(os.getenv("POSTGRES_PORT", "5432")),
    "dbname": os.getenv("POSTGRES_DB", "worklist_db"),
    "user": os.getenv("POSTGRES_USER", "dicom"),
    "password": os.getenv("POSTGRES_PASSWORD", "dicom123"),
    "connect_timeout": int(os.getenv("POSTGRES_CONNECT_TIMEOUT", "10")),
}

# FastAPI app initialization
app = FastAPI(
    title="MWL UI Service",
    description="Modality Worklist User Interface for DICOM Worklist Management",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files
app.mount("/static", StaticFiles(directory=PUBLIC_DIR), name="static")

# Pydantic models
class WorklistItem(BaseModel):
    accession_number: str
    patient_id: str
    patient_name: str
    patient_birth_date: Optional[str] = None
    patient_sex: Optional[str] = None
    study_instance_uid: str
    study_description: Optional[str] = None
    modality: str
    scheduled_station_aet: str
    scheduled_procedure_step_start_date: str
    scheduled_procedure_step_start_time: str
    scheduled_performing_physician: Optional[str] = None
    requested_procedure_description: Optional[str] = None
    study_status: Optional[str] = "SCHEDULED"

class WorklistFilter(BaseModel):
    patient_id: Optional[str] = None
    patient_name: Optional[str] = None
    accession_number: Optional[str] = None
    modality: Optional[str] = None
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    station_aet: Optional[str] = None
    status: Optional[str] = None

class WorklistUpdate(BaseModel):
    study_status: str
    performed_procedure_step_start_date: Optional[str] = None
    performed_procedure_step_start_time: Optional[str] = None
    performed_procedure_step_end_date: Optional[str] = None
    performed_procedure_step_end_time: Optional[str] = None

# Database connection helper
def get_db_connection():
    """Get database connection"""
    try:
        conn = psycopg2.connect(**PG_CONFIG)
        return conn
    except Exception as e:
        logger.error(f"Database connection error: {e}")
        raise HTTPException(status_code=500, detail="Database connection failed")

# Authentication helper
async def verify_token(authorization: Optional[str] = Header(None)):
    """Verify JWT token via API Gateway"""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid authorization header")
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{GATEWAY_BASE}/auth/verify",
                headers={"Authorization": authorization}
            )
            if response.status_code != 200:
                raise HTTPException(status_code=401, detail="Invalid token")
            return response.json()
    except Exception as e:
        logger.error(f"Token verification error: {e}")
        raise HTTPException(status_code=401, detail="Token verification failed")

# Routes
@app.get("/", include_in_schema=False)
async def root():
    """Serve the main UI"""
    return FileResponse(INDEX_FILE)

@app.get("/health")
async def health():
    """Health check endpoint"""
    try:
        # Test database connection
        conn = get_db_connection()
        conn.close()
        return {"status": "healthy", "service": "mwl-ui", "timestamp": datetime.now().isoformat()}
    except Exception as e:
        return {"status": "unhealthy", "error": str(e), "timestamp": datetime.now().isoformat()}

@app.get("/config")
async def config():
    """Get configuration for frontend"""
    return {
        "gateway_base": GATEWAY_BASE,
        "service_name": "MWL UI",
        "version": "1.0.0"
    }

@app.get("/api/worklist", response_model=List[Dict[str, Any]])
async def get_worklist(
    patient_id: Optional[str] = None,
    patient_name: Optional[str] = None,
    accession_number: Optional[str] = None,
    modality: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    station_aet: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    user_data: dict = Depends(verify_token)
):
    """Get worklist items with filtering"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Build query with filters
        query = """
            SELECT 
                accession_number,
                patient_id,
                patient_name,
                patient_birth_date,
                patient_sex,
                study_instance_uid,
                study_description,
                modality,
                scheduled_station_aet,
                scheduled_procedure_step_start_date,
                scheduled_procedure_step_start_time,
                scheduled_performing_physician,
                requested_procedure_description,
                study_status,
                created_at,
                updated_at
            FROM worklist_items 
            WHERE 1=1
        """
        
        params = []
        
        if patient_id:
            query += " AND patient_id ILIKE %s"
            params.append(f"%{patient_id}%")
        
        if patient_name:
            query += " AND patient_name ILIKE %s"
            params.append(f"%{patient_name}%")
        
        if accession_number:
            query += " AND accession_number ILIKE %s"
            params.append(f"%{accession_number}%")
        
        if modality:
            query += " AND modality = %s"
            params.append(modality)
        
        if date_from:
            query += " AND scheduled_procedure_step_start_date >= %s"
            params.append(date_from)
        
        if date_to:
            query += " AND scheduled_procedure_step_start_date <= %s"
            params.append(date_to)
        
        if station_aet:
            query += " AND scheduled_station_aet = %s"
            params.append(station_aet)
        
        if status:
            query += " AND study_status = %s"
            params.append(status)
        
        query += " ORDER BY scheduled_procedure_step_start_date DESC, scheduled_procedure_step_start_time DESC"
        query += " LIMIT %s OFFSET %s"
        params.extend([limit, offset])
        
        cursor.execute(query, params)
        results = cursor.fetchall()
        
        # Convert to list of dicts and handle date serialization
        worklist_items = []
        for row in results:
            item = dict(row)
            # Convert date objects to strings
            for key, value in item.items():
                if isinstance(value, date):
                    item[key] = value.isoformat()
                elif isinstance(value, datetime):
                    item[key] = value.isoformat()
            worklist_items.append(item)
        
        cursor.close()
        conn.close()
        
        return worklist_items
        
    except Exception as e:
        logger.error(f"Error fetching worklist: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch worklist: {str(e)}")

@app.get("/api/worklist/{accession_number}")
async def get_worklist_item(
    accession_number: str,
    user_data: dict = Depends(verify_token)
):
    """Get specific worklist item by accession number"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        cursor.execute("""
            SELECT * FROM worklist_items 
            WHERE accession_number = %s
        """, (accession_number,))
        
        result = cursor.fetchone()
        cursor.close()
        conn.close()
        
        if not result:
            raise HTTPException(status_code=404, detail="Worklist item not found")
        
        # Convert to dict and handle date serialization
        item = dict(result)
        for key, value in item.items():
            if isinstance(value, date):
                item[key] = value.isoformat()
            elif isinstance(value, datetime):
                item[key] = value.isoformat()
        
        return item
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching worklist item: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch worklist item: {str(e)}")

@app.put("/api/worklist/{accession_number}")
async def update_worklist_item(
    accession_number: str,
    update_data: WorklistUpdate,
    user_data: dict = Depends(verify_token)
):
    """Update worklist item status"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Check if item exists
        cursor.execute("SELECT id FROM worklist_items WHERE accession_number = %s", (accession_number,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Worklist item not found")
        
        # Update the item
        update_fields = ["study_status = %s", "updated_at = %s"]
        params = [update_data.study_status, datetime.now()]
        
        if update_data.performed_procedure_step_start_date:
            update_fields.append("performed_procedure_step_start_date = %s")
            params.append(update_data.performed_procedure_step_start_date)
        
        if update_data.performed_procedure_step_start_time:
            update_fields.append("performed_procedure_step_start_time = %s")
            params.append(update_data.performed_procedure_step_start_time)
        
        if update_data.performed_procedure_step_end_date:
            update_fields.append("performed_procedure_step_end_date = %s")
            params.append(update_data.performed_procedure_step_end_date)
        
        if update_data.performed_procedure_step_end_time:
            update_fields.append("performed_procedure_step_end_time = %s")
            params.append(update_data.performed_procedure_step_end_time)
        
        params.append(accession_number)
        
        query = f"""
            UPDATE worklist_items 
            SET {', '.join(update_fields)}
            WHERE accession_number = %s
        """
        
        cursor.execute(query, params)
        conn.commit()
        cursor.close()
        conn.close()
        
        return {"message": "Worklist item updated successfully", "accession_number": accession_number}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating worklist item: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update worklist item: {str(e)}")

@app.get("/api/statistics")
async def get_statistics(user_data: dict = Depends(verify_token)):
    """Get worklist statistics"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Get overall statistics
        cursor.execute("""
            SELECT 
                COUNT(*) as total_items,
                COUNT(CASE WHEN study_status = 'SCHEDULED' THEN 1 END) as scheduled,
                COUNT(CASE WHEN study_status = 'IN_PROGRESS' THEN 1 END) as in_progress,
                COUNT(CASE WHEN study_status = 'COMPLETED' THEN 1 END) as completed,
                COUNT(CASE WHEN study_status = 'CANCELLED' THEN 1 END) as cancelled
            FROM worklist_items
        """)
        
        stats = dict(cursor.fetchone())
        
        # Get modality breakdown
        cursor.execute("""
            SELECT modality, COUNT(*) as count
            FROM worklist_items
            GROUP BY modality
            ORDER BY count DESC
        """)
        
        modality_stats = [dict(row) for row in cursor.fetchall()]
        
        # Get daily statistics for the last 7 days
        cursor.execute("""
            SELECT 
                scheduled_procedure_step_start_date as date,
                COUNT(*) as count
            FROM worklist_items
            WHERE scheduled_procedure_step_start_date >= CURRENT_DATE - INTERVAL '7 days'
            GROUP BY scheduled_procedure_step_start_date
            ORDER BY scheduled_procedure_step_start_date
        """)
        
        daily_stats = []
        for row in cursor.fetchall():
            item = dict(row)
            if isinstance(item['date'], date):
                item['date'] = item['date'].isoformat()
            daily_stats.append(item)
        
        cursor.close()
        conn.close()
        
        return {
            "overview": stats,
            "modalities": modality_stats,
            "daily_trend": daily_stats
        }
        
    except Exception as e:
        logger.error(f"Error fetching statistics: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch statistics: {str(e)}")

@app.get("/api/export/csv")
async def export_csv(
    patient_id: Optional[str] = None,
    patient_name: Optional[str] = None,
    accession_number: Optional[str] = None,
    modality: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    station_aet: Optional[str] = None,
    status: Optional[str] = None,
    user_data: dict = Depends(verify_token)
):
    """Export worklist items to CSV"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Build query with filters (same as get_worklist)
        query = """
            SELECT 
                accession_number,
                patient_id,
                patient_name,
                patient_birth_date,
                patient_sex,
                study_instance_uid,
                study_description,
                modality,
                scheduled_station_aet,
                scheduled_procedure_step_start_date,
                scheduled_procedure_step_start_time,
                scheduled_performing_physician,
                requested_procedure_description,
                study_status
            FROM worklist_items 
            WHERE 1=1
        """
        
        params = []
        
        if patient_id:
            query += " AND patient_id ILIKE %s"
            params.append(f"%{patient_id}%")
        
        if patient_name:
            query += " AND patient_name ILIKE %s"
            params.append(f"%{patient_name}%")
        
        if accession_number:
            query += " AND accession_number ILIKE %s"
            params.append(f"%{accession_number}%")
        
        if modality:
            query += " AND modality = %s"
            params.append(modality)
        
        if date_from:
            query += " AND scheduled_procedure_step_start_date >= %s"
            params.append(date_from)
        
        if date_to:
            query += " AND scheduled_procedure_step_start_date <= %s"
            params.append(date_to)
        
        if station_aet:
            query += " AND scheduled_station_aet = %s"
            params.append(station_aet)
        
        if status:
            query += " AND study_status = %s"
            params.append(status)
        
        query += " ORDER BY scheduled_procedure_step_start_date DESC, scheduled_procedure_step_start_time DESC"
        
        cursor.execute(query, params)
        results = cursor.fetchall()
        
        # Generate CSV content
        import csv
        import io
        
        output = io.StringIO()
        writer = csv.writer(output)
        
        # Write header
        if results:
            writer.writerow(results[0].keys())
            
            # Write data rows
            for row in results:
                # Convert date objects to strings
                row_data = []
                for value in row.values():
                    if isinstance(value, (date, datetime)):
                        row_data.append(value.isoformat())
                    else:
                        row_data.append(str(value) if value is not None else "")
                writer.writerow(row_data)
        
        cursor.close()
        conn.close()
        
        # Return CSV response
        from fastapi.responses import Response
        csv_content = output.getvalue()
        output.close()
        
        return Response(
            content=csv_content,
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=worklist_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"}
        )
        
    except Exception as e:
        logger.error(f"Error exporting CSV: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to export CSV: {str(e)}")

# Proxy endpoints for gateway integration
@app.api_route("/api/gateway/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"])
async def gateway_proxy(path: str, request: Request, authorization: Optional[str] = Header(None)):
    """Proxy requests to API Gateway"""
    try:
        async with httpx.AsyncClient() as client:
            # Forward the request to the gateway
            headers = dict(request.headers)
            if authorization:
                headers["Authorization"] = authorization
            
            # Get request body if present
            body = None
            if request.method in ["POST", "PUT"]:
                body = await request.body()
            
            response = await client.request(
                method=request.method,
                url=f"{GATEWAY_BASE}/{path}",
                headers=headers,
                content=body,
                params=dict(request.query_params)
            )
            
            return JSONResponse(
                content=response.json() if response.content else {},
                status_code=response.status_code
            )
            
    except Exception as e:
        logger.error(f"Gateway proxy error: {e}")
        raise HTTPException(status_code=500, detail="Gateway proxy failed")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8096)