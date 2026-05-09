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
  return (el?.value || state.gatewayBase || "http://103.42.117.19:8888").trim();
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
      await fetchSatusehatLocations();
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
    gb.value = state.gatewayBase;
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
    console.warn("Token belum tersedia; lewati fetch lokasi");
    // Try to load from cache if available
    const cachedItems = JSON.parse(
      localStorage.getItem("satusehat_locations") || "[]"
    );
    if (cachedItems.length > 0) {
      populateLocationDropdown(cachedItems);
      toast("Menggunakan lokasi dari cache (token belum tersedia)", "warning");
    } else {
      toast(
        "Token belum tersedia untuk memuat lokasi SATUSEHAT. Silakan login terlebih dahulu.",
        "warning"
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
      // Authentication expired - clear token and notify user
      console.warn("Authentication expired (401), clearing token");
      localStorage.removeItem("simrs_auth_token");
      state.token = "";

      // Load cached data if available
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
      // Service unavailable - retry with backoff
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
  // Fungsi ini tidak lagi mengisi dropdown karena sudah diganti dengan input text
  // Namun tetap disimpan untuk kompatibilitas dengan kode lain yang mungkin memanggilnya
  
  // Simpan data lokasi ke localStorage untuk digunakan oleh fitur autocomplete
  if (items && items.length > 0) {
    localStorage.setItem("satusehat_locations", JSON.stringify(items));
  }
}

function saveSuggestion(key, value, max = 10) {
  const arr = JSON.parse(localStorage.getItem(key) || "[]");
  if (!value) return;
  const existing = arr.filter((v) => v !== value);
  existing.unshift(value);
  localStorage.setItem(key, JSON.stringify(existing.slice(0, max)));
}

function loadSuggestions(key, datalistId) {
  const arr = JSON.parse(localStorage.getItem(key) || "[]");
  const dl = qs(`#${datalistId}`);
  dl.innerHTML = arr.map((v) => `<option value="${v}"></option>`).join("");
}

function isoFromLocalDatetime(dtStr) {
  if (!dtStr) return null;
  // dtStr is 'YYYY-MM-DDTHH:mm'
  const d = new Date(dtStr);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString();
}

// Generate registration number for Rawat Jalan (RJ)
// Format: RJYYYYDDMM#### (contoh: RJ202525100001 untuk 25 Okt 2025 urut 1)
function formatRJRegistration(dtStr) {
  if (!dtStr) return "";
  const d = new Date(dtStr);
  if (isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const key = `reg_seq_RJ_${y}${dd}${m}`;
  let seq = parseInt(localStorage.getItem(key) || "0", 10);
  if (!Number.isFinite(seq) || seq < 0) seq = 0;
  seq += 1;
  localStorage.setItem(key, String(seq));
  const seqStr = String(seq).padStart(4, "0");
  return `RJ${y}${dd}${m}${seqStr}`;
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

/**
 * Format YYYY-MM-DD dari Date lokal.
 * @param {Date} d
 * @returns {string}
 */
function formatDateLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/**
 * Hitung tanggal H-7 (7 hari sebelum hari ini) berdasarkan zona waktu lokal.
 * @returns {string} YYYY-MM-DD
 */
function hMinus7DateString() {
  const now = new Date();
  const h7 = new Date(now.getTime());
  h7.setDate(now.getDate() - 7);
  return formatDateLocal(h7);
}

/**
 * Auto select untuk pendaftaran H-7.
 * Jika #registration_date = H-7, set #scheduled_at ke 1 jam setelah "waktu pendaftaran" (waktu lokal saat perubahan).
 * Menyimpan referensi waktu untuk validasi dan menampilkan toast sukses.
 */
function autoSelectHMinus7() {
  try {
    const regDateEl = qs("#registration_date");
    const schedEl = qs("#scheduled_at");
    if (!regDateEl || !schedEl) return;
    const regDateStr = (regDateEl.value || "").trim();
    if (!regDateStr) return;
    const target = hMinus7DateString();
    if (regDateStr !== target) return; // hanya auto-apply untuk H-7

    const now = new Date();
    const regHH = now.getHours();
    const regMM = now.getMinutes();
    state.hMinus7RefTime = { hh: regHH, mm: regMM };

    // Tambah 1 jam dari waktu pendaftaran
    let plusHourHH = regHH + 1;
    let plusHourMM = regMM;
    // Jika melewati tengah malam, jaga tetap di hari yang sama (cap ke 23:59)
    if (plusHourHH >= 24) {
      plusHourHH = 23;
      plusHourMM = 59;
    }

    const hh = String(plusHourHH).padStart(2, "0");
    const mm = String(plusHourMM).padStart(2, "0");
    schedEl.value = `${regDateStr}T${hh}:${mm}`;
    autoGenerateRegistrationOnScheduleChange(); // reg number mengikuti tanggal
    toast(
      `Auto-select H-7: Jadwal tindakan di-set ke ${hh}:${mm} (±1 jam)`,
      "success"
    );
  } catch (e) {
    console.error("autoSelectHMinus7 error:", e);
    toast("Gagal auto-select H-7", "error");
  }
}

/**
 * Validasi untuk skenario H-7.
 * Memastikan jika tanggal pendaftaran = H-7, maka jadwal ada dan minimal 1 jam setelah referensi waktu pendaftaran.
 * @returns {boolean} true jika valid, false jika tidak (dan tampilkan toast error)
 */
function validateHMinus7Selection() {
  const regDateEl = qs("#registration_date");
  const schedEl = qs("#scheduled_at");
  if (!regDateEl || !schedEl) return true; // tidak dapat memvalidasi, anggap lolos
  const regDateStr = (regDateEl.value || "").trim();
  if (!regDateStr) return true;
  const isH7 = regDateStr === hMinus7DateString();
  if (!isH7) return true; // hanya validasi jika H-7

  const schedStr = (schedEl.value || "").trim();
  if (!schedStr) {
    toast("Untuk H-7, jadwal harus diisi", "error");
    return false;
  }

  // Pastikan hari sama; tidak memaksa jeda ≥1 jam lagi
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
  // Jangan panggil autoSelectHMinus7 di sini untuk menghindari rekursi
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
    // SATUSEHAT Patient ID digabung ke #ihs_number
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
    // Validasi H-7 sebelum preview
    if (!validateHMinus7Selection()) return;
    const previewEl = qs("#preview-json");
    const modalEl = qs("#preview-modal");
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
    const modalEl = qs("#preview-modal");
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

// Apply dummy sandbox preset to form
function applyDummyFromPreset(e) {
  try {
    e?.preventDefault?.();
  } catch (_) {}
  // Try read preset selector; fallback jika kosong/missing
  const sel = qs("#dummy_patient_preset");
  const presetVal = (sel?.value || "").trim();
  const set = (selector, val) => {
    const el = qs(selector);
    if (el) el.value = val ?? "";
  };
  if (!presetVal) {
    const samples = (window.SAMPLE_PATIENTS || []).filter(Boolean);
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
    return;
  }
  // Parse format: IHS|NIK|Name|Sex|BirthDate(YYYY-MM-DD)
  const parts = presetVal.split("|");
  const ihs = parts[0] || "";
  const nik = parts[1] || "";
  const name = parts[2] || "";
  const sex = (parts[3] || "").toLowerCase();
  const dob = parts[4] || "";
  set("#ihs_number", ihs);
  set("#patient_national_id", nik);
  set("#patient_name", name);
  if (sex === "male" || sex === "female") set("#sex", sex);
  set("#birth_date", dob);
  toast("Preset dummy diterapkan", "success");
}

function renderPatientSamples(list) {
  const items = Array.isArray(list) ? list : window.SAMPLE_PATIENTS || [];
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
      const modal = qs("#patient-modal");
      if (modal) modal.hidden = true;
      toast("Pasien dipilih", "success");
    };
  });
}

function doPatientSearch() {
  const srcNik = (qs("#patient_search_nik")?.value || "").toLowerCase();
  const srcIhs = (qs("#patient_search_ihs")?.value || "").toLowerCase();
  const srcName = (qs("#patient_search_name")?.value || "").toLowerCase();
  const items = window.SAMPLE_PATIENTS || [];
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
  const items = Array.isArray(list) ? list : window.SAMPLE_PRACTITIONERS || [];
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
      const modal = qs("#practitioner-modal");
      if (modal) modal.hidden = true;
      toast("Practitioner dipilih", "success");
    };
  });
}

function doPractitionerSearch() {
  const srcNik = (qs("#prac_search_nik")?.value || "").toLowerCase();
  const srcName = (qs("#prac_search_name")?.value || "").toLowerCase();
  const items = window.SAMPLE_PRACTITIONERS || [];
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
  let items = Array.isArray(list) ? list : window.PROCEDURE_SAMPLES || [];
  if (!items.length && window.LOINC_LABELS) {
    items = Object.entries(window.LOINC_LABELS).map(([code, display], idx) => ({
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

// Bind tombol modal saat DOM siap
(function () {
  const bind = () => {
    const btnSearchPatient = qs("#btn-search-patient");
    if (btnSearchPatient)
      btnSearchPatient.addEventListener("click", () => {
        qs("#patient-modal").hidden = false;
        renderPatientSamples();
      });
    const btnPatientRun = qs("#btn-patient-search-run");
    if (btnPatientRun) btnPatientRun.addEventListener("click", doPatientSearch);
    const btnSearchPrac = qs("#btn-search-practitioner");
    if (btnSearchPrac)
      btnSearchPrac.addEventListener("click", () => {
        qs("#practitioner-modal").hidden = false;
        renderPractitionerSamples();
      });
    const btnPracRun = qs("#btn-prac-search-run");
    if (btnPracRun) btnPracRun.addEventListener("click", doPractitionerSearch);
    const btnSearchProc = qs("#btn-search-procedure");
    if (btnSearchProc)
      btnSearchProc.addEventListener("click", () => {
        qs("#procedure-modal").hidden = false;
        renderProcedureCatalog();
      });
  };
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", bind);
  else bind();
})();

// Generate Encounter ID via API Gateway -> satusehat-integrator
function localIsoWithOffset(dtStr) {
  if (!dtStr) return null;
  // dtStr expected: YYYY-MM-DDTHH:mm
  const d = new Date(dtStr);
  const tzMin = -d.getTimezoneOffset(); // positive for east of UTC
  const sign = tzMin >= 0 ? "+" : "-";
  const abs = Math.abs(tzMin);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  const [datePart, timePart] = dtStr.split("T");
  const timeWithSeconds = timePart.length === 5 ? `${timePart}:00` : timePart;
  return `${datePart}T${timeWithSeconds}${sign}${hh}:${mm}`;
}
async function resolveSatusehatPatientId() {
  // Gunakan #ihs_number sebagai SATUSEHAT Patient ID (langsung jika ada)
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
  // Use API Gateway base (no direct SATUSEHAT)
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
  // Optional practitioner inputs (if fields exist in form)
  const practitionerId = (
    document.querySelector("#satusehat_practitioner_id")?.value || ""
  ).trim();
  const practitionerNik = (
    document.querySelector("#practitioner_nik")?.value || ""
  ).trim();
  const practitionerName = (
    document.querySelector("#practitioner_name")?.value || ""
  ).trim();
  const locationId = (
    document.querySelector("#satusehat_location_id")?.value || ""
  ).trim();

  if (!patientId) {
    // Try resolve from IHS/NIK automatically
    patientId = (await resolveSatusehatPatientId()) || "";
    if (!patientId) {
      // Notifikasi spesifik sudah ditampilkan oleh resolveSatusehatPatientId
      return;
    }
  }

  // Use API Gateway base for SATUSEHAT routes
  const base = gatewayApiBase();
  try {
    let practitionerRef = undefined;
    let locationRef = undefined;
    // Prioritize NIK validation over IHS number as per SATUSEHAT documentation
    if (practitionerNik) {
      // Primary: Resolve practitioner by NIK (recommended by SATUSEHAT)
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
          const pracIdEl = document.querySelector("#satusehat_practitioner_id");
          if (pracIdEl) pracIdEl.value = id;
        }
      }
    } else if (practitionerId) {
      // Fallback: Check if practitionerId is a FHIR resource ID or IHS number
      const isIhsNumber = /^\d+$/.test(practitionerId);
      if (isIhsNumber) {
        // Legacy: IHS number validation (deprecated, use NIK instead)
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
            // Keep input showing IHS; do not override field value here
          }
        }
      } else {
        // Assume input holds a FHIR resource ID
        practitionerRef = "Practitioner/" + practitionerId;
      }
    }

    if (locationId) {
      locationRef = locationId.startsWith("Location/")
        ? locationId
        : "Location/" + locationId;
    }

    // Enhanced payload structure with required FHIR fields
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

    // Add participant if practitioner is provided
    if (practitionerRef) {
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
    }

    // Add location if provided
    if (locationRef) {
      encounterPayload.location = [
        {
          location: {
            reference: locationRef,
          },
        },
      ];
    }

    // Add integrator-specific root fields to satisfy older versions
    encounterPayload.patientId = patientId;
    encounterPayload.classCode = "AMB";
    encounterPayload.registrationNumber = registrationNumber || undefined;
    encounterPayload.periodStartIso =
      periodStartIso || new Date().toISOString();
    encounterPayload.subjectDisplay = patientName || undefined;
    if (practitionerRef) {
      encounterPayload.practitionerRef = practitionerRef;
      encounterPayload.practitionerDisplay = practitionerName || undefined;
    }
    if (locationRef) {
      encounterPayload.locationRef = locationRef;
    }
    const svcType = (
      document.querySelector("#service_type")?.value || "RJ"
    ).trim();
    if (svcType) encounterPayload.serviceType = svcType;

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
          toast(
            "Encounter duplikat: ganti tanggal kunjungan atau data pasien/praktisi. Satu encounter hanya untuk satu kunjungan per pasien per hari.",
            "error"
          );
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
    qs("#satusehat_encounter_id").value = data?.id || "";
    toast("Encounter berhasil dibuat");
  } catch (e) {
    console.error(e);
    toast("Gagal membuat Encounter: " + (e?.message || e));
  }
}

function fhirNameToString(nameArr) {
  if (!Array.isArray(nameArr) || nameArr.length === 0) return "";
  const n = nameArr[0];
  if (n.text) return n.text;
  const given = Array.isArray(n.given) ? n.given.join(" ") : n.given || "";
  const family = n.family || "";
  return `${given} ${family}`.trim();
}
function getIdentifier(resource, system) {
  const ids = resource?.identifier || [];
  const found = ids.find((i) => i.system === system);
  return found?.value || "";
}

function init() {
  fetchConfig();
  loadStaticData();
  if (state.token) qs("#login-status").textContent = "Token tersedia";
  // Prefill dropdown dari cache lokal, lalu refresh jika token ada
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
  qs("#btn-login").addEventListener("click", login);
  qs("#btn-preview").addEventListener("click", submitOrder);
  qs("#btn-print").addEventListener("click", printProof);
  // Auto-generate registration number when reg date, schedule, or service type changes
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
  // Wire save order button
  qs("#btn-save-order")?.addEventListener("click", saveSimOrder);
  // New controls
  const btnDummy = qs("#btn-apply-dummy");
  if (btnDummy) btnDummy.addEventListener("click", applyDummyFromPreset);
  const btnGen = qs("#btn-generate-enc");
  if (btnGen) btnGen.addEventListener("click", generateEncounterId);
  const btnSearchPatient = qs("#btn-search-patient");
  if (btnSearchPatient)
    btnSearchPatient.addEventListener("click", () => {
      qs("#patient-modal").hidden = false;
      renderPatientSamples();
    });
  // Attach event delegation for actions on the orders table body
  const tbody = qs("#sim-orders-tbody");
  if (tbody) tbody.addEventListener("click", handleSimOrdersActions);
}
// Pastikan init() dipanggil setelah DOM siap
document.addEventListener("DOMContentLoaded", () => {
  // Panggil init() agar data lokal dan event listener terpasang
  try {
    init();
  } catch {}
  // Generate nomor registrasi awal bila diperlukan
  try {
    autoGenerateRegistrationOnScheduleChange();
  } catch {}
  // Auto-fill registration date to H-7 if empty, then schedule and reg no
  try {
    const regDateEl = qs("#registration_date");
    if (regDateEl && !regDateEl.value) {
      regDateEl.value = hMinus7DateString();
      autoSelectHMinus7();
      toast("Auto-select: Tanggal pendaftaran diset ke H-7", "success");
    }
  } catch {}

  // Monitor encounter ID field changes for copy button status
  try {
    const encounterField = qs("#satusehat_encounter_id");
    if (encounterField) {
      // Initial status check
      updateCopyButtonStatus();

      // Monitor changes
      encounterField.addEventListener("input", updateCopyButtonStatus);
      encounterField.addEventListener("change", updateCopyButtonStatus);
      encounterField.addEventListener("blur", updateCopyButtonStatus);
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
  const svc = qs("#service_type")?.value || "RJ";
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

  // Set satusehat_location_id langsung karena sekarang menggunakan input text
  const locationId = row.satusehat_location_id || "";
  if (locationId) {
    const locationInput = qs("#satusehat_location_id");
    if (locationInput) {
      locationInput.value = locationId;
    }
    
    // Tetap fetch lokasi untuk mempertahankan data di localStorage
    if (!state.token) {
      toast(
        "ℹ️ Token belum tersedia. Lokasi telah diisi, namun validasi tidak dapat dilakukan.",
        "info"
      );
    } else {
      // Fetch data lokasi di background untuk memperbarui cache
      try {
        fetchSatusehatLocations().catch(e => console.warn("Background location fetch error:", e));
      } catch (e) {
        console.warn("Failed to start background location fetch:", e);
      }
    }
  }
  } else {
    set("#satusehat_location_id", "");
  }

  set("#satusehat_encounter_id", row.satusehat_encounter_id || "");
  set("#active_sim_order_id", row.id || "");

  // Update copy button status after populating form
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
  const modalEl = qs("#preview-modal");
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
  // Ambil nilai terbaru dari form untuk diupdate (PATCH)
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

// Service Request Functions
// Function to check and update copy button status based on encounter ID
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
    // Check available data in order form first
    const availableData = {
      patientId: qs("#ihs_number")?.value || "",
      encounterId: qs("#satusehat_encounter_id")?.value || "",
      practitionerId: qs("#satusehat_practitioner_id")?.value || "",
      locationId: qs("#satusehat_location_id")?.value || "",
      procedureCode: qs("#procedure_code")?.value || "",
      procedureName: qs("#procedure_name")?.value || "",
      clinicalNotes: qs("#clinical_notes")?.value || "",
    };

    // VALIDASI WAJIB: Encounter ID harus ada
    if (!availableData.encounterId || availableData.encounterId.trim() === "") {
      // Highlight encounter ID field dengan warna merah
      const encounterField = qs("#satusehat_encounter_id");
      if (encounterField) {
        encounterField.style.borderColor = "#e74c3c";
        encounterField.style.backgroundColor = "#fdf2f2";
        encounterField.focus();

        // Reset styling setelah 5 detik
        setTimeout(() => {
          encounterField.style.borderColor = "";
          encounterField.style.backgroundColor = "";
        }, 5000);
      }

      // Update button status
      updateCopyButtonStatus();

      toast(
        "❌ Tidak dapat menyalin data: Encounter ID harus diisi terlebih dahulu di form Order!",
        "error"
      );
      return;
    }

    // Copy patient data - menggunakan ihs_number sebagai patient FHIR ID
    const patientId = availableData.patientId;
    if (patientId) qs("#sr_patient_id").value = patientId;

    // Copy encounter data
    const encounterId = availableData.encounterId;
    if (encounterId) qs("#sr_encounter_id").value = encounterId;

    // Copy practitioner data - menggunakan satusehat_practitioner_id
    const practitionerId = availableData.practitionerId;
    if (practitionerId) qs("#sr_practitioner_id").value = practitionerId;

    // Copy location data
    const locationId = availableData.locationId;
    if (locationId) qs("#sr_location_id").value = locationId;

    // Copy procedure data
    const procedureCode = availableData.procedureCode;
    const procedureName = availableData.procedureName;
    if (procedureCode) qs("#sr_code").value = procedureCode;
    if (procedureName) qs("#sr_code_display").value = procedureName;

    // Copy additional data from order form
    const clinicalNotes = availableData.clinicalNotes;

    // Set notes with clinical notes if available
    if (clinicalNotes) {
      qs("#sr_note").value = clinicalNotes;
    }

    // Set default authored_on to current time
    const now = new Date();
    const localDateTime = new Date(
      now.getTime() - now.getTimezoneOffset() * 60000
    )
      .toISOString()
      .slice(0, 16);
    qs("#sr_authored_on").value = localDateTime;

    // Show summary of copied data
    const copiedFields = [];
    if (patientId) copiedFields.push("Patient ID");
    if (encounterId) copiedFields.push("Encounter ID");
    if (practitionerId) copiedFields.push("Practitioner ID");
    if (locationId) copiedFields.push("Location ID");
    if (procedureCode) copiedFields.push("Procedure Code");
    if (procedureName) copiedFields.push("Procedure Name");
    if (clinicalNotes) copiedFields.push("Clinical Notes");

    // Visual feedback - highlight copied fields
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
      if (element) {
        if (field.copied) {
          element.style.borderColor = "#2ecc71";
          element.style.backgroundColor = "#d5f4e6";
          setTimeout(() => {
            element.style.borderColor = "";
            element.style.backgroundColor = "";
          }, 2000);
        }
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

  // Collect form data
  const payload = {
    patient_id: qs("#sr_patient_id")?.value?.trim() || "",
    encounter_id: qs("#sr_encounter_id")?.value?.trim() || "",
    practitioner_id: qs("#sr_practitioner_id")?.value?.trim() || "",
    location_id: qs("#sr_location_id")?.value?.trim() || "",
    code: qs("#sr_code")?.value?.trim() || "",
    code_display: qs("#sr_code_display")?.value?.trim() || "",
    category_code: qs("#sr_category_code")?.value?.trim() || "394914008",
    category_display: qs("#sr_category_display")?.value?.trim() || "Radiology",
    priority: qs("#sr_priority")?.value || "routine",
    intent: qs("#sr_intent")?.value || "order",
    status: qs("#sr_status")?.value || "active",
    authored_on: qs("#sr_authored_on")?.value || null,
    reason_code: qs("#sr_reason_code")?.value?.trim() || null,
    reason_display: qs("#sr_reason_display")?.value?.trim() || null,
    note: qs("#sr_note")?.value?.trim() || null,
  };

  // Validate required fields with visual feedback
  const requiredFields = [
    { field: "patient_id", name: "Patient ID", elementId: "#sr_patient_id" },
    {
      field: "encounter_id",
      name: "Encounter ID",
      elementId: "#sr_encounter_id",
    },
    {
      field: "practitioner_id",
      name: "Practitioner ID",
      elementId: "#sr_practitioner_id",
    },
    { field: "location_id", name: "Location ID", elementId: "#sr_location_id" },
    { field: "code", name: "Procedure Code", elementId: "#sr_code" },
    {
      field: "code_display",
      name: "Procedure Display",
      elementId: "#sr_code_display",
    },
  ];

  const missingFields = [];
  for (const { field, name, elementId } of requiredFields) {
    const element = qs(elementId);
    if (!payload[field]) {
      missingFields.push(name);
      // Highlight missing field
      if (element) {
        element.style.borderColor = "#e74c3c";
        element.style.backgroundColor = "#fdf2f2";
        setTimeout(() => {
          element.style.borderColor = "";
          element.style.backgroundColor = "";
        }, 3000);
      }
    } else {
      // Clear any previous error styling
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

    const base = appApiBase();
    const url = `${base}/api/servicerequest/create`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${state.token}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data?.detail || data?.message || `HTTP ${res.status}`);
    }

    // Show success message
    toast("Service Request berhasil dibuat", "success");

    // Try to save service request ID to database
    await saveServiceRequestToDatabase(data);

    // Display result
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

    // Clear form
    qs("#service-request-form")?.reset();
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
    // Get the active order ID
    const activeOrderId = (qs("#active_sim_order_id")?.value || "").trim();

    if (!activeOrderId) {
      console.warn("No active order ID found, skipping database save");
      return;
    }

    // Extract service request ID from response
    const serviceRequestId =
      serviceRequestData?.id || serviceRequestData?.resourceId || "";

    if (!serviceRequestId) {
      console.warn(
        "No service request ID found in response, skipping database save"
      );
      return;
    }

    // Call backend endpoint to save service request ID
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

// Add event listeners for service request
document.addEventListener("DOMContentLoaded", () => {
  const btnCopyFromOrder = qs("#btn-copy-from-order");
  const btnCreateServiceRequest = qs("#btn-create-service-request");

  if (btnCopyFromOrder) {
    btnCopyFromOrder.addEventListener("click", copyFromOrderToServiceRequest);
  }

  if (btnCreateServiceRequest) {
    btnCreateServiceRequest.addEventListener("click", createServiceRequest);
  }
});
