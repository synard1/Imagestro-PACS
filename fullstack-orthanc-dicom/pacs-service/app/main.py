"""
PACS Service Main Application with Enhanced Logging & Performance Monitoring
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from prometheus_fastapi_instrumentator import Instrumentator
from contextlib import asynccontextmanager
import logging
import sys
import time
import os

from app.database import check_db_connection, test_db_operations
from app.config import settings
from fastapi_cache import FastAPICache
from fastapi_cache.backends.redis import RedisBackend

# Import all models to ensure they are registered with SQLAlchemy
from app.models.tenant import Tenant, TenantInvitation
from app.models.usage import UsageRecord, UsageAlert, BillingEvent
from app.models.feature_flag import FeatureFlag
from app.models.subscription import Subscription
from app.models.storage_migration import StorageMigration
from app.models.storage_health import StorageBackendHealth


# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("/var/log/pacs/app.log"),
    ],
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan with enhanced logging"""
    # Startup
    logger.info("=" * 80)
    logger.info("PACS Service Starting...")
    logger.info(f"Version: {settings.app_version}")

    # Check database connection
    if check_db_connection():
        logger.info("✔ Database connection established")
        test_db_operations()

    # Initialize Cache
    try:
        redis_url = str(os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0"))
        FastAPICache.init(RedisBackend(redis_url), prefix="fastapi-cache")
        logger.info("✔ FastAPI Cache initialized with Redis")
    except Exception as e:
        logger.error(f"✗ Failed to initialize FastAPI Cache: {e}")

    logger.info("PACS Service Ready")
    yield


# Create FastAPI application
app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    lifespan=lifespan,
    docs_url="/api/docs",
)

# Prometheus Instrumentation
Instrumentator().instrument(app).expose(
    app, endpoint="/api/v1/metrics", tags=["health"]
)

# Performance Monitoring Middleware (Bottleneck Tracker)
from starlette.requests import Request


@app.middleware("http")
async def performance_tracker(request: Request, call_next):
    start_time = time.time()
    response = await call_next(request)
    process_time = time.time() - start_time

    # Track slow requests
    if process_time > 0.5:
        logger.warning(
            f"🌐 SLOW: {request.method} {request.url.path} took {process_time:.4f}s"
        )

    response.headers["X-Process-Time"] = str(process_time)
    return response


# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Standard Routers (Minimal set for health)
@app.get("/api/health", tags=["health"])
async def health_check():
    return {"status": "healthy", "timestamp": time.time()}


# Include ALL API Routers
from app.api.reports import router as reports_router
from app.api.studies import router as studies_router
from app.api.storage import router as storage_router
from app.api.storage_backends import router as storage_backends_router
from app.api.storage_monitor import router as storage_monitor
from app.api.wado import router as wado_router
from app.api.thumbnail_api import router as thumbnails_router
from app.api.metrics import router as metrics_router

# Tenant & Subscription routers
from app.api.tenants import router as tenants_router
from app.api.subscriptions import router as subscriptions_router
from app.api.usage import router as usage_router
from app.api.csrf import router as csrf_router
from app.api.audit import router as audit_router
from app.api.external_systems import router as external_systems_router
from app.api.khanza import router as khanza_router
from app.routers.notification_settings import router as notification_settings_router
from app.routers import dicom_nodes as dicom_nodes_router
from app.api.billing import router as billing_router
from app.api.storage_migration import router as storage_migration_router
from app.api.storage_locations import router as storage_locations_router
from app.api.storage_health import router as storage_health_router

# DICOM Upload routers — aktivasi endpoint upload langsung ke PACS
# POST /api/dicom/upload-v2  (upload tunggal, order_id opsional)
# POST /api/dicom/bulk-upload (upload banyak file, cocok untuk multi-pemeriksaan)
from app.api.dicom_upload import router as dicom_upload_router
from app.api.bulk_operations import router as bulk_operations_router

app.include_router(reports_router)
app.include_router(studies_router)
app.include_router(storage_router)
app.include_router(storage_backends_router)
app.include_router(storage_monitor)
app.include_router(wado_router)
app.include_router(thumbnails_router)
app.include_router(metrics_router)
app.include_router(tenants_router)
app.include_router(subscriptions_router)
app.include_router(usage_router)
app.include_router(csrf_router)
app.include_router(audit_router)
app.include_router(external_systems_router)
app.include_router(khanza_router)
app.include_router(notification_settings_router)
app.include_router(dicom_nodes_router.router)
app.include_router(billing_router)
app.include_router(storage_migration_router)
app.include_router(storage_locations_router)
app.include_router(storage_health_router)
app.include_router(dicom_upload_router)
app.include_router(bulk_operations_router)

logger.info(
    "✔ All API routers registered including DICOM Upload, Storage Migration, Locations & Health"
)
