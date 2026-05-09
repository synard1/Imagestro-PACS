import os
from fastapi import FastAPI, HTTPException, Request, Header
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from starlette.staticfiles import StaticFiles
from dotenv import load_dotenv
from typing import Optional
import httpx
from models import OrderCreatePayload, CompleteFlowPayload, SimOrderRecord, SimOrderUpdate, ServiceRequestPayload
from gateway import GatewayClient
from utils import get_logger
import psycopg2
from psycopg2.extras import RealDictCursor
from datetime import datetime
from fastapi.encoders import jsonable_encoder

logger = get_logger("app")

load_dotenv()
# GATEWAY_BASE = os.getenv("GATEWAY_BASE", "http://103.42.117.19:8888")
GATEWAY_BASE = "http://103.42.117.19:8888"
APP_DIR = os.path.dirname(__file__)
PUBLIC_DIR = os.path.join(APP_DIR, "public")
INDEX_FILE = os.path.join(PUBLIC_DIR, "index.html")
DB_PATH = os.path.join(APP_DIR, "sim_orders.db")

api = FastAPI(title="SIMRS Radiology Order UI", version="1.0.0")

api.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

client = GatewayClient(GATEWAY_BASE)

api.mount("/static", StaticFiles(directory=PUBLIC_DIR), name="static")


@api.get("/", include_in_schema=False)
async def root():
    return FileResponse(INDEX_FILE)


@api.get("/health")
async def health():
    return {"status": "ok"}


@api.get("/config")
async def config():
    return {"gateway_base": GATEWAY_BASE}


@api.post("/api/auth/login")
async def auth_login(data: dict):
    try:
        username = data.get("username", "").strip()
        password = data.get("password", "")
        if not username or not password:
            raise HTTPException(status_code=400, detail="Username dan password diperlukan")
        result = await client.login(username, password)
        logger.info("Login success for user=%s", username)
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Login error: %s", e)
        raise HTTPException(status_code=502, detail="Gagal terhubung ke gateway auth")


# Proxy umum untuk SATUSEHAT via API Gateway
@api.api_route("/api/satusehat/{subpath:path}", methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"])
async def satusehat_proxy(subpath: str, request: Request, authorization: Optional[str] = Header(None)):
    # Preflight CORS (meski same-origin, aman untuk disediakan)
    if request.method == "OPTIONS":
        return JSONResponse(status_code=204, content={})
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Authorization Bearer token diperlukan")
    target_url = f"{GATEWAY_BASE}/satusehat/{subpath}"
    # Forward query params
    params = dict(request.query_params)
    headers = {"Authorization": authorization}
    try:
        async with httpx.AsyncClient(timeout=30) as hc:
            if request.method == "GET":
                resp = await hc.get(target_url, headers=headers, params=params)
            elif request.method == "POST":
                body = None
                try:
                    body = await request.json()
                except Exception:
                    body = None
                resp = await hc.post(target_url, headers=headers, params=params, json=body)
            elif request.method == "PUT":
                body = None
                try:
                    body = await request.json()
                except Exception:
                    body = None
                resp = await hc.put(target_url, headers=headers, params=params, json=body)
            elif request.method == "DELETE":
                resp = await hc.delete(target_url, headers=headers, params=params)
            else:
                return JSONResponse(status_code=405, content={"detail": "Method not allowed"})
        # Return response transparently (prefer JSON if possible)
        ct = resp.headers.get("content-type", "")
        try:
            content = resp.json()
            return JSONResponse(status_code=resp.status_code, content=content)
        except Exception:
            # Fallback to text for non-JSON
            return JSONResponse(status_code=resp.status_code, content={"detail": resp.text})
    except httpx.HTTPStatusError as e:  # type: ignore
        status = e.response.status_code if hasattr(e, "response") else 502
        logger.warning("Gateway SATUSEHAT rejected: %s", e)
        raise HTTPException(status_code=status, detail=str(e))
    except Exception as e:
        logger.exception("SATUSEHAT proxy error: %s", e)
        raise HTTPException(status_code=502, detail="Gagal menghubungi gateway SATUSEHAT")


@api.post("/api/orders/create")
async def orders_create(payload: OrderCreatePayload, authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Authorization Bearer token diperlukan")
    token = authorization.split(" ", 1)[1]
    try:
        gw_payload = payload.to_gateway_payload()
        result = await client.create_order(token, gw_payload)
        logger.info("Order created: %s", result)
        return result
    except httpx.HTTPStatusError as e:  # type: ignore
        status = e.response.status_code if hasattr(e, "response") else 502
        logger.warning("Gateway rejected create: %s", e)
        raise HTTPException(status_code=status, detail=str(e))
    except Exception as e:
        logger.exception("Create order error: %s", e)
        raise HTTPException(status_code=502, detail="Gagal membuat order di gateway")


@api.post("/api/orders/complete-flow")
async def orders_complete_flow(payload: CompleteFlowPayload, authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Authorization Bearer token diperlukan")
    token = authorization.split(" ", 1)[1]
    try:
        gw_payload = payload.to_gateway_payload()
        result = await client.complete_flow(token, gw_payload)
        logger.info("Order complete-flow: %s", result)
        return result
    except httpx.HTTPStatusError as e:  # type: ignore
        status = e.response.status_code if hasattr(e, "response") else 502
        logger.warning("Gateway rejected complete-flow: %s", e)
        raise HTTPException(status_code=status, detail=str(e))
    except Exception as e:
        logger.exception("Complete-flow error: %s", e)
        raise HTTPException(status_code=502, detail="Gagal menjalankan complete-flow di gateway")


@api.get("/api/orders/{identifier}")
async def orders_get(identifier: str, authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Authorization Bearer token diperlukan")
    token = authorization.split(" ", 1)[1]
    try:
        result = await client.get_order(token, identifier)
        logger.info("Order get: %s", identifier)
        return result
    except httpx.HTTPStatusError as e:  # type: ignore
        status = e.response.status_code if hasattr(e, "response") else 502
        logger.warning("Gateway rejected get order: %s", e)
        raise HTTPException(status_code=status, detail=str(e))
    except Exception as e:
        logger.exception("Get order error: %s", e)
        raise HTTPException(status_code=502, detail="Gagal mengambil data order dari gateway")


@api.post("/api/servicerequest/create")
async def service_request_create(payload: ServiceRequestPayload, authorization: Optional[str] = Header(None)):
    """Create a ServiceRequest in SatuSehat"""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Authorization Bearer token diperlukan")
    token = authorization.split(" ", 1)[1]
    
    try:
        # Convert payload to dict for gateway - fix field names to match expected format
        # Pastikan locationId tidak mengandung "Location/" prefix
        location_id = payload.location_id
        if location_id and location_id.startswith("Location/"):
            location_id = location_id.replace("Location/", "")
            
        service_request_data = {
            "patientId": payload.patient_id,
            "encounterId": payload.encounter_id,
            "practitionerId": payload.practitioner_id,
            "locationId": location_id,
            "code": payload.code,
            "codeDisplay": payload.code_display,
            "category": payload.category_code,
            "categoryDisplay": payload.category_display,
            "priority": payload.priority,
            "intent": payload.intent,
            "status": payload.status,
            "authoredOn": payload.authored_on.isoformat() if payload.authored_on else datetime.now().isoformat(),
            "reasonCode": payload.reason_code,
            "reasonDisplay": payload.reason_display,
            "note": payload.note
        }
        
        # Pastikan semua field yang wajib ada nilainya
        if not service_request_data["patientId"]:
            raise HTTPException(status_code=400, detail="patient_id wajib diisi")
        if not service_request_data["encounterId"]:
            raise HTTPException(status_code=400, detail="encounter_id wajib diisi")
        if not service_request_data["practitionerId"]:
            raise HTTPException(status_code=400, detail="practitioner_id wajib diisi")
        if not service_request_data["locationId"]:
            raise HTTPException(status_code=400, detail="location_id wajib diisi")
        if not service_request_data["code"]:
            raise HTTPException(status_code=400, detail="code wajib diisi")
        if not service_request_data["codeDisplay"]:
            raise HTTPException(status_code=400, detail="code_display wajib diisi")
        
        # Log the request data for debugging
        logger.info("Sending service request data: %s", service_request_data)
        
        result = await client.create_service_request(token, service_request_data)
        logger.info("ServiceRequest created: %s", result)
        return result
    except httpx.HTTPStatusError as e:  # type: ignore
        status = e.response.status_code if hasattr(e, "response") else 502
        error_detail = str(e)
        if hasattr(e, "response") and hasattr(e.response, "text"):
            error_detail = f"{error_detail} - Response: {e.response.text}"
        logger.warning("Gateway rejected service request creation: %s", error_detail)
        raise HTTPException(status_code=status, detail=error_detail)
    except Exception as e:
        logger.exception("Service request creation error: %s", e)
        raise HTTPException(status_code=502, detail="Gagal membuat service request di SatuSehat")


# Postgres DB config (align with project env vars)
PG_CONFIG = {
    "host": os.getenv("PGHOST") or os.getenv("POSTGRES_HOST", "localhost"),
    "port": int(os.getenv("PGPORT") or os.getenv("POSTGRES_PORT", "5532")),
    "dbname": os.getenv("PGDATABASE") or os.getenv("POSTGRES_DB", "worklist_db"),
    "user": os.getenv("PGUSER") or os.getenv("POSTGRES_USER", "dicom"),
    "password": os.getenv("PGPASSWORD") or os.getenv("POSTGRES_PASSWORD", "dicom123"),
    "connect_timeout": int(os.getenv("PGCONNECT_TIMEOUT", "10")),
}


def _db_connect_pg():
    return psycopg2.connect(**PG_CONFIG)


def _init_db_pg():
    conn = _db_connect_pg()
    cur = conn.cursor()
    # Ensure uuid extension for primary keys
    try:
        cur.execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')
    except Exception as e:
        logger.warning("Create extension uuid-ossp failed (ignored): %s", e)
    # Base table (creates full schema if not exists)
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS sim_orders (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            created_at TIMESTAMPTZ DEFAULT now(),
            patient_national_id VARCHAR(16),
            ihs_number VARCHAR(64),
            mrn VARCHAR(50),
            patient_name VARCHAR(200),
            sex VARCHAR(10),
            birth_date DATE,
            modality VARCHAR(10),
            procedure_code VARCHAR(50),
            procedure_name VARCHAR(200),
            scheduled_at TIMESTAMPTZ,
            registration_number VARCHAR(50),
            clinical_notes TEXT,
            service_type VARCHAR(20),
            served_status VARCHAR(20) DEFAULT 'pending',
            dicom_status VARCHAR(20) DEFAULT 'pending',
            satusehat_status VARCHAR(20) DEFAULT 'pending',
            satusehat_imaging_study_id VARCHAR(100),
            practitioner_nik VARCHAR(16),
            practitioner_name VARCHAR(200),
            satusehat_practitioner_id VARCHAR(100),
            satusehat_location_id VARCHAR(100),
            encounter_status VARCHAR(20) DEFAULT 'none',
            service_request_status VARCHAR(20) DEFAULT 'none',
            satusehat_encounter_id VARCHAR(100),
            satusehat_service_request_id VARCHAR(100)
        )
        """
    )
    # Robust column ensuring without relying on IF NOT EXISTS (for older PG)
    cur.execute(
        """
        SELECT column_name FROM information_schema.columns
        WHERE table_schema='public' AND table_name='sim_orders'
        """
    )
    existing_cols = {r[0] for r in cur.fetchall()}
    required_cols = {
        "encounter_status": "VARCHAR(20) DEFAULT 'none'",
        "service_request_status": "VARCHAR(20) DEFAULT 'none'",
        "satusehat_encounter_id": "VARCHAR(100)",
        "satusehat_service_request_id": "VARCHAR(100)",
        "practitioner_nik": "VARCHAR(16)",
        "practitioner_name": "VARCHAR(200)",
        "satusehat_practitioner_id": "VARCHAR(100)",
        "satusehat_location_id": "VARCHAR(100)",
    }
    for col, definition in required_cols.items():
        if col not in existing_cols:
            try:
                cur.execute(f"ALTER TABLE sim_orders ADD COLUMN {col} {definition}")
                logger.info("Added missing column: %s", col)
            except Exception as e:
                logger.warning("Failed to add column %s: %s", col, e)
    
    # Ensure satusehat_service_request_id can handle UUID (36 characters)
    try:
        cur.execute("""
            ALTER TABLE sim_orders 
            ALTER COLUMN satusehat_service_request_id TYPE VARCHAR(100)
        """)
        logger.info("Updated satusehat_service_request_id column to VARCHAR(100)")
    except Exception as e:
        logger.warning("Failed to update satusehat_service_request_id column size: %s", e)
    # Indexes
    indexes = [
        ("idx_sim_orders_created_at", "created_at"),
        ("idx_sim_orders_registration_number", "registration_number"),
        ("idx_sim_orders_patient_national_id", "patient_national_id"),
        ("idx_sim_orders_encounter_id", "satusehat_encounter_id"),
        ("idx_sim_orders_sr_id", "satusehat_service_request_id"),
        ("idx_sim_orders_prac_nik", "practitioner_nik"),
        ("idx_sim_orders_prac_id", "satusehat_practitioner_id"),
    ]
    for idx_name, col in indexes:
        try:
            cur.execute(f"CREATE INDEX IF NOT EXISTS {idx_name} ON sim_orders({col})")
        except Exception as e:
            logger.warning("Create index %s failed (ignored): %s", idx_name, e)
    conn.commit()
    conn.close()
    logger.info(
        "Postgres init OK: sim_orders ensured with indexes (host=%s db=%s)",
        PG_CONFIG["host"],
        PG_CONFIG["dbname"],
    )


try:
    _init_db_pg()
except Exception as e:
    logger.warning(
        "Postgres unavailable, skipping SIM orders table init (host=%s db=%s): %s",
        PG_CONFIG.get("host"),
        PG_CONFIG.get("dbname"),
        e,
    )


@api.post("/sim/orders")
async def sim_orders_create(record: SimOrderRecord):
    def iso(val):
        try:
            return val.isoformat()
        except Exception:
            return val

    try:
        conn = _db_connect_pg()
    except Exception as e:
        logger.warning("PG connect failed for sim_orders_create: %s", e)
        raise HTTPException(status_code=503, detail="Database tidak tersedia")
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        # Cek duplikasi. Prioritaskan pencocokan berdasar registration_number jika tersedia.
        existing = None
        key_reg = (record.registration_number or "").strip()
        if key_reg:
            cur.execute(
                """
                SELECT id FROM sim_orders
                WHERE COALESCE(registration_number,'') = COALESCE(%s,'')
                ORDER BY created_at DESC
                LIMIT 1
                """,
                (record.registration_number,),
            )
            existing = cur.fetchone()
        else:
            # Fallback ke kriteria kombinasi jika registration_number kosong
            cur.execute(
                """
                SELECT id FROM sim_orders
                WHERE COALESCE(registration_number,'') = COALESCE(%s,'')
                  AND COALESCE(mrn,'') = COALESCE(%s,'')
                  AND COALESCE(procedure_code,'') = COALESCE(%s,'')
                  AND COALESCE(patient_national_id,'') = COALESCE(%s,'')
                  AND COALESCE(modality,'') = COALESCE(%s,'')
                  AND (
                    COALESCE(satusehat_practitioner_id,'') = COALESCE(%s,'')
                    OR COALESCE(practitioner_nik,'') = COALESCE(%s,'')
                  )
                ORDER BY created_at DESC
                LIMIT 1
                """,
                (
                    record.registration_number,
                    record.mrn,
                    record.procedure_code,
                    record.patient_national_id,
                    str(record.modality) if record.modality else None,
                    record.satusehat_practitioner_id or "",
                    record.practitioner_nik or "",
                ),
            )
            existing = cur.fetchone()
        if existing and existing.get("id"):
            # Lakukan UPDATE bila data sama / ditemukan via registration_number
            order_id = existing["id"].decode("utf-8") if isinstance(existing.get("id"), bytes) else str(existing["id"]) if existing.get("id") is not None else None
            cur.execute(
                """
                UPDATE sim_orders SET
                    patient_national_id=%s, ihs_number=%s, mrn=%s, patient_name=%s, sex=%s, birth_date=%s,
                    modality=%s, procedure_code=%s, procedure_name=%s, scheduled_at=%s, registration_number=%s,
                    clinical_notes=%s, service_type=%s, served_status=%s, dicom_status=%s, satusehat_status=%s,
                    satusehat_imaging_study_id=%s, practitioner_nik=%s, practitioner_name=%s, satusehat_practitioner_id=%s, satusehat_location_id=%s,
                    encounter_status=%s, service_request_status=%s,
                    satusehat_encounter_id=%s, satusehat_service_request_id=%s
                WHERE id=%s
                RETURNING *
                """,
                (
                    record.patient_national_id,
                    record.ihs_number,
                    record.mrn,
                    record.patient_name,
                    record.sex,
                    iso(record.birth_date),
                    str(record.modality) if record.modality else None,
                    record.procedure_code,
                    record.procedure_name,
                    iso(record.scheduled_at),
                    record.registration_number,
                    record.clinical_notes,
                    record.service_type,
                    record.served_status or "pending",
                    record.dicom_status or "pending",
                    record.satusehat_status or "pending",
                    record.satusehat_imaging_study_id,
                    record.practitioner_nik,
                    record.practitioner_name,
                    record.satusehat_practitioner_id,
                    record.satusehat_location_id,
                    record.encounter_status or "none",
                    record.service_request_status or "none",
                    record.satusehat_encounter_id,
                    record.satusehat_service_request_id,
                    order_id,
                ),
            )
            row = cur.fetchone()
            conn.commit()
            if not row:
                raise HTTPException(status_code=404, detail="Order tidak ditemukan untuk update")
            if isinstance(row.get("id"), bytes):
                row["id"] = row["id"].decode("utf-8")
            else:
                row["id"] = str(row["id"]) if row.get("id") is not None else None
            return jsonable_encoder({**row, "updated": True})
        else:
            # Tidak duplikat, lakukan INSERT seperti biasa
            cur.execute(
                """
                INSERT INTO sim_orders (
                    patient_national_id, ihs_number, mrn, patient_name, sex, birth_date,
                    modality, procedure_code, procedure_name, scheduled_at, registration_number,
                    clinical_notes, service_type, served_status, dicom_status, satusehat_status,
                    satusehat_imaging_study_id, practitioner_nik, practitioner_name, satusehat_practitioner_id, satusehat_location_id,
                    encounter_status, service_request_status, satusehat_encounter_id, satusehat_service_request_id
                ) VALUES (
                    %s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s
                )
                RETURNING id, created_at
                """,
                (
                    record.patient_national_id,
                    record.ihs_number,
                    record.mrn,
                    record.patient_name,
                    record.sex,
                    iso(record.birth_date),
                    str(record.modality) if record.modality else None,
                    record.procedure_code,
                    record.procedure_name,
                    iso(record.scheduled_at),
                    record.registration_number,
                    record.clinical_notes,
                    record.service_type,
                    record.served_status or "pending",
                    record.dicom_status or "pending",
                    record.satusehat_status or "pending",
                    record.satusehat_imaging_study_id,
                    record.practitioner_nik,
                    record.practitioner_name,
                    record.satusehat_practitioner_id,
                    record.satusehat_location_id,
                    record.encounter_status or "none",
                    record.service_request_status or "none",
                    record.satusehat_encounter_id,
                    record.satusehat_service_request_id,
                ),
            )
            row = cur.fetchone()
            conn.commit()
            created_at = row["created_at"]
            new_id = str(row["id"]) if row.get("id") is not None else None
            return {"id": new_id, "created_at": created_at, **record.model_dump(), "created": True}
    except Exception as e:
        conn.rollback()
        logger.exception("Upsert sim_orders failed: %s", e)
        raise HTTPException(status_code=500, detail="Gagal menyimpan order ke DB")
    finally:
        conn.close()


@api.get("/sim/orders")
async def sim_orders_list():
    try:
        conn = _db_connect_pg()
    except Exception as e:
        logger.warning("PG connect failed for sim_orders_list: %s", e)
        return []
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT * FROM sim_orders ORDER BY created_at DESC")
        rows = cur.fetchall()
    except Exception as e:
        logger.warning("Query sim_orders list failed: %s", e)
        rows = []
    finally:
        conn.close()
    for r in rows:
        if isinstance(r.get("id"), bytes):
            r["id"] = r["id"].decode("utf-8")
        else:
            r["id"] = str(r["id"]) if r.get("id") is not None else None
    return jsonable_encoder(rows)

@api.get("/sim/orders/{order_id}")
async def sim_orders_get(order_id: str):
    try:
        conn = _db_connect_pg()
    except Exception as e:
        logger.warning("PG connect failed for sim_orders_get: %s", e)
        raise HTTPException(status_code=503, detail="Database tidak tersedia")
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT * FROM sim_orders WHERE id=%s", (order_id,))
        row = cur.fetchone()
    except Exception as e:
        logger.warning("Query sim_orders get failed: %s", e)
        row = None
    finally:
        conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Order tidak ditemukan")
    if isinstance(row.get("id"), bytes):
        row["id"] = row["id"].decode("utf-8")
    else:
        row["id"] = str(row["id"]) if row.get("id") is not None else None
    return jsonable_encoder(row)

@api.put("/sim/orders/{order_id}")
async def sim_orders_put(order_id: str, record: SimOrderRecord):
    def iso(val):
        try:
            return val.isoformat()
        except Exception:
            return val
    try:
        conn = _db_connect_pg()
    except Exception as e:
        logger.warning("PG connect failed for sim_orders_put: %s", e)
        raise HTTPException(status_code=503, detail="Database tidak tersedia")
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            """
            UPDATE sim_orders SET
                patient_national_id=%s, ihs_number=%s, mrn=%s, patient_name=%s, sex=%s, birth_date=%s,
                modality=%s, procedure_code=%s, procedure_name=%s, scheduled_at=%s, registration_number=%s,
                clinical_notes=%s, service_type=%s, served_status=%s, dicom_status=%s, satusehat_status=%s,
                satusehat_imaging_study_id=%s, practitioner_nik=%s, practitioner_name=%s, satusehat_practitioner_id=%s, satusehat_location_id=%s,
                encounter_status=%s, service_request_status=%s,
                satusehat_encounter_id=%s, satusehat_service_request_id=%s
            WHERE id=%s
            RETURNING *
            """,
            (
                record.patient_national_id,
                record.ihs_number,
                record.mrn,
                record.patient_name,
                record.sex,
                iso(record.birth_date),
                str(record.modality) if record.modality else None,
                record.procedure_code,
                record.procedure_name,
                iso(record.scheduled_at),
                record.registration_number,
                record.clinical_notes,
                record.service_type,
                record.served_status or "pending",
                record.dicom_status or "pending",
                record.satusehat_status or "pending",
                record.satusehat_imaging_study_id,
                record.practitioner_nik,
                record.practitioner_name,
                record.satusehat_practitioner_id,
                record.satusehat_location_id,
                record.encounter_status or "none",
                record.service_request_status or "none",
                record.satusehat_encounter_id,
                record.satusehat_service_request_id,
                order_id,
            ),
        )
        row = cur.fetchone()
        conn.commit()
    except Exception as e:
        logger.warning("Update sim_orders put failed: %s", e)
        raise HTTPException(status_code=400, detail="Gagal mengupdate order")
    finally:
        conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Order tidak ditemukan")
    if isinstance(row.get("id"), bytes):
        row["id"] = row["id"].decode("utf-8")
    else:
        row["id"] = str(row["id"]) if row.get("id") is not None else None
    return jsonable_encoder(row)

@api.patch("/sim/orders/{order_id}")
async def sim_orders_patch(order_id: str, patch: SimOrderUpdate):
    def iso(val):
        try:
            return val.isoformat()
        except Exception:
            return val
    try:
        conn = _db_connect_pg()
    except Exception as e:
        logger.warning("PG connect failed for sim_orders_patch: %s", e)
        raise HTTPException(status_code=503, detail="Database tidak tersedia")
    fields = patch.model_dump(exclude_unset=True)
    if not fields:
        raise HTTPException(status_code=400, detail="Tidak ada field untuk diupdate")
    allowed = {
        "patient_national_id","ihs_number","mrn","patient_name","sex","birth_date",
        "modality","procedure_code","procedure_name","scheduled_at","registration_number",
        "clinical_notes","service_type","served_status","dicom_status","satusehat_status",
        "satusehat_imaging_study_id",
        "practitioner_nik","practitioner_name","satusehat_practitioner_id","satusehat_location_id",
        "encounter_status","service_request_status",
        "satusehat_encounter_id","satusehat_service_request_id",
    }
    update_data = {}
    for k, v in fields.items():
        if k not in allowed:
            continue
        if k == "modality" and v is not None:
            update_data[k] = str(v)
        elif k in ("birth_date", "scheduled_at") and v is not None:
            update_data[k] = iso(v)
        else:
            update_data[k] = v
    if not update_data:
        raise HTTPException(status_code=400, detail="Field tidak valid untuk diupdate")
    set_clause = ", ".join([f"{k}=%s" for k in update_data.keys()])
    params = list(update_data.values()) + [order_id]
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(f"UPDATE sim_orders SET {set_clause} WHERE id=%s RETURNING *", params)
        row = cur.fetchone()
        conn.commit()
    except Exception as e:
        logger.warning("Update sim_orders patch failed: %s", e)
        raise HTTPException(status_code=400, detail="Gagal mengupdate order")
    finally:
        conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Order tidak ditemukan")
    if isinstance(row.get("id"), bytes):
        row["id"] = row["id"].decode("utf-8")
    else:
        row["id"] = str(row["id"]) if row.get("id") is not None else None
    return jsonable_encoder(row)

@api.delete("/sim/orders/{order_id}")
async def sim_orders_delete(order_id: str):
    try:
        conn = _db_connect_pg()
    except Exception as e:
        logger.warning("PG connect failed for sim_orders_delete: %s", e)
        raise HTTPException(status_code=503, detail="Database tidak tersedia")
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("DELETE FROM sim_orders WHERE id=%s RETURNING id", (order_id,))
        row = cur.fetchone()
        conn.commit()
    except Exception as e:
        logger.warning("Delete sim_orders failed: %s", e)
        raise HTTPException(status_code=400, detail="Gagal menghapus order")
    finally:
        conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Order tidak ditemukan")
    deleted_id = row["id"].decode("utf-8") if isinstance(row.get("id"), bytes) else str(row["id"]) if row.get("id") is not None else None
    return {"deleted": True, "id": deleted_id}


@api.patch("/sim/orders/{order_id}/service-request")
async def sim_orders_update_service_request(order_id: str, data: dict):
    """Update service request ID for a specific order - DEBUG MODE: NO VALIDATIONS"""
    service_request_id = data.get("service_request_id", "")
    
    logger.info("DEBUG MODE: Attempting to update service request ID for order %s with service_request_id: %s", order_id, service_request_id)
    
    # Connect to database - return raw error if fails
    try:
        conn = _db_connect_pg()
        cur = conn.cursor(cursor_factory=RealDictCursor)
    except Exception as e:
        logger.error("Database connection failed: %s", e)
        return {
            "debug_mode": True,
            "error": "database_connection_failed",
            "raw_error": str(e),
            "order_id": order_id,
            "service_request_id": service_request_id
        }
    
    # Try to update directly - return all database responses
    try:
        # First get current state
        cur.execute("SELECT * FROM sim_orders WHERE id=%s", (order_id,))
        before_update = cur.fetchone()
        
        # Attempt update without any validation
        cur.execute(
            """
            UPDATE sim_orders SET
                satusehat_service_request_id=%s,
                service_request_status='created',
                satusehat_status='service_request_created'
            WHERE id=%s
            RETURNING *
            """,
            (service_request_id, order_id)
        )
        after_update = cur.fetchone()
        conn.commit()
        
        # Return complete debug information
        return {
            "debug_mode": True,
            "success": True,
            "order_id": order_id,
            "service_request_id": service_request_id,
            "service_request_id_length": len(service_request_id),
            "before_update": dict(before_update) if before_update else None,
            "after_update": dict(after_update) if after_update else None,
            "update_successful": after_update is not None
        }
        
    except Exception as e:
        conn.rollback()
        logger.error("Raw database error: %s", e)
        
        # Return complete error information for debugging
        return {
            "debug_mode": True,
            "success": False,
            "error": "database_update_failed",
            "raw_error": str(e),
            "error_type": type(e).__name__,
            "order_id": order_id,
            "service_request_id": service_request_id,
            "service_request_id_length": len(service_request_id),
            "before_update": dict(before_update) if 'before_update' in locals() and before_update else None
        }
    finally:
        conn.close()