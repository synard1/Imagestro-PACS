// app.js - Main entry point
// =====================================================
// This file serves as the main entry point that coordinates all modules

// Wait for all modules to be loaded
document.addEventListener("DOMContentLoaded", async () => {
  try {
    // Initialize all modules
    await initializeApplication();
  } catch (e) {
    console.error("Application initialization error:", e);
    window.Utils?.toast?.(
      "Gagal menginisialisasi aplikasi: " + (e?.message || e),
      "error"
    );
  }
});

// Main initialization function
async function initializeApplication() {
  const { qs, state, toast, formatLocalDatetime } = window.Utils;
  const { login, fetchConfig } = window.Auth;
  const { loadStaticData, fetchSatusehatLocations } = window.API;
  const { initializeUI, populateLocationDropdown, updateCopyButtonStatus } =
    window.UI;
  const { setupOrderManagement } = window.Orders;

  // Initialize configuration and static data
  await Promise.all([fetchConfig(), loadStaticData()]);

  // Update login status
  const loginStatus = qs("#login-status");
  if (state.token && loginStatus) {
    loginStatus.textContent = "Token tersedia";
  }

  // Load cached locations
  try {
    const cached = JSON.parse(
      localStorage.getItem("satusehat_locations") || "[]"
    );
    populateLocationDropdown(cached);
  } catch (e) {
    console.warn("Failed to load cached locations:", e);
  }

  // Fetch fresh locations if token available
  if (state.token) {
    try {
      await fetchSatusehatLocations();
    } catch (e) {
      console.warn("Failed to fetch fresh locations:", e);
    }
  }

  // Initialize UI components
  initializeUI();
  setupOrderManagement();
  setupEventListeners();
  setupFormDefaults();

  console.log("Application initialized successfully");
}

// Setup all event listeners
function setupEventListeners() {
  const { qs } = window.Utils;
  const { login } = window.Auth;
  const {
    generateEncounterId,
    searchEncounterById,
    resolveSatusehatPatientId,
  } = window.API;
  const { copyEncounterId } = window.UI;

  // Authentication
  const btnLogin = qs("#btn-login");
  if (btnLogin) btnLogin.addEventListener("click", login);

  // Encounter management
  const btnGenerate = qs("#btn-generate-enc");
  if (btnGenerate) btnGenerate.addEventListener("click", generateEncounterId);

  const btnSearchEnc = qs("#btn-search-enc");
  if (btnSearchEnc) btnSearchEnc.addEventListener("click", searchEncounterById);

  const btnResolvePatient = qs("#btn-resolve-patient");
  if (btnResolvePatient)
    btnResolvePatient.addEventListener("click", resolveSatusehatPatientId);

  // Copy encounter ID
  const btnCopyEncounter = qs("#copy-encounter-btn");
  if (btnCopyEncounter)
    btnCopyEncounter.addEventListener("click", copyEncounterId);

  // Order management
  const btnPreview = qs("#btn-preview");
  if (btnPreview) btnPreview.addEventListener("click", submitOrder);

  const btnPrint = qs("#btn-print");
  if (btnPrint) btnPrint.addEventListener("click", printProof);

  const btnDummy = qs("#btn-apply-dummy");
  if (btnDummy) btnDummy.addEventListener("click", applyDummyFromPreset);

  // Patient search
  const btnSearchPatient = qs("#btn-search-patient");
  if (btnSearchPatient) {
    btnSearchPatient.addEventListener("click", () => {
      const modal = qs("#patient-search-modal");
      if (modal) modal.hidden = false;
      renderPatientSamples();
    });
  }

  const btnPatientRun = qs("#btn-patient-search-run");
  if (btnPatientRun) btnPatientRun.addEventListener("click", doPatientSearch);

  // Practitioner search
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

  // Procedure search
  const btnSearchProc = qs("#btn-search-procedure");
  if (btnSearchProc) {
    btnSearchProc.addEventListener("click", () => {
      const modal = qs("#procedure-modal");
      if (modal) modal.hidden = false;
      renderProcedureCatalog();
    });
  }

  // Service Request
  const btnCopyFromOrder = qs("#btn-copy-from-order");
  if (btnCopyFromOrder) {
    btnCopyFromOrder.addEventListener("click", copyFromOrderToServiceRequest);
  }

  const btnCreateServiceRequest = qs("#btn-create-service-request");
  if (btnCreateServiceRequest) {
    btnCreateServiceRequest.addEventListener("click", createServiceRequest);
  }

  // Modal controls
  const btnCancel = qs("#btn-cancel");
  if (btnCancel) {
    btnCancel.addEventListener("click", () => {
      const modal = qs("#order-preview-modal");
      if (modal) modal.hidden = true;
    });
  }

  // Orders table actions
  const tbody = qs("#sim-orders-tbody");
  if (tbody) tbody.addEventListener("click", handleSimOrdersActions);

  // Form field listeners
  setupFormFieldListeners();

  // Encounter field listener
  const encounterField = qs("#satusehat_encounter_id");
  if (encounterField) {
    updateCopyButtonStatus();
    encounterField.addEventListener("input", updateCopyButtonStatus);
    encounterField.addEventListener("change", updateCopyButtonStatus);
    encounterField.addEventListener("blur", updateCopyButtonStatus);
  }
}

// Setup form field listeners
function setupFormFieldListeners() {
  const { qs } = window.Utils;

  // Registration date and schedule change listeners
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
}

// Setup form defaults
function setupFormDefaults() {
  const { qs, formatLocalDatetime, hMinus7DateString, toast } = window.Utils;

  // Load suggestions
  loadSuggestions("suggest_mrn", "mrnList");
  loadSuggestions("suggest_loinc", "loincList");

  // Auto-generate registration on schedule change
  try {
    autoGenerateRegistrationOnScheduleChange();
  } catch (e) {
    console.warn("Failed to auto-generate registration:", e);
  }

  // Set default registration date to H-7
  try {
    const regDateEl = qs("#registration_date");
    if (regDateEl && !regDateEl.value) {
      regDateEl.value = hMinus7DateString();
      autoSelectHMinus7();
      toast("Auto-select: Tanggal pendaftaran diset ke H-7", "success");
    }
  } catch (e) {
    console.warn("Failed to set default registration date:", e);
  }

  // Set default scheduled time to current datetime
  try {
    const scheduledField = qs("#scheduled_at");
    if (scheduledField && !scheduledField.value) {
      scheduledField.value = formatLocalDatetime(new Date());
    }
  } catch (e) {
    console.warn("Failed to set default scheduled time:", e);
  }
}

// Legacy functions that still need to be maintained
// These functions are kept here for compatibility until they can be properly modularized

function loadSuggestions(key, datalistId) {
  // Implementation moved to utils but kept here for compatibility
  window.Utils?.loadSuggestions?.(key, datalistId);
}

function autoSelectHMinus7() {
  const { qs, validateHMinus7Selection } = window.Utils;
  const regDateEl = qs("#registration_date");
  const h7El = qs("#h_minus_7");

  if (!regDateEl || !h7El) return;

  const regDate = regDateEl.value;
  if (!regDate) return;

  const regDateObj = new Date(regDate + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const diffTime = regDateObj.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === -7) {
    h7El.checked = true;
  } else {
    h7El.checked = false;
  }

  validateHMinus7Selection();
}

function autoGenerateRegistrationOnScheduleChange() {
  const { qs, formatRegistrationNumber } = window.Utils;
  const regField = qs("#registration_number");
  const serviceTypeField = qs("#service_type");
  const scheduledField = qs("#scheduled_at");

  if (!regField || !serviceTypeField || !scheduledField) return;

  const serviceType = serviceTypeField.value;
  const scheduledAt = scheduledField.value;

  if (serviceType && scheduledAt) {
    regField.value = formatRegistrationNumber(serviceType, scheduledAt);
  }
}

// Order submission and preview functions
async function submitOrder(e) {
  const { collectPayload, toast } = window.Utils;

  try {
    e?.preventDefault?.();
  } catch {}

  const payload = collectPayload();
  if (!payload) {
    toast("Gagal mengumpulkan data order", "error");
    return;
  }

  openPreviewForPayload(payload);
}

function printProof() {
  window.print();
}

function applyDummyFromPreset(e) {
  const { qs, SAMPLE_PATIENTS, SAMPLE_PRACTITIONERS, PROCEDURE_SAMPLES } =
    window.Utils;
  const { fillPatientData, fillPractitionerData, fillProcedureData } =
    window.UI;

  try {
    e?.preventDefault?.();
  } catch {}

  if (SAMPLE_PATIENTS.length > 0) {
    fillPatientData(SAMPLE_PATIENTS[0]);
  }

  if (SAMPLE_PRACTITIONERS.length > 0) {
    fillPractitionerData(SAMPLE_PRACTITIONERS[0]);
  }

  if (PROCEDURE_SAMPLES.length > 0) {
    fillProcedureData(PROCEDURE_SAMPLES[0]);
  }
}

// Patient search functions
function renderPatientSamples(list) {
  const { qs } = window.Utils;
  const { SAMPLE_PATIENTS } = window.API;

  const container = qs("#patient-samples");
  if (!container) return;

  const patients = list || SAMPLE_PATIENTS;
  let html = "";

  patients.forEach((p, i) => {
    html += `<div class="patient-item" data-index="${i}">`;
    html += `<strong>${p.name}</strong><br>`;
    html += `NIK: ${p.national_id}<br>`;
    html += `MRN: ${p.mrn}<br>`;
    html += `Jenis Kelamin: ${p.sex}<br>`;
    html += `Tanggal Lahir: ${p.birth_date}`;
    html += `</div>`;
  });

  container.innerHTML = html;

  // Add click listeners
  container.querySelectorAll(".patient-item").forEach((item, index) => {
    item.addEventListener("click", () => {
      const patient = patients[index];
      if (patient) {
        window.UI.fillPatientData(patient);
        const modal = qs("#patient-search-modal");
        if (modal) modal.hidden = true;
      }
    });
  });
}

function doPatientSearch() {
  const { qs } = window.Utils;
  const { SAMPLE_PATIENTS } = window.API;

  const query = (qs("#patient-search-input")?.value || "").toLowerCase();
  if (!query) {
    renderPatientSamples();
    return;
  }

  const filtered = SAMPLE_PATIENTS.filter(
    (p) =>
      p.name.toLowerCase().includes(query) ||
      p.national_id.includes(query) ||
      p.mrn.includes(query)
  );

  renderPatientSamples(filtered);
}

// Practitioner search functions
function renderPractitionerSamples(list) {
  const { qs } = window.Utils;
  const { SAMPLE_PRACTITIONERS } = window.API;

  const container = qs("#practitioner-samples");
  if (!container) return;

  const practitioners = list || SAMPLE_PRACTITIONERS;
  let html = "";

  practitioners.forEach((p, i) => {
    html += `<div class="practitioner-item" data-index="${i}">`;
    html += `<strong>${p.name}</strong><br>`;
    html += `ID: ${p.id}`;
    html += `</div>`;
  });

  container.innerHTML = html;

  // Add click listeners
  container.querySelectorAll(".practitioner-item").forEach((item, index) => {
    item.addEventListener("click", () => {
      const practitioner = practitioners[index];
      if (practitioner) {
        window.UI.fillPractitionerData(practitioner);
        const modal = qs("#practitioner-search-modal");
        if (modal) modal.hidden = true;
      }
    });
  });
}

function doPractitionerSearch() {
  const { qs } = window.Utils;
  const { SAMPLE_PRACTITIONERS } = window.API;

  const query = (qs("#practitioner-search-input")?.value || "").toLowerCase();
  if (!query) {
    renderPractitionerSamples();
    return;
  }

  const filtered = SAMPLE_PRACTITIONERS.filter(
    (p) =>
      p.name.toLowerCase().includes(query) || p.id.toLowerCase().includes(query)
  );

  renderPractitionerSamples(filtered);
}

// Procedure search functions
function renderProcedureCatalog(list) {
  const { qs } = window.Utils;
  const { PROCEDURE_SAMPLES } = window.API;

  const container = qs("#procedure-samples");
  if (!container) return;

  const procedures = list || PROCEDURE_SAMPLES;
  let html = "";

  procedures.forEach((p, i) => {
    html += `<div class="procedure-item" data-index="${i}">`;
    html += `<strong>${p.display}</strong><br>`;
    html += `Code: ${p.code}`;
    html += `</div>`;
  });

  container.innerHTML = html;

  // Add click listeners
  container.querySelectorAll(".procedure-item").forEach((item, index) => {
    item.addEventListener("click", () => {
      const procedure = procedures[index];
      if (procedure) {
        window.UI.fillProcedureData(procedure);
        const modal = qs("#procedure-modal");
        if (modal) modal.hidden = true;
      }
    });
  });
}

// Order management functions that need to be maintained for compatibility
async function loadSimOrders() {
  const orders = await window.Orders.loadSavedOrders();
  renderSimOrders(orders);
}

function renderSimOrders(rows) {
  window.Orders.displayOrdersList(rows);
}

async function handleSimOrdersActions(e) {
  const target = e.target;
  if (!target.matches("button")) return;

  const orderId = target.dataset.id;
  if (!orderId) return;

  if (target.classList.contains("btn-use")) {
    await useSimOrder(orderId);
  } else if (target.classList.contains("btn-send")) {
    await sendSimOrderById(orderId);
  } else if (target.classList.contains("btn-update")) {
    await updateSimOrderById(orderId);
  } else if (target.classList.contains("btn-delete")) {
    await deleteSimOrderById(orderId);
  }
}

async function useSimOrder(id) {
  await window.Orders.loadAndFillOrder(id);
}

async function sendSimOrderById(id) {
  // Implementation for sending order
  console.log("Send order:", id);
}

async function updateSimOrderById(id) {
  // Implementation for updating order
  console.log("Update order:", id);
}

async function deleteSimOrderById(id) {
  await window.Orders.confirmDeleteOrder(id);
}

// Service Request functions
function copyFromOrderToServiceRequest() {
  // Implementation for copying order to service request
  console.log("Copy from order to service request");
}

async function createServiceRequest(e) {
  // Implementation for creating service request
  console.log("Create service request");
}

function openPreviewForPayload(payload, simOrderId) {
  const { qs } = window.Utils;

  const modal = qs("#order-preview-modal");
  const previewContent = qs("#preview-content");

  if (!modal || !previewContent) return;

  previewContent.innerHTML = `<pre>${JSON.stringify(payload, null, 2)}</pre>`;
  modal.hidden = false;
}

// Export main functions for global access
window.App = {
  initializeApplication,
  setupEventListeners,
  setupFormDefaults,
  submitOrder,
  printProof,
  applyDummyFromPreset,
  renderPatientSamples,
  doPatientSearch,
  renderPractitionerSamples,
  doPractitionerSearch,
  renderProcedureCatalog,
  loadSimOrders,
  renderSimOrders,
  handleSimOrdersActions,
  copyFromOrderToServiceRequest,
  createServiceRequest,
  openPreviewForPayload,
};
