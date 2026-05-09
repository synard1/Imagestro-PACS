#!/usr/bin/env bash
set -euo pipefail

# E2E Radiology Flow Test Script (Linux/Bash)
# - Menjalankan complete-flow untuk membuat order, sync ServiceRequest ke SATUSEHAT, dan membuat MWL
# - Mensimulasikan C-STORE via Modality Simulator
# - Melakukan polling ImagingStudy di SATUSEHAT berdasarkan Accession Number
#
# Catatan:
# - Script ini tidak dieksekusi otomatis di workspace. Jalankan manual di environment yang sesuai.
# - Pastikan seluruh services berjalan (gateway yang expose order-management, modality-simulator, dicom-router).
# - Pastikan kredensial SATUSEHAT valid.
# - Dependensi: curl, jq

# =========================
# Konfigurasi (dapat di-override via env)
# =========================
GATEWAY_BASE=${GATEWAY_BASE:-"http://localhost:8888"}           # Reverse proxy/gateway ke order-management
AUTH_BASE=${AUTH_BASE:-"http://localhost:5000"}                   # Auth Service endpoint
MODALITY_BASE=${MODALITY_BASE:-"http://localhost:8090"}           # Modality Simulator endpoint
OAUTH_URL=${OAUTH_URL:-"https://api-satusehat-stg.dto.kemkes.go.id/oauth2/v1/accesstoken"}
FHIR_BASE=${FHIR_BASE:-"https://api-satusehat-stg.dto.kemkes.go.id/fhir-r4/v1"}
CLIENT_ID=${CLIENT_ID:-""}
CLIENT_SECRET=${CLIENT_SECRET:-""}
ORG_IHS=${ORG_IHS:-"100000001"}                                   # IHS organisasi (untuk sistem Accession Number)
REQUESTER_REF=${REQUESTER_REF:-"Organization/100000001"}          # Ref peminta (contoh)
PERFORMER_REF=${PERFORMER_REF:-"Organization/100000001"}          # Ref pelaksana (contoh)
SATUSEHAT_PATIENT_ID=${SATUSEHAT_PATIENT_ID:-"1000272487"}
SATUSEHAT_ENCOUNTER_ID=${SATUSEHAT_ENCOUNTER_ID:-"EN1000272487"}

# Admin credentials for Gateway authentication
# WARNING: Do not commit credentials to version control.
ADMIN_USER=${ADMIN_USER:-"admin"}
ADMIN_PASS=${ADMIN_PASS:-"KBC55HX9/a8j9qNeSQJRIQ=="}

# Payload default (dapat disesuaikan)
MODALITY=${MODALITY:-"CT"}
PROCEDURE_CODE=${PROCEDURE_CODE:-"CT-ABD"}
PROCEDURE_NAME=${PROCEDURE_NAME:-"CT Abdomen"}
LOINC_CODE=${LOINC_CODE:-"24723-1"}
PATIENT_NIK=${PATIENT_NIK:-"3201012345678901"}
PATIENT_NAME=${PATIENT_NAME:-"DOE JOHN"}
GENDER=${GENDER:-"male"}
BIRTH_DATE=${BIRTH_DATE:-"1980-01-01"}
MRN=${MRN:-"MRN123456"}
REG_PREFIX=${REG_PREFIX:-"RJ"}

# =========================
# Helpers
# =========================
log() { printf "[%s] %s\n" "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >&2; }
require_bin() {
  command -v "$1" >/dev/null 2>&1 || { log "Error: '$1' tidak ditemukan. Mohon install terlebih dahulu."; exit 1; }
}

require_bin curl
require_bin jq

# =========================
# Gateway Token
# =========================
get_gateway_token() {
  log "Mengambil Gateway token..."
  
  local payload
  payload=$(jq -n \
    --arg username "$ADMIN_USER" \
    --arg password "$ADMIN_PASS" \
    '{username: $username, password: $password}')
    
  local resp
  resp=$(curl -sS -X POST -H 'Content-Type: application/json' -d "$payload" "${AUTH_BASE}/auth/login")
  
  local token
  token=$(echo "$resp" | jq -r '.access_token')

  if [[ -z "$token" || "$token" == "null" ]]; then
    log "Error: Gagal mendapatkan Gateway token."
    log "Response: $resp"
    exit 1
  fi
  
  echo "$token"
}

# =========================
# SATUSEHAT Token
# =========================
get_satusehat_token() {
  log "Mengambil SATUSEHAT token..."
  if [[ -z "${CLIENT_ID}" || "${CLIENT_ID}" == "<set-client-id>" ]]; then
    log "Warning: CLIENT_ID/CLIENT_SECRET tidak di-set. Langkah-langkah terkait SATUSEHAT akan dilewati."
    echo ""
    return
  fi
  local body
  body="grant_type=client_credentials&client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}"
  local resp
  resp=$(curl -sS -X POST -H 'Content-Type: application/x-www-form-urlencoded' -d "$body" "$OAUTH_URL")
  
  local token
  token=$(echo "$resp" | jq -r '.access_token')

  if [[ -z "$token" || "$token" == "null" ]]; then
    log "Warning: Gagal mendapatkan SATUSEHAT token. Langkah-langkah terkait SATUSEHAT akan dilewati."
    log "Response: $resp"
    echo ""
    return
  fi

  echo "$token"
}

# =========================
# Complete Flow (Order + Sync + MWL)
# =========================
new_order_complete_flow() {
  local gateway_token=$1
  log "Memanggil complete-flow untuk membuat order + sync + MWL..."
  local scheduled_at
  scheduled_at=$(date -u -d '30 minutes' +'%Y-%m-%dT%H:%M:%SZ')
  local registration_number
  registration_number="${REG_PREFIX}"$(date +'%Y%m%d')"00001"

  local payload
  payload=$(jq -n \
    --arg modality "$MODALITY" \
    --arg procedure_code "$PROCEDURE_CODE" \
    --arg procedure_name "$PROCEDURE_NAME" \
    --arg scheduled_at "$scheduled_at" \
    --arg patient_national_id "$PATIENT_NIK" \
    --arg patient_name "$PATIENT_NAME" \
    --arg gender "$GENDER" \
    --arg birth_date "$BIRTH_DATE" \
    --arg medical_record_number "$MRN" \
    --arg ihs_number "$ORG_IHS" \
    --arg registration_number "$registration_number" \
    --arg satusehat_patient_id "$SATUSEHAT_PATIENT_ID" \
    --arg satusehat_encounter_id "$SATUSEHAT_ENCOUNTER_ID" \
    --arg loinc_code "$LOINC_CODE" \
    --arg requester_ref "$REQUESTER_REF" \
    --arg performer_ref "$PERFORMER_REF" \
    '{ 
      modality: $modality,
      procedure_code: $procedure_code,
      procedure_name: $procedure_name,
      scheduled_at: $scheduled_at,
      patient_national_id: $patient_national_id,
      patient_name: $patient_name,
      gender: $gender,
      birth_date: $birth_date,
      medical_record_number: $medical_record_number,
      ihs_number: $ihs_number,
      registration_number: $registration_number,
      satusehat_patient_id: $satusehat_patient_id,
      satusehat_encounter_id: $satusehat_encounter_id,
      loinc_code: $loinc_code,
      requester_ref: $requester_ref,
      performer_ref: $performer_ref
    }')

  local resp
  resp=$(curl -sS -X POST -H "Authorization: Bearer ${gateway_token}" -H 'Content-Type: application/json' -d "$payload" "$GATEWAY_BASE/orders/complete-flow")
  echo "$resp"
}

# =========================
# Simulasi C-STORE via Modality Simulator
# =========================
simulate_cstore() {
  local order_json=$1
  log "Mensimulasikan scan dan C-STORE ke DICOM Router..."

  local p_name p_id p_birth p_sex study_uid accn proc_desc modality
  p_name=$(echo "$order_json" | jq -r '.patient_name')
  p_id=$(echo   "$order_json" | jq -r '.medical_record_number')
  p_birth=$(echo "$order_json" | jq -r '.birth_date' | tr -d '-')
  local gender
  gender=$(echo "$order_json" | jq -r '.gender')
  case "$gender" in
    male) p_sex="M";;
    female) p_sex="F";;
    *) p_sex="O";;
  esac
  study_uid="" # biarkan simulator generate
  accn=$(echo "$order_json" | jq -r '.accession_number')
  modality=$(echo "$order_json" | jq -r '.modality')
  proc_desc=$(echo "$order_json" | jq -r '.procedure_name // .procedure_code')

  local payload
  payload=$(jq -n \
    --arg patient_name "$(echo "$p_name" | sed 's/ /\^/g')" \
    --arg patient_id "$p_id" \
    --arg patient_birth_date "$p_birth" \
    --arg patient_sex "$p_sex" \
    --arg study_uid "$study_uid" \
    --arg accession_number "$accn" \
    --arg procedure_description "$proc_desc" \
    --arg modality "$modality" \
    '{ 
      patient_name: $patient_name,
      patient_id: $patient_id,
      patient_birth_date: $patient_birth_date,
      patient_sex: $patient_sex,
      study_uid: $study_uid,
      accession_number: $accession_number,
      procedure_description: $procedure_description,
      modality: $modality
    }')

  local resp
  resp=$(curl -sS -X POST -H 'Content-Type: application/json' -d "$payload" "$MODALITY_BASE/scan/simulate")
  echo "$resp"
}

# =========================
# Polling ImagingStudy dari SATUSEHAT
# =========================
wait_for_imaging_study() {
  local fhir_base=$1 token=$2 org_ihs=$3 acsn=$4 max_tries=${5:-12} delay_sec=${6:-10}
  log "Polling ImagingStudy di SATUSEHAT (identifier=accessionno|${acsn})..."

  for ((i=1; i<=max_tries; i++)); do
    local url="${fhir_base}/ImagingStudy?identifier=http://sys-ids.kemkes.go.id/accessionno/${org_ihs}|${acsn}&_count=1&_sort=-_lastUpdated"
    local resp
    resp=$(curl -sS -H "Authorization: Bearer ${token}" "$url" || true)
    local total
    total=$(echo "$resp" | jq -r '.total // 0' 2>/dev/null || echo 0)
    if [[ "$total" -gt 0 ]]; then
      echo "$resp" | jq -c '.entry[0].resource'
      return 0
    fi
    log "Percobaan $i: belum ditemukan, menunggu ${delay_sec}s..."
    sleep "$delay_sec"
  done
  echo "" # kosong jika tidak ketemu
  return 1
}

# =========================
# Main
# =========================
log "=== Mulai E2E Radiology Flow (bash) ==="

# 1) Gateway Token
GATEWAY_TOKEN=$(get_gateway_token)
log "Gateway Token didapat: ***$(echo "$GATEWAY_TOKEN" | cut -c1-8)..."

# 2) SATUSEHAT Token
SATUSEHAT_TOKEN=$(get_satusehat_token)
if [[ -n "$SATUSEHAT_TOKEN" ]]; then
  log "SATUSEHAT Token didapat: ***$(echo "$SATUSEHAT_TOKEN" | cut -c1-8)..."
fi

# 3) Complete Flow
CF_RESP=$(new_order_complete_flow "$GATEWAY_TOKEN")
STATUS=$(echo "$CF_RESP" | jq -r '.status')
if [[ "$STATUS" != "success" ]]; then
  echo "$CF_RESP" | jq '.' >&2
  log "Error: complete-flow gagal"
  exit 1
fi
ACSN=$(echo "$CF_RESP" | jq -r '.accession_number')
ORDER_JSON=$(echo "$CF_RESP" | jq -c '.order')
log "Order dibuat. Accession Number: ${ACSN}, Status: ${STATUS}"

# 4) Simulasi C-STORE
CSTORE_RESP=$(simulate_cstore "$ORDER_JSON")
CSTORE_STATUS=$(echo "$CSTORE_RESP" | jq -r '.status')
log "C-STORE: ${CSTORE_STATUS} - Accession: $(echo "$CSTORE_RESP" | jq -r '.accession_number // "N/A"')"

# 5) Poll ImagingStudy
if [[ -n "$SATUSEHAT_TOKEN" ]]; then
  STUDY_JSON=$(wait_for_imaging_study "$FHIR_BASE" "$SATUSEHAT_TOKEN" "$ORG_IHS" "$ACSN") || true
  if [[ -z "$STUDY_JSON" ]]; then
    log "Error: ImagingStudy belum ditemukan setelah polling."
    # Do not exit, this is not a critical failure for the whole flow
  else
    STUDY_ID=$(echo "$STUDY_JSON" | jq -r '.id')
    ACC_ID=$(echo "$STUDY_JSON" | jq -r '.identifier[] | select(.system | test("accessionno")) | .value' | head -n1)
    log "ImagingStudy ditemukan: ID=${STUDY_ID} AccessionIdentifier=${ACC_ID}"
  fi
else
  log "Dilewati: Polling ImagingStudy karena token SATUSEHAT tidak ada."
fi

log "=== Selesai ==="
