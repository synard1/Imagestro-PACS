// Version 1.0.0
// Last updated: 2025-10-27

const qs = (sel) => document.querySelector(sel);
const qsa = (sel) => Array.from(document.querySelectorAll(sel));

// Global variables for static data
let SAMPLE_PATIENTS = [];
let SAMPLE_PRACTITIONERS = [];
let PROCEDURE_SAMPLES = [];
let LOINC_LABELS = [];

const toast = (msg, type = "info") => {
  const t = qs("#toast");
  t.textContent = msg;
  t.style.borderColor =
    type === "error" ? "#e74c3c" : type === "success" ? "#2ecc71" : "#1b2347";
  t.hidden = false;
  setTimeout(() => (t.hidden = true), 3000);
};

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
  // return (el?.value || state.gatewayBase || "http://103.42.117.19:8888").trim();
  return "http://103.42.117.19:8888".trim();
}

// Implementasi login: kirim ke backend UI dan simpan token
async function login(e) {
  try {
    e?.preventDefault?.();
  } catch {}
  const username = (qs("#username")?.value || "").trim();
  const password = qs("#password")?.value || "";
  const btn = qs("#btn-login");
  const statusEl = qs("#login-status");

  if (!username || !password) {
    if (statusEl) statusEl.textContent = "Isi username dan password";
    toast("Username dan password wajib diisi", "error");
    return;
  }

  try {
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Login...";
    }
    if (statusEl) statusEl.textContent = "";

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.message || `Login gagal (${res.status})`);
    }
    const token = data?.access_token || data?.token;
    if (!token) throw new Error("Token tidak ditemukan dalam respon");

    // Simpan token dan update state
    localStorage.setItem("simrs_auth_token", token);
    state.token = token;

    if (statusEl) statusEl.textContent = "Login berhasil";
    toast("Login berhasil", "success");

    // Fetch lokasi setelah login
    try {
      // await fetchSatusehatLocations();
    } catch {}
  } catch (err) {
    console.error("Login error:", err);
    if (statusEl) statusEl.textContent = "Login gagal";
    toast("Login gagal: " + (err?.message || err), "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Login";
    }
  }
}

async function fetchConfig() {
  try {
    const res = await fetch("/config");
    const json = await res.json();
    state.gatewayBase = json.gateway_base || "http://103.42.117.19:8888";
    const gb = qs("#gateway_base");
    if (gb) gb.value = state.gatewayBase;
  } catch (e) {
    console.warn("Failed to get config", e);
  }
}

async function loadStaticData() {
  try {
    const [patsRes, pracRes, procRes, loincRes] = await Promise.all([
      fetch("/static/data/patients.json"),
      fetch("/static/data/practitioners.json"),
      fetch("/static/data/procedures.json"),
      fetch("/static/data/loinc-labels.json"),
    ]);
    SAMPLE_PATIENTS = await patsRes.json();
    SAMPLE_PRACTITIONERS = await pracRes.json();
    PROCEDURE_SAMPLES = await procRes.json();
    LOINC_LABELS = await loincRes.json();
  } catch (e) {
    console.error("Gagal memuat data statis", e);
  }
}

// Enhanced Fetch & cache SATUSEHAT Location with robust error handling
async function fetchSatusehatLocations(retryCount = 0) {
  const maxRetries = 3;
  const retryDelay = 1000 * Math.pow(2, retryCount); // Exponential backoff

  if (!state.token) {
    console.warn("⚠️ Token belum tersedia; lewati fetch lokasi");
    const cachedItems = JSON.parse(
      localStorage.getItem("satusehat_locations") || "[]"
    );
    if (cachedItems.length > 0) {
      populateLocationDropdown(cachedItems);
      toast(
        "⚠️ Token belum tersedia. Menggunakan lokasi dari cache. Silakan login untuk data terbaru.",
        "error"
      );
    } else {
      toast(
        "❌ Token belum tersedia. Silakan login terlebih dahulu untuk memuat lokasi SATUSEHAT.",
        "error"
      );
    }
    return;
  }

  const base = gatewayApiBase();
  const url = base + "/satusehat/location";

  try {
    console.log(`Fetching locations from: ${url} (attempt ${retryCount + 1})`);

    const res = await fetch(url, {
      headers: {
        Authorization: "Bearer " + state.token,
        "Content-Type": "application/json",
      },
      timeout: 10000, // 10 second timeout
    });

    if (res.status === 401) {
      console.warn("Authentication expired (401), clearing token");
      localStorage.removeItem("simrs_auth_token");
      state.token = "";

      const cachedItems = JSON.parse(
        localStorage.getItem("satusehat_locations") || "[]"
      );
      if (cachedItems.length > 0) {
        populateLocationDropdown(cachedItems);
        toast(
          "Sesi login telah berakhir. Menggunakan data cache. Silakan login ulang.",
          "error"
        );
      } else {
        toast(
          "Sesi login telah berakhir. Silakan login ulang untuk memuat lokasi.",
          "error"
        );
      }
      return;
    }

    if (res.status === 503) {
      if (retryCount < maxRetries) {
        console.warn(
          `Service unavailable (503), retrying in ${retryDelay}ms...`
        );
        toast(
          `Layanan sedang tidak tersedia, mencoba lagi dalam ${
            retryDelay / 1000
          } detik...`,
          "info"
        );
        setTimeout(() => fetchSatusehatLocations(retryCount + 1), retryDelay);
        return;
      } else {
        throw new Error(
          "Layanan SATUSEHAT tidak tersedia setelah beberapa percobaan"
        );
      }
    }

    if (!res.ok) {
      throw new Error(
        `Gagal memuat Location (${res.status}: ${res.statusText})`
      );
    }

    const j = await res.json().catch(() => ({}));
    const items = Array.isArray(j.entry)
      ? j.entry
          .map((e) => {
            const r = e.resource || {};
            const name = r.name || (Array.isArray(r.alias) ? r.alias[0] : "");
            return { id: r.id, name };
          })
          .filter((it) => it.id && it.name)
      : [];

    // Cache successful response with timestamp
    const cacheData = {
      items: items,
      timestamp: Date.now(),
      version: "1.0",
    };
    localStorage.setItem("satusehat_locations", JSON.stringify(items));
    localStorage.setItem("satusehat_locations_meta", JSON.stringify(cacheData));

    populateLocationDropdown(items);
    toast(`Berhasil memuat ${items.length} lokasi dari SATUSEHAT`, "success");
  } catch (e) {
    console.error("Fetch lokasi error:", e);

    // Handle network errors with retry
    if (
      (e.name === "TypeError" || e.message.includes("fetch")) &&
      retryCount < maxRetries
    ) {
      console.warn(`Network error, retrying in ${retryDelay}ms...`);
      toast(
        `Koneksi bermasalah, mencoba lagi dalam ${retryDelay / 1000} detik...`,
        "info"
      );
      setTimeout(() => fetchSatusehatLocations(retryCount + 1), retryDelay);
      return;
    }

    // Fallback to cached data
    const cachedItems = JSON.parse(
      localStorage.getItem("satusehat_locations") || "[]"
    );
    populateLocationDropdown(cachedItems);

    if (cachedItems.length > 0) {
      const cacheAge = getCacheAge();
      toast(
        `Gagal memuat lokasi terbaru. Menggunakan cache (${cacheAge}). Error: ${e.message}`,
        "error"
      );
    } else {
      toast(
        `Gagal memuat lokasi dan tidak ada cache tersedia. Error: ${e.message}`,
        "error"
      );
    }
  }
}

// Helper function to get cache age
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

function populateLocationDropdown(items) {
  const sel = qs("#satusehat_location_id");
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML =
    '<option value="">-- pilih lokasi --</option>' +
    (items || [])
      .map((it) => `<option value="${it.id}">${it.name} (${it.id})</option>`)
      .join("");
  if (current) sel.value = current;
}

function loadSuggestions(key, datalistId) {
  const arr = JSON.parse(localStorage.getItem(key) || "[]");
  const dl = qs(`#${datalistId}`);
  if (dl)
    dl.innerHTML = arr.map((v) => `<option value="${v}"></option>`).join("");
}

function isoFromLocalDatetime(dtStr) {
  if (!dtStr) return null;
  const d = new Date(dtStr);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString();
}

// General registration formatter by service type prefix (RJ/RI/IGD)
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

function autoSelectHMinus7() {
  try {
    const regDateEl = qs("#registration_date");
    const schedEl = qs("#scheduled_at");
    if (!regDateEl || !schedEl) return;
    const regDateStr = (regDateEl.value || "").trim();
    if (!regDateStr) return;
    const target = hMinus7DateString();
    if (regDateStr !== target) return;

    const now = new Date();
    const regHH = now.getHours();
    const regMM = now.getMinutes();
    state.hMinus7RefTime = { hh: regHH, mm: regMM };

    let plusHourHH = regHH + 1;
    let plusHourMM = regMM;
    if (plusHourHH >= 24) {
      plusHourHH = 23;
      plusHourMM = 59;
    }

    const hh = String(plusHourHH).padStart(2, "0");
    const mm = String(plusHourMM).padStart(2, "0");
    schedEl.value = `${regDateStr}T${hh}:${mm}`;
    autoGenerateRegistrationOnScheduleChange();
    toast(
      `Auto-select H-7: Jadwal tindakan di-set ke ${hh}:${mm} (±1 jam)`,
      "success"
    );
  } catch (e) {
    console.error("autoSelectHMinus7 error:", e);
    toast("Gagal auto-select H-7", "error");
  }
}

function validateHMinus7Selection() {
  const regDateEl = qs("#registration_date");
  const schedEl = qs("#scheduled_at");
  if (!regDateEl || !schedEl) return true;
  const regDateStr = (regDateEl.value || "").trim();
  if (!regDateStr) return true;
  const isH7 = regDateStr === hMinus7DateString();
  if (!isH7) return true;

  const schedStr = (schedEl.value || "").trim();
  if (!schedStr) {
    toast("Untuk H-7, jadwal harus diisi", "error");
    return false;
  }

  const [dPart] = schedStr.split("T");
  if (dPart !== regDateStr) {
    toast("Untuk H-7, jadwal harus pada hari yang sama", "error");
    return false;
  }
  return true;
}

function autoGenerateRegistrationOnScheduleChange() {
  const regDateEl = qs("#registration_date");
  const sched = qs("#scheduled_at");
  const reg = qs("#registration_number");
  const svc = qs("#service_type");
  if (!reg) return;
  const baseDate =
    (regDateEl?.value || "").trim() || (sched?.value || "").trim();
  if (!baseDate) return;
  const regNo = formatRegistration(svc?.value || "RJ", baseDate);
  if (regNo) reg.value = regNo;
}

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

async function submitOrder(e) {
  try {
    if (e) e.preventDefault();
    const payload = collectPayload();
    if (!validateHMinus7Selection()) return;
    const previewEl = qs("#preview-json");
    const modalEl = qs("#order-preview-modal");
    if (previewEl) previewEl.textContent = JSON.stringify(payload, null, 2);
    if (modalEl) modalEl.hidden = false;
    const confirmBtn = qs("#btn-confirm");
    if (confirmBtn) {
      confirmBtn.onclick = async () => {
        await confirmAndSendOrder(payload);
      };
    }
  } catch (err) {
    console.error("Submit error:", err);
    toast("Gagal menyiapkan preview: " + (err?.message || err), "error");
  }
}

async function confirmAndSendOrder(payload, simOrderId) {
  const base = appApiBase();
  const completeFlow = !!qs("#complete_flow")?.checked;
  const url = completeFlow ? "/orders/complete-flow" : "/orders/create";
  const btn = qs("#btn-confirm");
  try {
    if (btn) btn.disabled = true;
    const headers = { "Content-Type": "application/json" };
    if (state.token) headers["Authorization"] = "Bearer " + state.token;
    const res = await fetch(base + url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    state.lastResult = json;
    const resultEl = qs("#result-json");
    const resultCard = qs("#result-card");
    if (resultEl) resultEl.textContent = JSON.stringify(json, null, 2);
    if (resultCard) resultCard.hidden = false;
    const modalEl = qs("#order-preview-modal");
    if (modalEl) modalEl.hidden = true;
    toast(
      res.ok
        ? "Order berhasil dikirim"
        : "Order gagal: " + (json?.detail || res.statusText),
      res.ok ? "success" : "error"
    );
    if (simOrderId) {
      try {
        await patchSimOrderAfterSend(simOrderId, json, res.ok);
        await loadSimOrders();
      } catch (e) {
        console.warn("Patch status order gagal:", e);
      }
    }
  } catch (err) {
    console.error("Kirim order error:", err);
    toast("Gagal mengirim order: " + (err?.message || err), "error");
  } finally {
    if (btn) btn.disabled = false;
  }
}

function printProof() {
  try {
    window.print();
  } catch (e) {
    toast("Cetak bukti gagal: " + (e?.message || e), "error");
  }
}

function applyDummyFromPreset(e) {
  try {
    e?.preventDefault?.();
  } catch (_) {}
  const set = (selector, val) => {
    const el = qs(selector);
    if (el) el.value = val ?? "";
  };
  const samples = (SAMPLE_PATIENTS || []).filter(Boolean);
  const p = samples[0] || null;
  if (!p) {
    toast("Data dummy belum tersedia", "error");
    return;
  }
  set("#ihs_number", p.ihs || "");
  set("#patient_national_id", p.nik || "");
  set("#patient_name", p.name || "");
  const sex = (p.gender || "").toLowerCase();
  if (sex === "male" || sex === "female") set("#sex", sex);
  set("#birth_date", p.birthDate || "");
  toast("Preset dummy diterapkan", "success");
}

function renderPatientSamples(list) {
  const items = Array.isArray(list) ? list : SAMPLE_PATIENTS || [];
  const tbody = qs("#patient-results");
  if (!tbody) return;
  if (!items.length) {
    tbody.innerHTML = '<tr><td colspan="6">Tidak ada data</td></tr>';
    return;
  }
  tbody.innerHTML = items
    .map((p) => {
      const nik = p.nik || "";
      const name = p.name || "";
      const gender = p.gender || "";
      const birth = p.birthDate || "";
      const ihs = p.ihs || "";
      return (
        `<tr data-nik="${nik}" data-name="${name}" data-gender="${gender}" data-birth="${birth}" data-ihs="${ihs}">` +
        `<td>${nik}</td><td>${name}</td><td>${gender}</td><td>${birth}</td><td>-</td><td>${ihs}</td>` +
        `</tr>`
      );
    })
    .join("");
  Array.from(tbody.querySelectorAll("tr")).forEach((tr) => {
    tr.ondblclick = () => {
      const d = tr.dataset;
      const setVal = (sel, val) => {
        const el = qs(sel);
        if (el) el.value = val || "";
      };
      setVal("#patient_national_id", d.nik);
      setVal("#ihs_number", d.ihs);
      setVal("#patient_name", d.name);
      setVal("#sex", d.gender);
      setVal("#birth_date", d.birth);
      const modal = qs("#patient-search-modal");
      if (modal) modal.hidden = true;
      toast("Pasien dipilih", "success");
    };
  });
}

function doPatientSearch() {
  const srcNik = (qs("#patient_search_nik")?.value || "").toLowerCase();
  const srcIhs = (qs("#patient_search_ihs")?.value || "").toLowerCase();
  const srcName = (qs("#patient_search_name")?.value || "").toLowerCase();
  const items = SAMPLE_PATIENTS || [];
  const filtered = items.filter(
    (p) =>
      (!srcNik ||
        String(p.nik || "")
          .toLowerCase()
          .includes(srcNik)) &&
      (!srcIhs ||
        String(p.ihs || "")
          .toLowerCase()
          .includes(srcIhs)) &&
      (!srcName ||
        String(p.name || "")
          .toLowerCase()
          .includes(srcName))
  );
  renderPatientSamples(filtered);
}

function renderPractitionerSamples(list) {
  const items = Array.isArray(list) ? list : SAMPLE_PRACTITIONERS || [];
  const tbody = qs("#practitioner-results");
  if (!tbody) return;
  if (!items.length) {
    tbody.innerHTML = '<tr><td colspan="6">Tidak ada data</td></tr>';
    return;
  }
  tbody.innerHTML = items
    .map((p) => {
      const nik = p.nik || "";
      const name = p.name || "";
      const gender = p.gender || "";
      const birth = p.birthDate || "";
      const ihs = p.ihs || "";
      return (
        `<tr data-nik="${nik}" data-name="${name}" data-gender="${gender}" data-birth="${birth}" data-ihs="${ihs}">` +
        `<td>${nik}</td><td>${name}</td><td>${gender}</td><td>${birth}</td><td>-</td><td>${ihs}</td>` +
        `</tr>`
      );
    })
    .join("");
  Array.from(tbody.querySelectorAll("tr")).forEach((tr) => {
    tr.ondblclick = () => {
      const d = tr.dataset;
      const setVal = (sel, val) => {
        const el = qs(sel);
        if (el) el.value = val || "";
      };
      setVal("#practitioner_nik", d.nik);
      setVal("#practitioner_name", d.name);
      setVal("#satusehat_practitioner_id", d.ihs);
      const modal = qs("#practitioner-search-modal");
      if (modal) modal.hidden = true;
      toast("Practitioner dipilih", "success");
    };
  });
}

function doPractitionerSearch() {
  const srcNik = (qs("#prac_search_nik")?.value || "").toLowerCase();
  const srcName = (qs("#prac_search_name")?.value || "").toLowerCase();
  const items = SAMPLE_PRACTITIONERS || [];
  const filtered = items.filter(
    (p) =>
      (!srcNik ||
        String(p.nik || "")
          .toLowerCase()
          .includes(srcNik)) &&
      (!srcName ||
        String(p.name || "")
          .toLowerCase()
          .includes(srcName))
  );
  renderPractitionerSamples(filtered);
}

function renderProcedureCatalog(list) {
  let items = Array.isArray(list) ? list : PROCEDURE_SAMPLES || [];
  if (!items.length && LOINC_LABELS) {
    items = Object.entries(LOINC_LABELS).map(([code, display], idx) => ({
      no: idx + 1,
      name: display,
      type: "LOINC",
      code,
      display,
      modality: "",
    }));
  }
  const tbody = qs("#procedure-results");
  if (!tbody) return;
  if (!items.length) {
    tbody.innerHTML = '<tr><td colspan="5">Tidak ada data</td></tr>';
    return;
  }
  tbody.innerHTML = items
    .map((it) => {
      const no = it.no ?? "";
      const name = it.name ?? it.display ?? "";
      const type = it.type ?? "";
      const code = it.code ?? "";
      const display = it.display ?? "";
      const modality = it.modality ?? "";
      return (
        `<tr data-code="${code}" data-name="${name}" data-modality="${modality}">` +
        `<td>${no}</td><td>${name}</td><td>${type}</td><td>${code}</td><td>${display}</td>` +
        `</tr>`
      );
    })
    .join("");
  Array.from(tbody.querySelectorAll("tr")).forEach((tr) => {
    tr.ondblclick = () => {
      const d = tr.dataset;
      const setVal = (sel, val) => {
        const el = qs(sel);
        if (el) el.value = val || "";
      };
      setVal("#procedure_code", d.code);
      setVal("#procedure_name", d.name || d.code);
      if (d.modality) setVal("#modality", d.modality);
      const modal = qs("#procedure-modal");
      if (modal) modal.hidden = true;
      toast("Tindakan dipilih", "success");
    };
  });
}

function localIsoWithOffset(dtStr) {
  if (!dtStr) return null;
  const d = new Date(dtStr);
  const tzMin = -d.getTimezoneOffset();
  const sign = tzMin >= 0 ? "+" : "-";
  const abs = Math.abs(tzMin);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  const [datePart, timePart] = dtStr.split("T");
  const timeWithSeconds = timePart.length === 5 ? `${timePart}:00` : timePart;
  return `${datePart}T${timeWithSeconds}${sign}${hh}:${mm}`;
}

async function resolveSatusehatPatientId() {
  const explicitId = (qs("#ihs_number")?.value || "").trim();
  if (explicitId) {
    state.patientId = explicitId;
    return explicitId;
  }
  const nik = (qs("#patient_national_id")?.value || "").trim();
  if (!state.token) {
    toast("Login dulu untuk akses gateway", "error");
    return null;
  }
  const base = gatewayApiBase();
  if (!nik) {
    toast("Isi NIK untuk mencari Patient", "error");
    return null;
  }
  const url =
    base +
    "/satusehat/patient?identifier=" +
    encodeURIComponent(`https://fhir.kemkes.go.id/id/nik|${nik}`);
  try {
    const res = await fetch(url, {
      headers: { Authorization: "Bearer " + state.token },
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`Gagal cari Patient (${res.status}): ${txt}`);
    }
    const json = await res.json().catch(() => ({}));
    const entry = Array.isArray(json.entry) ? json.entry[0] : null;
    const id = entry?.resource?.id || "";
    if (!id) throw new Error("Patient tidak ditemukan di SATUSEHAT");
    state.patientId = id;
    const pidEl = qs("#ihs_number");
    if (pidEl) pidEl.value = id;
    toast("Patient ditemukan: " + id, "success");
    return id;
  } catch (e) {
    console.error(e);
    toast(e?.message || `Gagal mencari patient (${url})`, "error");
    return null;
  }
}

async function generateEncounterId() {
  let patientId = state.patientId || (qs("#ihs_number")?.value || "").trim();
  const patientName = qs("#patient_name").value.trim();
  const registrationNumber = qs("#registration_number").value.trim();
  const scheduledAtInput = qs("#scheduled_at").value;
  const periodStartIso = localIsoWithOffset(scheduledAtInput);
  const practitionerId = (qs("#satusehat_practitioner_id")?.value || "").trim();
  const practitionerNik = (qs("#practitioner_nik")?.value || "").trim();
  const practitionerName = (qs("#practitioner_name")?.value || "").trim();
  const locationId = (qs("#satusehat_location_id")?.value || "").trim();

  if (!patientId) {
    patientId = (await resolveSatusehatPatientId()) || "";
    if (!patientId) return;
  }

  // Validasi wajib: practitioner harus ada
  if (!practitionerNik && !practitionerId) {
    toast(
      "Practitioner NIK atau ID harus diisi untuk membuat encounter",
      "error"
    );
    return;
  }

  const base = gatewayApiBase();
  try {
    let practitionerRef = undefined;
    let locationRef = undefined;

    if (practitionerNik) {
      const pUrl =
        base +
        "/satusehat/practitioner?identifier=" +
        encodeURIComponent(
          "https://fhir.kemkes.go.id/id/nik|" + practitionerNik
        );
      const pRes = await fetch(pUrl, {
        headers: { Authorization: "Bearer " + state.token },
      });
      if (pRes.ok) {
        const pj = await pRes.json().catch(() => ({}));
        const entry = Array.isArray(pj.entry) ? pj.entry[0] : null;
        const id = entry?.resource?.id || "";
        if (id) {
          practitionerRef = "Practitioner/" + id;
          const pracIdEl = qs("#satusehat_practitioner_id");
          if (pracIdEl) pracIdEl.value = id;
        } else {
          toast(
            "Practitioner dengan NIK " + practitionerNik + " tidak ditemukan",
            "error"
          );
          return;
        }
      } else {
        toast(
          "Gagal mencari practitioner dengan NIK " + practitionerNik,
          "error"
        );
        return;
      }
    } else if (practitionerId) {
      const isIhsNumber = /^\d+$/.test(practitionerId);
      if (isIhsNumber) {
        const pUrl =
          base +
          "/satusehat/practitioner?identifier=" +
          encodeURIComponent(
            "https://fhir.kemkes.go.id/id/practitioner-ihs-number|" +
              practitionerId
          );
        const pRes = await fetch(pUrl, {
          headers: { Authorization: "Bearer " + state.token },
        });
        if (pRes.ok) {
          const pj = await pRes.json().catch(() => ({}));
          const entry = Array.isArray(pj.entry) ? pj.entry[0] : null;
          const id = entry?.resource?.id || "";
          if (id) {
            practitionerRef = "Practitioner/" + id;
          } else {
            toast(
              "Practitioner dengan IHS Number " +
                practitionerId +
                " tidak ditemukan",
              "error"
            );
            return;
          }
        } else {
          toast(
            "Gagal mencari practitioner dengan IHS Number " + practitionerId,
            "error"
          );
          return;
        }
      } else {
        practitionerRef = "Practitioner/" + practitionerId;
      }
    }

    // Pastikan practitionerRef sudah diset
    if (!practitionerRef) {
      toast("Gagal mendapatkan referensi practitioner yang valid", "error");
      return;
    }

    if (locationId) {
      locationRef = locationId.startsWith("Location/")
        ? locationId
        : "Location/" + locationId;
    }

    const encounterPayload = {
      resourceType: "Encounter",
      identifier: [
        {
          use: "usual",
          system:
            "http://sys-ids.kemkes.go.id/encounter/" +
            (registrationNumber || new Date().getTime()),
          value: registrationNumber || "ENC-" + new Date().getTime(),
        },
      ],
      status: "planned",
      class: {
        system: "http://terminology.hl7.org/CodeSystem/v3-ActCode",
        code: "AMB",
        display: "ambulatory",
      },
      subject: {
        reference: "Patient/" + patientId,
        display: patientName || undefined,
      },
      statusHistory: [
        {
          status: "planned",
          period: {
            start: periodStartIso || new Date().toISOString(),
          },
        },
      ],
      period: {
        start: periodStartIso || new Date().toISOString(),
      },
    };

    // Participant wajib ada untuk SatuSehat
    encounterPayload.participant = [
      {
        type: [
          {
            coding: [
              {
                system:
                  "http://terminology.hl7.org/CodeSystem/v3-ParticipationType",
                code: "ATND",
                display: "attender",
              },
            ],
          },
        ],
        individual: {
          reference: practitionerRef,
          display: practitionerName || undefined,
        },
      },
    ];

    if (locationRef) {
      encounterPayload.location = [
        {
          location: {
            reference: locationRef,
          },
        },
      ];
    }

    // Custom fields untuk backend processing
    encounterPayload.patientId = patientId;
    encounterPayload.classCode = "AMB";
    encounterPayload.registrationNumber = registrationNumber || undefined;
    encounterPayload.periodStartIso =
      periodStartIso || new Date().toISOString();
    encounterPayload.subjectDisplay = patientName || undefined;

    // practitionerRef wajib ada
    encounterPayload.practitionerRef = practitionerRef;
    encounterPayload.practitionerDisplay = practitionerName || undefined;

    if (locationRef) {
      encounterPayload.locationRef = locationRef;
    }
    // const svcType = (qs("#service_type")?.value || "RJ").trim();
    // if (svcType) encounterPayload.serviceType = svcType;

    const resp = await fetch(base + "/satusehat/encounter", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + state.token,
      },
      body: JSON.stringify(encounterPayload),
    });
    if (!resp.ok) {
      let errJson = null;
      let errText = "";
      try {
        errJson = await resp.json();
      } catch (_) {
        errText = await resp.text().catch(() => "");
      }
      if (errJson && errJson.resourceType === "OperationOutcome") {
        const issues = Array.isArray(errJson.issue) ? errJson.issue : [];
        const isDuplicate = issues.some((it) => {
          const code = (it?.code || "").toLowerCase();
          const detailsText = (it?.details?.text || "").toLowerCase();
          return code === "duplicate" || detailsText.includes("duplicate");
        });
        if (isDuplicate) {
          // Check if automatic search was performed and existing encounters were found
          if (
            errJson.duplicateDetected &&
            errJson.searchPerformed &&
            errJson.existingEncounters
          ) {
            const encounters = errJson.existingEncounters;
            const encounterCount = encounters.total || 0;
            const encounterList = encounters.entry || [];

            let encounterInfo = "";
            if (encounterCount > 0 && encounterList.length > 0) {
              encounterInfo = "\n\nEncounter yang sudah ada:";
              encounterList.forEach((entry, index) => {
                const encounter = entry.resource;
                const encounterId = encounter.id;
                const identifier = encounter.identifier?.[0]?.value || "N/A";
                const period = encounter.period?.start || "N/A";
                const practitioner =
                  encounter.participant?.[0]?.individual?.display || "N/A";
                const location =
                  encounter.location?.[0]?.location?.reference || "N/A";

                encounterInfo += `\n${index + 1}. ID: ${encounterId}`;
                encounterInfo += `\n   Nomor Registrasi: ${identifier}`;
                encounterInfo += `\n   Tanggal: ${period}`;
                encounterInfo += `\n   Praktisi: ${practitioner}`;
                encounterInfo += `\n   Lokasi: ${location}`;
              });
            }

            toast(
              `Encounter duplikat terdeteksi! Ditemukan ${encounterCount} encounter untuk pasien ini.${encounterInfo}\n\nSilakan ganti tanggal kunjungan atau data pasien/praktisi.`,
              "error"
            );
          } else if (errJson.duplicateDetected && !errJson.searchPerformed) {
            toast(
              `Encounter duplikat terdeteksi! Gagal mencari encounter yang sudah ada: ${
                errJson.searchError || "Unknown error"
              }\n\nSilakan ganti tanggal kunjungan atau data pasien/praktisi.`,
              "error"
            );
          } else {
            toast(
              "Encounter duplikat: ganti tanggal kunjungan atau data pasien/praktisi. Satu encounter hanya untuk satu kunjungan per pasien per hari.",
              "error"
            );
          }

          const resultEl = qs("#result-json");
          const resultCard = qs("#result-card");
          if (resultEl) resultEl.textContent = JSON.stringify(errJson, null, 2);
          if (resultCard) resultCard.hidden = false;
          return;
        }
        const detailsText = issues[0]?.details?.text || "";
        toast(
          "Gagal membuat Encounter: " + (detailsText || resp.statusText),
          "error"
        );
        const resultEl = qs("#result-json");
        const resultCard = qs("#result-card");
        if (resultEl) resultEl.textContent = JSON.stringify(errJson, null, 2);
        if (resultCard) resultCard.hidden = false;
        return;
      } else {
        toast(
          "Gagal membuat Encounter: " + (errText || resp.statusText),
          "error"
        );
        return;
      }
    }
    const data = await resp.json();
    const encIdField = qs("#satusehat_encounter_id");
    const encounterId = data?.id || "";
    if (encIdField) {
      encIdField.value = encounterId;
      updateCopyButtonStatus();
    }
    toast("Encounter berhasil dibuat: " + encounterId, "success");

    // Auto-save data setelah encounter ID berhasil dibuat
    if (encounterId) {
      try {
        await saveSimOrder();
        toast(
          "Data berhasil disimpan dengan Encounter ID: " + encounterId,
          "success"
        );
      } catch (saveError) {
        console.error("Auto-save error:", saveError);
        toast(
          "Encounter ID berhasil dibuat, tetapi gagal menyimpan data: " +
            (saveError?.message || saveError),
          "warning"
        );
      }
    }
  } catch (e) {
    console.error(e);
    toast("Gagal membuat Encounter: " + (e?.message || e), "error");
  }
}

// Search for encounters by patient ID
async function searchEncounterById() {
  try {
    const patientId = (qs("#ihs_number")?.value || "").trim();

    if (!patientId) {
      toast(
        "SATUSEHAT Patient ID harus diisi untuk mencari encounter",
        "error"
      );
      return;
    }

    const base = gatewayApiBase();
    const resp = await fetch(
      `${base}/satusehat/encounter/patient/${patientId}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${state.token}`,
        },
      }
    );

    if (!resp.ok) {
      const errText = await resp.text();
      toast(`Gagal mencari encounter: ${resp.status} ${errText}`, "error");
      return;
    }

    const data = await resp.json();

    if (!data.entry || data.entry.length === 0) {
      toast(`Tidak ditemukan encounter untuk Patient ID: ${patientId}`, "info");
      return;
    }

    // Display found encounters
    const encounterCount = data.total || data.entry.length;
    let encounterInfo = `Ditemukan ${encounterCount} encounter untuk Patient ID: ${patientId}\n\n`;

    data.entry.forEach((entry, index) => {
      const encounter = entry.resource;
      const encounterId = encounter.id;
      const identifier = encounter.identifier?.[0]?.value || "N/A";
      const period = encounter.period?.start || "N/A";
      const practitioner =
        encounter.participant?.[0]?.individual?.display || "N/A";
      const location = encounter.location?.[0]?.location?.reference || "N/A";
      const status = encounter.status || "N/A";

      encounterInfo += `${index + 1}. ID: ${encounterId}\n`;
      encounterInfo += `   Status: ${status}\n`;
      encounterInfo += `   Nomor Registrasi: ${identifier}\n`;
      encounterInfo += `   Tanggal: ${period}\n`;
      encounterInfo += `   Praktisi: ${practitioner}\n`;
      encounterInfo += `   Lokasi: ${location}\n\n`;
    });

    // Show results in a more user-friendly way
    toast(encounterInfo, "success");

    // Optionally, auto-fill the first encounter ID if only one is found
    if (data.entry.length === 1) {
      const firstEncounterId = data.entry[0].resource.id;
      const encIdField = qs("#satusehat_encounter_id");
      if (
        encIdField &&
        confirm(`Ditemukan 1 encounter. Gunakan ID: ${firstEncounterId}?`)
      ) {
        encIdField.value = firstEncounterId;
        toast("Encounter ID berhasil diisi", "success");
      }
    }
  } catch (e) {
    console.error(e);
    toast("Gagal mencari encounter: " + (e?.message || e), "error");
  }
}

function init() {
  fetchConfig();
  loadStaticData();
  const loginStatus = qs("#login-status");
  if (state.token && loginStatus) loginStatus.textContent = "Token tersedia";

  try {
    const cached = JSON.parse(
      localStorage.getItem("satusehat_locations") || "[]"
    );
    populateLocationDropdown(cached);
  } catch {}

  if (state.token) {
    try {
      fetchSatusehatLocations();
    } catch {}
  }

  loadSuggestions("suggest_mrn", "mrnList");
  loadSuggestions("suggest_loinc", "loincList");

  const btnLogin = qs("#btn-login");
  if (btnLogin) btnLogin.addEventListener("click", login);

  const btnPreview = qs("#btn-preview");
  if (btnPreview) btnPreview.addEventListener("click", submitOrder);

  const btnPrint = qs("#btn-print");
  if (btnPrint) btnPrint.addEventListener("click", printProof);

  const regDateEl = qs("#registration_date");
  if (regDateEl) {
    regDateEl.addEventListener(
      "change",
      autoGenerateRegistrationOnScheduleChange
    );
    regDateEl.addEventListener(
      "input",
      autoGenerateRegistrationOnScheduleChange
    );
    regDateEl.addEventListener("change", autoSelectHMinus7);
    regDateEl.addEventListener("input", autoSelectHMinus7);
  }

  const schedEl = qs("#scheduled_at");
  if (schedEl) {
    schedEl.addEventListener(
      "change",
      autoGenerateRegistrationOnScheduleChange
    );
    schedEl.addEventListener("input", autoGenerateRegistrationOnScheduleChange);
  }

  const svcEl = qs("#service_type");
  if (svcEl) {
    svcEl.addEventListener("change", autoGenerateRegistrationOnScheduleChange);
    svcEl.addEventListener("input", autoGenerateRegistrationOnScheduleChange);
  }

  const btnLoadOrders = qs("#btn-load-orders");
  if (btnLoadOrders) btnLoadOrders.addEventListener("click", loadSimOrders);

  const btnSaveOrder = qs("#btn-save-order");
  if (btnSaveOrder) btnSaveOrder.addEventListener("click", saveSimOrder);

  const btnDummy = qs("#btn-apply-dummy");
  if (btnDummy) btnDummy.addEventListener("click", applyDummyFromPreset);

  const btnGen = qs("#btn-generate-enc");
  if (btnGen) btnGen.addEventListener("click", generateEncounterId);

  const btnSearchEnc = qs("#btn-search-enc");
  if (btnSearchEnc) btnSearchEnc.addEventListener("click", searchEncounterById);

  const btnSearchPatient = qs("#btn-search-patient");
  if (btnSearchPatient) {
    btnSearchPatient.addEventListener("click", () => {
      console.log("button search patient clicked");

      const modal = qs("#patient-search-modal");
      if (modal) modal.hidden = false;
      renderPatientSamples();
    });
  }

  const btnPatientRun = qs("#btn-patient-search-run");
  if (btnPatientRun) btnPatientRun.addEventListener("click", doPatientSearch);

  const btnSearchPrac = qs("#btn-search-practitioner");
  if (btnSearchPrac) {
    btnSearchPrac.addEventListener("click", () => {
      const modal = qs("#practitioner-search-modal");
      if (modal) modal.hidden = false;
      renderPractitionerSamples();
    });
  }

  const btnPracRun = qs("#btn-prac-search-run");
  if (btnPracRun) btnPracRun.addEventListener("click", doPractitionerSearch);

  const btnSearchProc = qs("#btn-search-procedure");
  if (btnSearchProc) {
    btnSearchProc.addEventListener("click", () => {
      const modal = qs("#procedure-modal");
      if (modal) modal.hidden = false;
      renderProcedureCatalog();
    });
  }

  const tbody = qs("#sim-orders-tbody");
  if (tbody) tbody.addEventListener("click", handleSimOrdersActions);

  const btnCopyFromOrder = qs("#btn-copy-from-order");
  if (btnCopyFromOrder) {
    btnCopyFromOrder.addEventListener("click", copyFromOrderToServiceRequest);
  }

  const btnCreateServiceRequest = qs("#btn-create-service-request");
  if (btnCreateServiceRequest) {
    btnCreateServiceRequest.addEventListener("click", createServiceRequest);
  }

  const btnCancel = qs("#btn-cancel");
  if (btnCancel) {
    btnCancel.addEventListener("click", () => {
      const modal = qs("#order-preview-modal");
      if (modal) modal.hidden = true;
    });
  }

  const encounterField = qs("#satusehat_encounter_id");
  if (encounterField) {
    updateCopyButtonStatus();
    encounterField.addEventListener("input", updateCopyButtonStatus);
    encounterField.addEventListener("change", updateCopyButtonStatus);
    encounterField.addEventListener("blur", updateCopyButtonStatus);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  try {
    init();
  } catch (e) {
    console.error("Init error:", e);
  }

  try {
    autoGenerateRegistrationOnScheduleChange();
  } catch {}

  try {
    const regDateEl = qs("#registration_date");
    if (regDateEl && !regDateEl.value) {
      regDateEl.value = hMinus7DateString();
      autoSelectHMinus7();
      toast("Auto-select: Tanggal pendaftaran diset ke H-7", "success");
    }
  } catch {}
});

async function loadSimOrders() {
  const base = appApiBase();
  const url = `${base}/sim/orders`;
  const btn = qs("#btn-load-orders");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Memuat...";
  }
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Gagal memuat daftar (${res.status})`);
    const list = await res.json();
    renderSimOrders(list);
    toast(
      `Berhasil memuat ${Array.isArray(list) ? list.length : 0} order`,
      "success"
    );
  } catch (e) {
    console.error("Gagal memuat daftar order:", e);
    toast(e.message || "Gagal memuat daftar order", "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Muat Daftar Order";
    }
  }
}

function renderSimOrders(rows) {
  const tbody = qs("#sim-orders-tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  const html = (rows || [])
    .map((r) => {
      const created = r.created_at
        ? new Date(r.created_at).toLocaleString()
        : "";
      const sched = r.scheduled_at
        ? new Date(r.scheduled_at).toLocaleString()
        : "";
      const served = (r.served_status || "").toLowerCase();
      const dicom = r.dicom_status || "";
      const satusehat = r.satusehat_status || "";
      const imagingId = r.satusehat_imaging_study_id || "";
      const encId = r.satusehat_encounter_id || null;
      const srId = r.satusehat_service_request_id || null;
      const encBadge = encId
        ? `<span class="badge ok">Ada</span>`
        : `<span class="badge warn">Belum</span>`;
      const srBadge = srId
        ? `<span class="badge ok">Ada</span>`
        : `<span class="badge warn">Belum</span>`;
      return `
      <tr>
        <td>${r.id || ""}</td>
        <td>${created}</td>
        <td>${r.patient_name || ""}</td>
        <td>${r.mrn || ""}</td>
        <td>${r.practitioner_name || ""}</td>
        <td>${r.satusehat_practitioner_id || ""}</td>
        <td>${r.satusehat_location_id || ""}</td>
        <td>${r.modality || ""}</td>
        <td>${r.procedure_code || ""}</td>
        <td>${sched}</td>
        <td>${r.registration_number || ""}</td>
        <td>${r.service_type || ""}</td>
        <td>${served}</td>
        <td>${encBadge}</td>
        <td>${srBadge}</td>
        <td>${dicom}</td>
        <td>${satusehat}</td>
        <td>${imagingId}</td>
        <td>
          <button class="btn use-order" data-id="${r.id}">Gunakan</button>
          <button class="btn outline update-order" data-id="${
            r.id
          }">Ubah</button>
          <button class="btn danger delete-order" data-id="${
            r.id
          }">Hapus</button>
          <button class="btn primary send-order" data-id="${
            r.id
          }">Kirim</button>
        </td>
      </tr>
    `;
    })
    .join("");
  tbody.innerHTML = html;
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

async function saveSimOrder(e) {
  try {
    e?.preventDefault?.();
  } catch (_) {}
  if (!validateHMinus7Selection()) return;
  const payload = collectPayload();
  const record = collectSimOrderRecord(payload);
  const base = appApiBase();
  const activeId = (qs("#active_sim_order_id")?.value || "").trim();
  const isEdit = !!activeId;
  const url = isEdit
    ? `${base}/sim/orders/${encodeURIComponent(activeId)}`
    : `${base}/sim/orders`;
  const btn = qs("#btn-save-order");
  if (btn) {
    btn.disabled = true;
    btn.textContent = isEdit ? "Mengubah..." : "Menyimpan...";
  }
  try {
    const res = await fetch(url, {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record),
    });
    const data = await res.json().catch(() => ({}));
    state.lastResult = data;
    const resultEl = qs("#result-json");
    const resultCard = qs("#result-card");
    if (resultEl) resultEl.textContent = JSON.stringify(data, null, 2);
    if (resultCard) resultCard.hidden = false;
    const actionMsg = isEdit
      ? "Order simulasi diperbarui"
      : "Order simulasi disimpan";
    toast(
      res.ok ? actionMsg : "Gagal simpan: " + (data?.detail || res.statusText),
      res.ok ? "success" : "error"
    );
    try {
      await loadSimOrders();
    } catch (_) {}
  } catch (err) {
    console.error("Simpan order error:", err);
    toast("Gagal menyimpan order: " + (err?.message || err), "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Simpan Order";
    }
  }
}

async function handleSimOrdersActions(e) {
  const t = e.target;
  if (!(t instanceof HTMLElement)) return;
  if (t.classList.contains("use-order")) {
    const id = t.dataset.id;
    if (id) useSimOrder(id);
  } else if (t.classList.contains("send-order")) {
    const id = t.dataset.id;
    if (id) sendSimOrderById(id);
  } else if (t.classList.contains("update-order")) {
    const id = t.dataset.id;
    if (id) updateSimOrderById(id);
  } else if (t.classList.contains("delete-order")) {
    const id = t.dataset.id;
    if (id) deleteSimOrderById(id);
  }
}

function toLocalDatetimeInput(ts) {
  try {
    const d = new Date(ts);
    const pad = (n) => String(n).padStart(2, "0");
    const yyyy = d.getFullYear();
    const mm = pad(d.getMonth() + 1);
    const dd = pad(d.getDate());
    const hh = pad(d.getHours());
    const min = pad(d.getMinutes());
    return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
  } catch (_) {
    return "";
  }
}

async function fetchSimOrderById(id) {
  const base = appApiBase();
  const url = `${base}/sim/orders/${encodeURIComponent(id)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Order tidak ditemukan (${res.status})`);
  return await res.json();
}

async function populateFormFromRecord(row) {
  const set = (sel, val) => {
    const el = qs(sel);
    if (el) el.value = val ?? "";
  };
  set("#patient_national_id", row.patient_national_id || "");
  set("#ihs_number", row.ihs_number || "");
  set("#mrn", row.mrn || "");
  set("#patient_name", row.patient_name || "");
  const sex = (row.sex || "").toLowerCase();
  if (sex === "male" || sex === "female") set("#sex", sex);
  set("#birth_date", row.birth_date || "");
  set("#modality", (row.modality || "").toUpperCase());
  set("#procedure_code", row.procedure_code || "");
  set("#procedure_name", row.procedure_name || "");
  const schedLocal = toLocalDatetimeInput(
    row.scheduled_at || new Date().toISOString()
  );
  set("#scheduled_at", schedLocal);
  const regDateFromSched = (schedLocal || "").split("T")[0];
  set("#registration_date", regDateFromSched);
  set("#registration_number", row.registration_number || "");
  set("#clinical_notes", row.clinical_notes || "");
  const svc = (row.service_type || "RJ").toUpperCase();
  set("#service_type", svc);
  set("#practitioner_nik", row.practitioner_nik || "");
  set("#practitioner_name", row.practitioner_name || "");
  set("#satusehat_practitioner_id", row.satusehat_practitioner_id || "");

  const locationId = row.satusehat_location_id || "";
  if (locationId) {
    if (!state.token) {
      toast(
        "⚠️ Token belum tersedia. Silakan login terlebih dahulu untuk memuat lokasi SATUSEHAT.",
        "error"
      );
      try {
        const cachedItems = JSON.parse(
          localStorage.getItem("satusehat_locations") || "[]"
        );
        if (cachedItems.length > 0) {
          populateLocationDropdown(cachedItems);
          setTimeout(() => {
            const locationSelect = qs("#satusehat_location_id");
            if (locationSelect) {
              locationSelect.value = locationId;
              if (locationSelect.value !== locationId) {
                toast(
                  `⚠️ Lokasi ${locationId} tidak ditemukan dalam cache. Silakan login untuk memuat data terbaru.`,
                  "warning"
                );
              } else {
                toast(
                  "ℹ️ Menggunakan lokasi dari cache (login diperlukan untuk data terbaru)",
                  "info"
                );
              }
            }
          }, 100);
        } else {
          toast(
            "❌ Tidak ada data lokasi dalam cache. Silakan login untuk memuat data.",
            "error"
          );
        }
      } catch (e) {
        console.warn("Failed to load location cache:", e);
        toast(
          "❌ Gagal memuat lokasi dari cache. Silakan login untuk memuat data.",
          "error"
        );
      }
    } else {
      try {
        const cachedItems = JSON.parse(
          localStorage.getItem("satusehat_locations") || "[]"
        );
        if (cachedItems.length > 0) {
          populateLocationDropdown(cachedItems);
        }
        await fetchSatusehatLocations();
        await new Promise((resolve) => setTimeout(resolve, 150));
        const locationSelect = qs("#satusehat_location_id");
        if (locationSelect) {
          locationSelect.value = locationId;
          if (locationSelect.value !== locationId) {
            await new Promise((resolve) => setTimeout(resolve, 300));
            locationSelect.value = locationId;
            if (locationSelect.value !== locationId) {
              toast(
                `⚠️ Lokasi dengan ID ${locationId} tidak ditemukan dalam daftar. Data mungkin perlu diperbarui.`,
                "warning"
              );
            }
          }
        }
      } catch (e) {
        console.warn("Failed to load locations:", e);
        toast(
          "⚠️ Gagal memuat lokasi terbaru. Menggunakan cache jika tersedia.",
          "warning"
        );
      }
    }
  } else {
    set("#satusehat_location_id", "");
  }

  set("#satusehat_encounter_id", row.satusehat_encounter_id || "");
  set("#active_sim_order_id", row.id || "");
  updateCopyButtonStatus();
}

function payloadFromSimOrder(row) {
  const patient = {
    national_id: row.patient_national_id || "",
    ihs_number: row.ihs_number || null,
    medical_record_number: row.mrn || "",
    name: row.patient_name || "",
    sex: (row.sex || "male").toLowerCase(),
    birth_date: row.birth_date || "",
  };
  const order = {
    modality: (row.modality || "").toUpperCase(),
    procedure_code: row.procedure_code || "",
    procedure_name: row.procedure_name || "",
    scheduled_at: row.scheduled_at || new Date().toISOString(),
    registration_number: row.registration_number || null,
    clinical_notes: row.clinical_notes || null,
  };
  const satusehat = {
    satusehat_patient_id: row.ihs_number || null,
    satusehat_encounter_id: row.satusehat_encounter_id || null,
  };
  return { patient, order, satusehat };
}

function openPreviewForPayload(payload, simOrderId) {
  const previewEl = qs("#preview-json");
  const modalEl = qs("#order-preview-modal");
  if (previewEl) previewEl.textContent = JSON.stringify(payload, null, 2);
  if (modalEl) modalEl.hidden = false;
  const confirmBtn = qs("#btn-confirm");
  if (confirmBtn) {
    confirmBtn.onclick = async () => {
      await confirmAndSendOrder(payload, simOrderId || null);
    };
  }
}

async function useSimOrder(id) {
  try {
    const row = await fetchSimOrderById(id);
    await populateFormFromRecord(row);
    toast("Order tersimpan dimuat ke form", "success");
  } catch (e) {
    console.error(e);
    toast("Gagal memuat order: " + (e?.message || e), "error");
  }
}

async function sendSimOrderById(id) {
  try {
    const row = await fetchSimOrderById(id);
    const payload = payloadFromSimOrder(row);
    openPreviewForPayload(payload, id);
  } catch (e) {
    console.error(e);
    toast("Gagal menyiapkan kirim: " + (e?.message || e), "error");
  }
}

async function updateSimOrderById(id) {
  const base = appApiBase();
  const url = `${base}/sim/orders/${encodeURIComponent(id)}`;
  const payload = collectPayload();
  const patch = {
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
  const btn = qs(`#sim-orders-tbody button.update-order[data-id="${id}"]`);
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Mengubah...";
  }
  try {
    const res = await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.detail || res.statusText);
    toast("Order diperbarui", "success");
    try {
      await loadSimOrders();
    } catch (_) {}
    return data;
  } catch (e) {
    console.error(e);
    toast("Gagal mengupdate order: " + (e?.message || e), "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Ubah";
    }
  }
}

async function deleteSimOrderById(id) {
  const base = appApiBase();
  const url = `${base}/sim/orders/${encodeURIComponent(id)}`;
  const btn = qs(`#sim-orders-tbody button.delete-order[data-id="${id}"]`);
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Menghapus...";
  }
  try {
    const res = await fetch(url, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.detail || res.statusText);
    toast("Order dihapus", "success");
    try {
      await loadSimOrders();
    } catch (_) {}
  } catch (e) {
    console.error(e);
    toast("Gagal menghapus order: " + (e?.message || e), "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Hapus";
    }
  }
}

async function patchSimOrderAfterSend(orderId, result, ok) {
  const base = appApiBase();
  const url = `${base}/sim/orders/${encodeURIComponent(orderId)}`;
  const getId = (paths) => paths.find((v) => !!v) || null;
  const encId = getId([
    result?.encounter?.id,
    result?.encounter?.entry?.[0]?.resource?.id,
    result?.Encounter?.id,
    result?.encounterId,
    result?.encounter_id,
  ]);
  const srId = getId([
    result?.serviceRequest?.id,
    result?.service_request?.id,
    result?.ServiceRequest?.id,
    result?.serviceRequestId,
    result?.service_request_id,
  ]);
  const patch = {
    satusehat_status: ok ? "success" : "failed",
    encounter_status: encId ? "created" : undefined,
    service_request_status: srId ? "created" : undefined,
    satusehat_encounter_id: encId || undefined,
    satusehat_service_request_id: srId || undefined,
  };
  try {
    const res = await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.detail || res.statusText);
    toast("Status order diperbarui setelah kirim", "success");
    return data;
  } catch (e) {
    console.warn("Patch status gagal:", e);
    toast("Patch status gagal: " + (e?.message || e), "error");
    throw e;
  }
}

function updateCopyButtonStatus() {
  const encounterId = qs("#satusehat_encounter_id")?.value || "";
  const copyButton = qs("#btn-copy-from-order");

  if (!copyButton) return;

  if (!encounterId || encounterId.trim() === "") {
    copyButton.style.backgroundColor = "#95a5a6";
    copyButton.style.color = "#ffffff";
    copyButton.style.cursor = "not-allowed";
    copyButton.title = "Encounter ID harus diisi terlebih dahulu";
    copyButton.innerHTML = "⚠️ Copy dari Order (Encounter ID Required)";
  } else {
    copyButton.style.backgroundColor = "";
    copyButton.style.color = "";
    copyButton.style.cursor = "";
    copyButton.title = "Copy data dari form order ke service request";
    copyButton.innerHTML = "✅ Copy dari Order";
  }
}

function copyFromOrderToServiceRequest() {
  try {
    const availableData = {
      patientId: qs("#ihs_number")?.value || "",
      encounterId: qs("#satusehat_encounter_id")?.value || "",
      practitionerId: qs("#satusehat_practitioner_id")?.value || "",
      locationId: qs("#satusehat_location_id")?.value || "",
      procedureCode: qs("#procedure_code")?.value || "",
      procedureName: qs("#procedure_name")?.value || "",
      clinicalNotes: qs("#clinical_notes")?.value || "",
    };

    if (!availableData.encounterId || availableData.encounterId.trim() === "") {
      const encounterField = qs("#satusehat_encounter_id");
      if (encounterField) {
        encounterField.style.borderColor = "#e74c3c";
        encounterField.style.backgroundColor = "#fdf2f2";
        encounterField.focus();
        setTimeout(() => {
          encounterField.style.borderColor = "";
          encounterField.style.backgroundColor = "";
        }, 5000);
      }
      updateCopyButtonStatus();
      toast(
        "❌ Tidak dapat menyalin data: Encounter ID harus diisi terlebih dahulu di form Order!",
        "error"
      );
      return;
    }

    const patientId = availableData.patientId;
    if (patientId) qs("#sr_patient_id").value = patientId;

    const encounterId = availableData.encounterId;
    if (encounterId) qs("#sr_encounter_id").value = encounterId;

    const practitionerId = availableData.practitionerId;
    if (practitionerId) qs("#sr_practitioner_id").value = practitionerId;

    const locationId = availableData.locationId;
    if (locationId) qs("#sr_location_id").value = locationId;

    const procedureCode = availableData.procedureCode;
    const procedureName = availableData.procedureName;
    if (procedureCode) qs("#sr_code").value = procedureCode;
    if (procedureName) qs("#sr_code_display").value = procedureName;

    const clinicalNotes = availableData.clinicalNotes;
    if (clinicalNotes) {
      qs("#sr_note").value = clinicalNotes;
    }

    const now = new Date();
    const localDateTime = new Date(
      now.getTime() - now.getTimezoneOffset() * 60000
    )
      .toISOString()
      .slice(0, 16);
    qs("#sr_authored_on").value = localDateTime;

    const copiedFields = [];
    if (patientId) copiedFields.push("Patient ID");
    if (encounterId) copiedFields.push("Encounter ID");
    if (practitionerId) copiedFields.push("Practitioner ID");
    if (locationId) copiedFields.push("Location ID");
    if (procedureCode) copiedFields.push("Procedure Code");
    if (procedureName) copiedFields.push("Procedure Name");
    if (clinicalNotes) copiedFields.push("Clinical Notes");

    const highlightFields = [
      { id: "#sr_patient_id", copied: !!patientId },
      { id: "#sr_encounter_id", copied: !!encounterId },
      { id: "#sr_practitioner_id", copied: !!practitionerId },
      { id: "#sr_location_id", copied: !!locationId },
      { id: "#sr_code", copied: !!procedureCode },
      { id: "#sr_code_display", copied: !!procedureName },
      { id: "#sr_note", copied: !!clinicalNotes },
    ];

    highlightFields.forEach((field) => {
      const element = qs(field.id);
      if (element && field.copied) {
        element.style.borderColor = "#2ecc71";
        element.style.backgroundColor = "#d5f4e6";
        setTimeout(() => {
          element.style.borderColor = "";
          element.style.backgroundColor = "";
        }, 2000);
      }
    });

    if (copiedFields.length > 0) {
      toast(`Data berhasil disalin: ${copiedFields.join(", ")}`, "success");
    } else {
      toast(
        "Tidak ada data yang dapat disalin dari order. Pastikan form order sudah diisi.",
        "error"
      );
    }
  } catch (err) {
    console.error("Error copying from order:", err);
    toast("Gagal menyalin data dari order: " + (err?.message || err), "error");
  }
}

async function createServiceRequest(e) {
  try {
    e?.preventDefault?.();
  } catch {}

  const btn = qs("#btn-create-service-request");
  if (!state.token) {
    toast("Silakan login terlebih dahulu", "error");
    return;
  }

  const payload = {
    patientId: qs("#sr_patient_id")?.value?.trim() || "",
    encounterId: qs("#sr_encounter_id")?.value?.trim() || "",
    practitionerId: qs("#sr_practitioner_id")?.value?.trim() || "",
    locationId: qs("#sr_location_id")?.value?.trim() || "",
    code: qs("#sr_code")?.value?.trim() || "",
    codeDisplay: qs("#sr_code_display")?.value?.trim() || "",
    categoryCode: qs("#sr_category_code")?.value?.trim() || "394914008",
    categoryDisplay: qs("#sr_category_display")?.value?.trim() || "Radiology",
    priority: qs("#sr_priority")?.value || "routine",
    intent: qs("#sr_intent")?.value || "order",
    status: qs("#sr_status")?.value || "active",
    authoredOn: qs("#sr_authored_on")?.value || null,
    reasonCode: qs("#sr_reason_code")?.value?.trim() || null,
    reasonDisplay: qs("#sr_reason_display")?.value?.trim() || null,
    note: qs("#sr_note")?.value?.trim() || null,
  };

  const requiredFields = [
    { field: "patientId", name: "Patient ID", elementId: "#sr_patient_id" },
    {
      field: "encounterId",
      name: "Encounter ID",
      elementId: "#sr_encounter_id",
    },
    {
      field: "practitionerId",
      name: "Practitioner ID",
      elementId: "#sr_practitioner_id",
    },
    { field: "locationId", name: "Location ID", elementId: "#sr_location_id" },
    { field: "code", name: "Procedure Code", elementId: "#sr_code" },
    {
      field: "codeDisplay",
      name: "Procedure Display",
      elementId: "#sr_code_display",
    },
  ];

  const missingFields = [];
  for (const { field, name, elementId } of requiredFields) {
    const element = qs(elementId);
    if (!payload[field]) {
      missingFields.push(name);
      if (element) {
        element.style.borderColor = "#e74c3c";
        element.style.backgroundColor = "#fdf2f2";
        setTimeout(() => {
          element.style.borderColor = "";
          element.style.backgroundColor = "";
        }, 3000);
      }
    } else {
      if (element) {
        element.style.borderColor = "";
        element.style.backgroundColor = "";
      }
    }
  }

  if (missingFields.length > 0) {
    toast(`Field wajib yang belum diisi: ${missingFields.join(", ")}`, "error");
    return;
  }

  try {
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Membuat Service Request...";
    }

    const base = gatewayApiBase();
    const url = `${base}/api/servicerequest/create`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${state.token}`,
      },
      body: JSON.stringify(payload),
    });

    let data = {};
    let errorMessage = `HTTP ${res.status}`;

    try {
      const responseText = await res.text();
      if (responseText) {
        try {
          data = JSON.parse(responseText);
          if (!res.ok) {
            errorMessage =
              data?.detail ||
              data?.message ||
              data?.error_description ||
              data?.error ||
              `HTTP ${res.status}`;
          }
        } catch (parseError) {
          console.error("Failed to parse response as JSON:", parseError);
          if (!res.ok) {
            errorMessage = `HTTP ${res.status}: ${responseText.substring(
              0,
              200
            )}`;
          }
        }
      }
    } catch (textError) {
      console.error("Failed to read response text:", textError);
      if (!res.ok) {
        errorMessage = `HTTP ${res.status}: Unable to read response`;
      }
    }

    if (!res.ok) {
      throw new Error(errorMessage);
    }

    toast("Service Request berhasil dibuat", "success");
    await saveServiceRequestToDatabase(data);

    const resultCard = qs("#result-card");
    if (resultCard) {
      resultCard.innerHTML = `
        <h2>Hasil Service Request</h2>
        <div class="result-content">
          <h3>Service Request berhasil dibuat</h3>
          <pre>${JSON.stringify(data, null, 2)}</pre>
        </div>
      `;
      resultCard.hidden = false;
      resultCard.scrollIntoView({ behavior: "smooth" });
    }

    const form = qs("#service-request-form");
    if (form) form.reset();
  } catch (err) {
    console.error("Create service request error:", err);
    toast("Gagal membuat service request: " + (err?.message || err), "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Buat Service Request";
    }
  }
}

async function saveServiceRequestToDatabase(serviceRequestData) {
  try {
    const activeOrderId = (qs("#active_sim_order_id")?.value || "").trim();

    if (!activeOrderId) {
      console.warn("No active order ID found, skipping database save");
      return;
    }

    const serviceRequestId =
      serviceRequestData?.id || serviceRequestData?.resourceId || "";

    if (!serviceRequestId) {
      console.warn(
        "No service request ID found in response, skipping database save"
      );
      return;
    }

    const base = appApiBase();
    const url = `${base}/sim/orders/${encodeURIComponent(
      activeOrderId
    )}/service-request`;

    const res = await fetch(url, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        service_request_id: serviceRequestId,
      }),
    });

    if (res.ok) {
      const result = await res.json().catch(() => ({}));
      console.log("Service request ID saved to database:", result);
      toast("Service Request ID berhasil disimpan ke database", "success");
    } else {
      const errorData = await res.json().catch(() => ({}));
      console.warn("Failed to save service request ID to database:", errorData);
      toast(
        "Peringatan: Service Request berhasil dibuat tetapi gagal menyimpan ID ke database",
        "warning"
      );
    }
  } catch (err) {
    console.error("Error saving service request ID to database:", err);
    toast(
      "Peringatan: Service Request berhasil dibuat tetapi gagal menyimpan ID ke database",
      "warning"
    );
  }
}
