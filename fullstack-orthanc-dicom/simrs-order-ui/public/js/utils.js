// utils.js - Utility functions dan helpers
// =====================================================

// DOM selectors
const qs = (sel) => document.querySelector(sel);
const qsa = (sel) => Array.from(document.querySelectorAll(sel));

// Toast notification system
const toast = (msg, type = "info") => {
  const t = qs("#toast");
  t.textContent = msg;
  t.style.borderColor =
    type === "error" ? "#e74c3c" : type === "success" ? "#2ecc71" : "#1b2347";
  t.hidden = false;
  setTimeout(() => (t.hidden = true), 3000);
};

// Global state management
const state = {
  token: localStorage.getItem("simrs_auth_token") || "",
  gatewayBase: "",
  lastResult: null,
};

// Helper untuk menentukan base URL backend UI (origin saat ini)
function appApiBase() {
  try {
    return window.location.origin;
  } catch (_) {
    return "";
  }
}

// Helper untuk menentukan base URL gateway (untuk encounter dan SATUSEHAT API)
function gatewayApiBase() {
  const el = qs("#gateway_base");
  return "http://103.42.117.19:8888".trim();
}

// Date and time utilities
function isoFromLocalDatetime(dtStr) {
  if (!dtStr) return null;
  const d = new Date(dtStr);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString();
}

function formatDateLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function hMinus7DateString() {
  const now = new Date();
  const h7 = new Date(now.getTime());
  h7.setDate(now.getDate() - 7);
  return formatDateLocal(h7);
}

function toLocalDatetimeInput(ts) {
  if (!ts) return "";
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return "";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${y}-${m}-${dd}T${hh}:${mm}`;
  } catch (e) {
    console.error("toLocalDatetimeInput error:", e);
    return "";
  }
}

function localIsoWithOffset(dtStr) {
  if (!dtStr) return null;
  try {
    const d = new Date(dtStr);
    if (isNaN(d.getTime())) return null;
    const offsetMs = d.getTimezoneOffset() * 60000;
    const localISOTime = new Date(d.getTime() - offsetMs).toISOString();
    return localISOTime;
  } catch (e) {
    console.error("localIsoWithOffset error:", e);
    return null;
  }
}

// Registration number formatter
function formatRegistration(serviceType, dtStr) {
  if (!dtStr) return "";
  const d = new Date(dtStr);
  if (isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const prefix = (serviceType || "RJ").toUpperCase();
  const key = `reg_seq_${prefix}_${y}${dd}${m}`;
  let seq = parseInt(localStorage.getItem(key) || "0", 10);
  if (!Number.isFinite(seq) || seq < 0) seq = 0;
  seq += 1;
  localStorage.setItem(key, String(seq));
  const seqStr = String(seq).padStart(4, "0");
  return `${prefix}${y}${dd}${m}${seqStr}`;
}

// Cache utilities
function getCacheAge() {
  try {
    const meta = JSON.parse(
      localStorage.getItem("satusehat_locations_meta") || "{}"
    );
    if (meta.timestamp) {
      const ageMs = Date.now() - meta.timestamp;
      const ageMinutes = Math.floor(ageMs / (1000 * 60));
      const ageHours = Math.floor(ageMinutes / 60);

      if (ageHours > 0) {
        return `${ageHours} jam yang lalu`;
      } else if (ageMinutes > 0) {
        return `${ageMinutes} menit yang lalu`;
      } else {
        return "baru saja";
      }
    }
  } catch (e) {
    console.warn("Error getting cache age:", e);
  }
  return "tidak diketahui";
}

function loadSuggestions(key, datalistId) {
  const arr = JSON.parse(localStorage.getItem(key) || "[]");
  const dl = qs(`#${datalistId}`);
  if (dl)
    dl.innerHTML = arr.map((v) => `<option value="${v}"></option>`).join("");
}

// Data collection utilities
function collectPayload() {
  const patient = {
    national_id: qs("#patient_national_id").value.trim(),
    ihs_number: qs("#ihs_number").value.trim() || null,
    medical_record_number: qs("#mrn").value.trim(),
    name: qs("#patient_name").value.trim(),
    sex: qs("#sex").value,
    birth_date: qs("#birth_date").value,
  };
  const order = {
    modality: qs("#modality").value.trim().toUpperCase(),
    procedure_code: qs("#procedure_code").value.trim(),
    procedure_name: qs("#procedure_name").value.trim(),
    scheduled_at: isoFromLocalDatetime(qs("#scheduled_at").value),
    registration_number: qs("#registration_number").value.trim() || null,
    clinical_notes: qs("#clinical_notes").value.trim() || null,
  };
  const satusehat = {
    satusehat_patient_id: (qs("#ihs_number")?.value || "").trim() || null,
    satusehat_encounter_id:
      (qs("#satusehat_encounter_id")?.value || "").trim() || null,
  };
  return { patient, order, satusehat };
}

function collectSimOrderRecord(payload) {
  return {
    patient_national_id: payload.patient.national_id,
    ihs_number: payload.patient.ihs_number,
    mrn: payload.patient.medical_record_number,
    patient_name: payload.patient.name,
    sex: payload.patient.sex,
    birth_date: payload.patient.birth_date,
    modality: payload.order.modality,
    procedure_code: payload.order.procedure_code,
    procedure_name: payload.order.procedure_name,
    scheduled_at: payload.order.scheduled_at,
    registration_number: payload.order.registration_number,
    clinical_notes: payload.order.clinical_notes,
    service_type: qs("#service_type")?.value || "RJ",
    practitioner_nik: (qs("#practitioner_nik")?.value || "").trim() || null,
    practitioner_name: (qs("#practitioner_name")?.value || "").trim() || null,
    satusehat_practitioner_id:
      (qs("#satusehat_practitioner_id")?.value || "").trim() || null,
    satusehat_location_id:
      (qs("#satusehat_location_id")?.value || "").trim() || null,
    satusehat_encounter_id:
      (qs("#satusehat_encounter_id")?.value || "").trim() || null,
  };
}

// Print utility
function printProof() {
  try {
    window.print();
  } catch (e) {
    toast("Cetak bukti gagal: " + (e?.message || e), "error");
  }
}

// Export functions for use in other modules
window.Utils = {
  qs,
  qsa,
  toast,
  state,
  appApiBase,
  gatewayApiBase,
  isoFromLocalDatetime,
  formatDateLocal,
  hMinus7DateString,
  toLocalDatetimeInput,
  localIsoWithOffset,
  formatRegistration,
  getCacheAge,
  loadSuggestions,
  collectPayload,
  collectSimOrderRecord,
  printProof
};