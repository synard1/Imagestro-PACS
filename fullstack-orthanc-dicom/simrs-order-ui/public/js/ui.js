// ui.js - UI interactions dan DOM manipulation
// =====================================================

// Populate dropdown dengan data
function populateDropdown(selectId, items, valueKey = "id", textKey = "name") {
  const { qs } = window.Utils;
  const select = qs(selectId);
  if (!select) return;

  // Clear existing options except first
  while (select.children.length > 1) {
    select.removeChild(select.lastChild);
  }

  items.forEach((item) => {
    const option = document.createElement("option");
    option.value = item[valueKey];
    option.textContent = item[textKey];
    select.appendChild(option);
  });
}

// Populate location dropdown
function populateLocationDropdown(locations) {
  populateDropdown("#satusehat_location_id", locations);
}

// Populate patient dropdown
function populatePatientDropdown(patients) {
  populateDropdown("#patient_search", patients, "national_id", "name");
}

// Populate practitioner dropdown
function populatePractitionerDropdown(practitioners) {
  populateDropdown("#practitioner_search", practitioners, "id", "name");
}

// Populate procedure dropdown
function populateProcedureDropdown(procedures) {
  populateDropdown("#procedure_search", procedures, "code", "display");
}

// Update copy button status
function updateCopyButtonStatus() {
  const { qs } = window.Utils;
  const copyBtn = qs("#copy-encounter-btn");
  const encounterField = qs("#satusehat_encounter_id");
  
  if (copyBtn && encounterField) {
    copyBtn.disabled = !encounterField.value.trim();
  }
}

// Copy encounter ID to clipboard
function copyEncounterId() {
  const { qs, toast } = window.Utils;
  const encounterField = qs("#satusehat_encounter_id");
  
  if (!encounterField || !encounterField.value.trim()) {
    toast("Tidak ada Encounter ID untuk disalin", "warning");
    return;
  }

  navigator.clipboard
    .writeText(encounterField.value)
    .then(() => {
      toast("Encounter ID berhasil disalin ke clipboard", "success");
    })
    .catch((err) => {
      console.error("Gagal menyalin:", err);
      toast("Gagal menyalin Encounter ID", "error");
    });
}

// Setup autocomplete untuk patient search
function setupPatientAutocomplete() {
  const { qs } = window.Utils;
  const { SAMPLE_PATIENTS } = window.API;
  
  const searchInput = qs("#patient_search");
  const dropdown = qs("#patient_search");
  
  if (!searchInput || !dropdown) return;

  searchInput.addEventListener("input", function () {
    const query = this.value.toLowerCase();
    const filtered = SAMPLE_PATIENTS.filter(
      (p) =>
        p.name.toLowerCase().includes(query) ||
        p.national_id.includes(query) ||
        p.mrn.includes(query)
    );
    populatePatientDropdown(filtered);
  });

  dropdown.addEventListener("change", function () {
    const selectedNik = this.value;
    const patient = SAMPLE_PATIENTS.find((p) => p.national_id === selectedNik);
    if (patient) {
      fillPatientData(patient);
    }
  });
}

// Setup autocomplete untuk practitioner search
function setupPractitionerAutocomplete() {
  const { qs } = window.Utils;
  const { SAMPLE_PRACTITIONERS } = window.API;
  
  const searchInput = qs("#practitioner_search");
  const dropdown = qs("#practitioner_search");
  
  if (!searchInput || !dropdown) return;

  searchInput.addEventListener("input", function () {
    const query = this.value.toLowerCase();
    const filtered = SAMPLE_PRACTITIONERS.filter(
      (p) =>
        p.name.toLowerCase().includes(query) ||
        p.id.toLowerCase().includes(query)
    );
    populatePractitionerDropdown(filtered);
  });

  dropdown.addEventListener("change", function () {
    const selectedId = this.value;
    const practitioner = SAMPLE_PRACTITIONERS.find((p) => p.id === selectedId);
    if (practitioner) {
      fillPractitionerData(practitioner);
    }
  });
}

// Setup autocomplete untuk procedure search
function setupProcedureAutocomplete() {
  const { qs } = window.Utils;
  const { PROCEDURE_SAMPLES } = window.API;
  
  const searchInput = qs("#procedure_search");
  const dropdown = qs("#procedure_search");
  
  if (!searchInput || !dropdown) return;

  searchInput.addEventListener("input", function () {
    const query = this.value.toLowerCase();
    const filtered = PROCEDURE_SAMPLES.filter(
      (p) =>
        p.display.toLowerCase().includes(query) ||
        p.code.toLowerCase().includes(query)
    );
    populateProcedureDropdown(filtered);
  });

  dropdown.addEventListener("change", function () {
    const selectedCode = this.value;
    const procedure = PROCEDURE_SAMPLES.find((p) => p.code === selectedCode);
    if (procedure) {
      fillProcedureData(procedure);
    }
  });
}

// Fill patient data ke form
function fillPatientData(patient) {
  const { qs } = window.Utils;
  
  const fields = {
    "#patient_national_id": patient.national_id,
    "#patient_name": patient.name,
    "#patient_sex": patient.sex,
    "#patient_birth_date": patient.birth_date,
    "#patient_mrn": patient.mrn,
    "#ihs_number": patient.ihs_number || "",
  };

  Object.entries(fields).forEach(([selector, value]) => {
    const field = qs(selector);
    if (field) field.value = value;
  });
}

// Fill practitioner data ke form
function fillPractitionerData(practitioner) {
  const { qs } = window.Utils;
  
  const fields = {
    "#practitioner_name": practitioner.name,
    "#satusehat_practitioner_id": practitioner.id,
  };

  Object.entries(fields).forEach(([selector, value]) => {
    const field = qs(selector);
    if (field) field.value = value;
  });
}

// Fill procedure data ke form
function fillProcedureData(procedure) {
  const { qs } = window.Utils;
  
  const fields = {
    "#procedure_code": procedure.code,
    "#procedure_name": procedure.display,
  };

  Object.entries(fields).forEach(([selector, value]) => {
    const field = qs(selector);
    if (field) field.value = value;
  });
}

// Setup form validation
function setupFormValidation() {
  const { qs } = window.Utils;
  
  // Required field validation
  const requiredFields = [
    "#patient_national_id",
    "#patient_name", 
    "#practitioner_name",
    "#procedure_code",
    "#scheduled_at"
  ];

  requiredFields.forEach(selector => {
    const field = qs(selector);
    if (field) {
      field.addEventListener("blur", function() {
        validateField(this);
      });
    }
  });
}

// Validate individual field
function validateField(field) {
  const { toast } = window.Utils;
  
  if (field.hasAttribute("required") && !field.value.trim()) {
    field.classList.add("is-invalid");
    return false;
  } else {
    field.classList.remove("is-invalid");
    return true;
  }
}

// Setup datetime picker
function setupDatetimePicker() {
  const { qs, toLocalDatetimeInput } = window.Utils;
  
  const scheduledField = qs("#scheduled_at");
  if (scheduledField) {
    // Set default to current datetime
    scheduledField.value = toLocalDatetimeInput(new Date());
  }
}

// Setup modal handlers
function setupModalHandlers() {
  const { qs } = window.Utils;
  
  // Setup modal close handlers
  const modals = document.querySelectorAll('.modal');
  modals.forEach(modal => {
    const closeBtn = modal.querySelector('.btn-close, [data-bs-dismiss="modal"]');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        modal.style.display = 'none';
      });
    }
  });
}

// Show/hide loading spinner
function showLoading(show = true) {
  const { qs } = window.Utils;
  const spinner = qs("#loading-spinner");
  if (spinner) {
    spinner.style.display = show ? "block" : "none";
  }
}

// Setup tab navigation
function setupTabNavigation() {
  const { qs } = window.Utils;
  
  const tabButtons = document.querySelectorAll('[data-bs-toggle="tab"]');
  tabButtons.forEach(button => {
    button.addEventListener('click', function(e) {
      e.preventDefault();
      
      // Remove active class from all tabs and content
      document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active', 'show'));
      
      // Add active class to clicked tab
      this.classList.add('active');
      
      // Show corresponding content
      const targetId = this.getAttribute('data-bs-target');
      const targetPane = qs(targetId);
      if (targetPane) {
        targetPane.classList.add('active', 'show');
      }
    });
  });
}

// Setup responsive table
function setupResponsiveTable() {
  const tables = document.querySelectorAll('table');
  tables.forEach(table => {
    if (!table.parentElement.classList.contains('table-responsive')) {
      const wrapper = document.createElement('div');
      wrapper.className = 'table-responsive';
      table.parentNode.insertBefore(wrapper, table);
      wrapper.appendChild(table);
    }
  });
}

// Setup tooltips
function setupTooltips() {
  const tooltipElements = document.querySelectorAll('[data-bs-toggle="tooltip"]');
  tooltipElements.forEach(element => {
    element.addEventListener('mouseenter', function() {
      const title = this.getAttribute('title') || this.getAttribute('data-bs-title');
      if (title) {
        showTooltip(this, title);
      }
    });
    
    element.addEventListener('mouseleave', function() {
      hideTooltip();
    });
  });
}

// Show tooltip
function showTooltip(element, text) {
  const tooltip = document.createElement('div');
  tooltip.className = 'custom-tooltip';
  tooltip.textContent = text;
  tooltip.style.position = 'absolute';
  tooltip.style.backgroundColor = '#333';
  tooltip.style.color = 'white';
  tooltip.style.padding = '5px 10px';
  tooltip.style.borderRadius = '4px';
  tooltip.style.fontSize = '12px';
  tooltip.style.zIndex = '9999';
  tooltip.style.pointerEvents = 'none';
  
  document.body.appendChild(tooltip);
  
  const rect = element.getBoundingClientRect();
  tooltip.style.left = rect.left + (rect.width / 2) - (tooltip.offsetWidth / 2) + 'px';
  tooltip.style.top = rect.top - tooltip.offsetHeight - 5 + 'px';
  
  // Store reference for cleanup
  element._tooltip = tooltip;
}

// Hide tooltip
function hideTooltip() {
  const tooltips = document.querySelectorAll('.custom-tooltip');
  tooltips.forEach(tooltip => tooltip.remove());
}

// Initialize all UI components
function initializeUI() {
  setupPatientAutocomplete();
  setupPractitionerAutocomplete();
  setupProcedureAutocomplete();
  setupFormValidation();
  setupDatetimePicker();
  setupModalHandlers();
  setupTabNavigation();
  setupResponsiveTable();
  setupTooltips();
  updateCopyButtonStatus();
}

// Export functions
window.UI = {
  populateDropdown,
  populateLocationDropdown,
  populatePatientDropdown,
  populatePractitionerDropdown,
  populateProcedureDropdown,
  updateCopyButtonStatus,
  copyEncounterId,
  setupPatientAutocomplete,
  setupPractitionerAutocomplete,
  setupProcedureAutocomplete,
  fillPatientData,
  fillPractitionerData,
  fillProcedureData,
  setupFormValidation,
  validateField,
  setupDatetimePicker,
  setupModalHandlers,
  showLoading,
  setupTabNavigation,
  setupResponsiveTable,
  setupTooltips,
  showTooltip,
  hideTooltip,
  initializeUI
};