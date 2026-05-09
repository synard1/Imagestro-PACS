"""
Order Management Service v1.0
SIMRS Order Simulator dengan Accession Number Generator
Menyimpan order data untuk integrasi DICOM-SATUSEHAT
"""
import os
import sys
import uuid
import json
import time
from datetime import datetime, timedelta, date, timezone
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import psycopg2
from psycopg2 import errors
from psycopg2.extras import RealDictCursor, Json
from contextlib import contextmanager
import logging
import requests
import jwt
from functools import wraps

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    stream=sys.stdout
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

# Configuration
DB_CONFIG = {
    'host': os.getenv('POSTGRES_HOST', 'postgres'),
    'database': os.getenv('POSTGRES_DB', 'worklist_db'),
    'user': os.getenv('POSTGRES_USER', 'dicom'),
    'password': os.getenv('POSTGRES_PASSWORD', 'dicom123'),
    'port': 5432
}

# Storage root for uploaded order files (inside order-management container)
ORDER_FILES_STORAGE_ROOT = os.getenv('ORDER_FILES_STORAGE_ROOT', '/var/lib/orders/files')

def _get_int_env(name, default):
    value = os.getenv(name)
    if value is None or value == "":
        return default
    try:
        return int(value)
    except ValueError:
        logger.warning(f"Invalid integer for {name}: {value!r}. Falling back to {default}.")
        return default

def _get_float_env(name, default):
    value = os.getenv(name)
    if value is None or value == "":
        return default
    try:
        return float(value)
    except ValueError:
        logger.warning(f"Invalid float for {name}: {value!r}. Falling back to {default}.")
        return default

DB_CONNECT_MAX_RETRIES = max(1, _get_int_env('DB_CONNECT_MAX_RETRIES', 5))
DB_CONNECT_RETRY_BASE_DELAY = max(0.5, _get_float_env('DB_CONNECT_RETRY_BASE_DELAY', 2.0))
DB_CONNECT_RETRY_MAX_DELAY = max(DB_CONNECT_RETRY_BASE_DELAY, _get_float_env('DB_CONNECT_RETRY_MAX_DELAY', 10.0))
DB_INIT_MAX_RETRIES = max(DB_CONNECT_MAX_RETRIES, _get_int_env('DB_INIT_MAX_RETRIES', 10))

# External services
SATUSEHAT_BASE_URL = os.getenv('SATUSEHAT_BASE_URL', 'https://api-satusehat-stg.dto.kemkes.go.id')
SATUSEHAT_CLIENT_ID = os.getenv('SATUSEHAT_CLIENT_ID', '')
SATUSEHAT_CLIENT_SECRET = os.getenv('SATUSEHAT_CLIENT_SECRET', '')
SATUSEHAT_ORG_ID = os.getenv('SATUSEHAT_ORGANIZATION_ID', '100000001')
MWL_SERVICE_URL = os.getenv('MWL_SERVICE_URL', 'http://mwl-writer:8000')
ACCESSION_API_URL = os.getenv('ACCESSION_API_URL', 'http://accession-api:8180')
# Order number configuration
ORDER_NUMBER_PREFIX = os.getenv('ORDER_NUMBER_PREFIX', 'ORD')
ORDER_NUMBER_RESET = os.getenv('ORDER_NUMBER_RESET', 'daily').lower()  # 'daily' or 'monthly'
ORDER_NUMBER_PAD_LENGTH = int(os.getenv('ORDER_NUMBER_PAD_LENGTH', '5'))
ACCESSION_BACKFILL_PREFIX = os.getenv('ACCESSION_BACKFILL_PREFIX', 'ACC')
ACCESSION_BACKFILL_PAD_LENGTH = int(os.getenv('ACCESSION_BACKFILL_PAD_LENGTH', '6'))
MWL_STATION_AET = os.getenv('MWL_STATION_AET', 'SCANNER01')
# Tambahan konfigurasi SATUSEHAT (FHIR + OAuth + referensi)
SATUSEHAT_FHIR_BASE = f"{SATUSEHAT_BASE_URL}/fhir-r4/v1"
SATUSEHAT_OAUTH_URL = f"{SATUSEHAT_BASE_URL}/oauth2/v1/accesstoken"
SATUSEHAT_REQUESTER_REF = os.getenv('SATUSEHAT_REQUESTER_REF')  # contoh: Practitioner/N10000001
SATUSEHAT_PERFORMER_REF = os.getenv('SATUSEHAT_PERFORMER_REF')  # contoh: Organization/10000004
ACSN_SYSTEM_BASE = os.getenv('ACSN_SYSTEM_BASE', 'http://sys-ids.kemkes.go.id/accessionno')
SATUSEHAT_SYNC_OPTIONAL = os.getenv('SATUSEHAT_SYNC_OPTIONAL', 'true').lower() in ('1', 'true', 'yes', 'on')
