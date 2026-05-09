// orders.js - Order management functions
// =====================================================

// Save SIM Order
async function saveSimOrder() {
  const { qs, state, gatewayApiBase, toast, collectSimOrderRecord } =
    window.Utils;

  if (!state.token) {
    toast("Token tidak tersedia. Silakan login terlebih dahulu.", "error");
    return;
  }

  const record = collectSimOrderRecord();
  if (!record) {
    toast("Gagal mengumpulkan data order", "error");
    return;
  }

  // Validasi data wajib
  if (!record.patient_national_id) {
    toast("NIK pasien harus diisi", "error");
    return;
  }
  if (!record.patient_name) {
    toast("Nama pasien harus diisi", "error");
    return;
  }
  if (!record.practitioner_name) {
    toast("Nama praktisi harus diisi", "error");
    return;
  }
  if (!record.procedure_code) {
    toast("Kode prosedur harus diisi", "error");
    return;
  }
  if (!record.scheduled_at) {
    toast("Waktu terjadwal harus diisi", "error");
    return;
  }

  const base = gatewayApiBase();
  const uiBase = window.location.origin;
  const uiUrl = uiBase + "/sim/orders";

  try {
    const response = await fetch(uiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + state.token,
      },
      body: JSON.stringify(record),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(
        `HTTP ${response.status}: ${errorText || response.statusText}`
      );
    }

    const result = await response.json();
    toast("Order berhasil disimpan", "success");

    // Update UI dengan data yang disimpan
    if (result.id) {
      const orderIdField = qs("#order_id");
      if (orderIdField) {
        orderIdField.value = result.id;
      }
    }

    return result;
  } catch (error) {
    console.error("Save order error:", error);
    toast("Gagal menyimpan order: " + (error?.message || error), "error");
    throw error;
  }
}

// Load saved orders
async function loadSavedOrders() {
  const { state, gatewayApiBase, toast } = window.Utils;

  if (!state.token) {
    toast("Token tidak tersedia. Silakan login terlebih dahulu.", "error");
    return [];
  }

  const base = gatewayApiBase();
  const uiBase = window.location.origin;
  const uiUrl = uiBase + "/sim/orders";

  try {
    const response = await fetch(uiUrl, {
      headers: {
        Authorization: "Bearer " + state.token,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(
        `HTTP ${response.status}: ${errorText || response.statusText}`
      );
    }

    const orders = await response.json();
    return Array.isArray(orders) ? orders : [];
  } catch (error) {
    console.error("Load orders error:", error);
    toast("Gagal memuat daftar order: " + (error?.message || error), "error");
    return [];
  }
}

// Delete order
async function deleteOrder(orderId) {
  const { state, gatewayApiBase, toast } = window.Utils;

  if (!state.token) {
    toast("Token tidak tersedia. Silakan login terlebih dahulu.", "error");
    return false;
  }

  if (!orderId) {
    toast("ID order tidak valid", "error");
    return false;
  }

  const uiBase = window.location.origin;
  const uiUrl = uiBase + `/sim/orders/${orderId}`;

  try {
    const response = await fetch(uiUrl, {
      method: "DELETE",
      headers: {
        Authorization: "Bearer " + state.token,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(
        `HTTP ${response.status}: ${errorText || response.statusText}`
      );
    }

    toast("Order berhasil dihapus", "success");
    return true;
  } catch (error) {
    console.error("Delete order error:", error);
    toast("Gagal menghapus order: " + (error?.message || error), "error");
    return false;
  }
}

// Load order by ID
async function loadOrderById(orderId) {
  const { state, gatewayApiBase, toast } = window.Utils;

  if (!state.token) {
    toast("Token tidak tersedia. Silakan login terlebih dahulu.", "error");
    return null;
  }

  if (!orderId) {
    toast("ID order tidak valid", "error");
    return null;
  }

  const uiBase = window.location.origin;
  const uiUrl = uiBase + `/sim/orders/${orderId}`;

  try {
    const response = await fetch(uiUrl, {
      headers: {
        Authorization: "Bearer " + state.token,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(
        `HTTP ${response.status}: ${errorText || response.statusText}`
      );
    }

    const order = await response.json();
    return order;
  } catch (error) {
    console.error("Load order error:", error);
    toast("Gagal memuat order: " + (error?.message || error), "error");
    return null;
  }
}

// Fill form with order data
function fillFormWithOrder(order) {
  const { qs } = window.Utils;

  if (!order) return;

  const fieldMappings = {
    "#patient_national_id": order.patient_national_id,
    "#patient_name": order.patient_name,
    "#patient_sex": order.patient_sex,
    "#patient_birth_date": order.patient_birth_date,
    "#patient_mrn": order.patient_mrn,
    "#ihs_number": order.patient_ihs_number,
    "#practitioner_name": order.practitioner_name,
    "#satusehat_practitioner_id": order.satusehat_practitioner_id,
    "#satusehat_location_id": order.satusehat_location_id,
    "#satusehat_encounter_id": order.satusehat_encounter_id,
    "#procedure_code": order.procedure_code,
    "#procedure_name": order.procedure_name,
    "#scheduled_at": order.scheduled_at,
    "#registration_number": order.registration_number,
    "#clinical_notes": order.clinical_notes,
    "#service_type": order.service_type,
    "#order_id": order.id,
  };

  Object.entries(fieldMappings).forEach(([selector, value]) => {
    const field = qs(selector);
    if (field && value !== undefined && value !== null) {
      field.value = value;
    }
  });
}

// Clear form
function clearForm() {
  const { qs } = window.Utils;

  const formFields = [
    "#patient_national_id",
    "#patient_name",
    "#patient_sex",
    "#patient_birth_date",
    "#patient_mrn",
    "#ihs_number",
    "#practitioner_name",
    "#satusehat_practitioner_id",
    "#satusehat_location_id",
    "#satusehat_encounter_id",
    "#procedure_code",
    "#procedure_name",
    "#scheduled_at",
    "#registration_number",
    "#clinical_notes",
    "#service_type",
    "#order_id",
  ];

  formFields.forEach((selector) => {
    const field = qs(selector);
    if (field) {
      field.value = "";
    }
  });

  // Reset dropdowns to first option
  const dropdowns = [
    "#patient_search",
    "#practitioner_search",
    "#procedure_search",
    "#satusehat_location_id",
  ];

  dropdowns.forEach((selector) => {
    const dropdown = qs(selector);
    if (dropdown && dropdown.options.length > 0) {
      dropdown.selectedIndex = 0;
    }
  });
}

// Validate order data
function validateOrderData() {
  const { qs, toast } = window.Utils;

  const requiredFields = [
    { selector: "#patient_national_id", name: "NIK Pasien" },
    { selector: "#patient_name", name: "Nama Pasien" },
    { selector: "#practitioner_name", name: "Nama Praktisi" },
    { selector: "#procedure_code", name: "Kode Prosedur" },
    { selector: "#scheduled_at", name: "Waktu Terjadwal" },
  ];

  const missingFields = [];

  requiredFields.forEach(({ selector, name }) => {
    const field = qs(selector);
    if (!field || !field.value.trim()) {
      missingFields.push(name);
    }
  });

  if (missingFields.length > 0) {
    toast(`Field wajib belum diisi: ${missingFields.join(", ")}`, "error");
    return false;
  }

  return true;
}

// Generate registration number
function generateRegistrationNumber() {
  const { qs, formatRegistrationNumber } = window.Utils;

  const regField = qs("#registration_number");
  if (regField) {
    const regNumber = formatRegistrationNumber();
    regField.value = regNumber;
  }
}

// Setup order management UI
function setupOrderManagement() {
  const { qs } = window.Utils;

  // Setup save button
  const saveBtn = qs("#btn-save-order");
  if (saveBtn) {
    saveBtn.addEventListener("click", async () => {
      if (validateOrderData()) {
        await saveSimOrder();
      }
    });
  }

  // Setup clear button
  const clearBtn = qs("#btn-clear-form");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      if (confirm("Apakah Anda yakin ingin mengosongkan form?")) {
        clearForm();
      }
    });
  }

  // Setup generate registration number button
  const genRegBtn = qs("#btn-gen-reg");
  if (genRegBtn) {
    genRegBtn.addEventListener("click", generateRegistrationNumber);
  }

  // Setup load orders button
  const loadOrdersBtn = qs("#btn-load-orders");
  if (loadOrdersBtn) {
    loadOrdersBtn.addEventListener("click", async () => {
      const orders = await loadSavedOrders();
      displayOrdersList(orders);
    });
  }
}

// Display orders list
function displayOrdersList(orders) {
  const { qs } = window.Utils;

  const ordersContainer = qs("#orders-list");
  if (!ordersContainer) return;

  if (!orders || orders.length === 0) {
    ordersContainer.innerHTML =
      '<p class="text-muted">Tidak ada order tersimpan</p>';
    return;
  }

  let html =
    '<div class="table-responsive"><table class="table table-striped table-hover">';
  html += "<thead><tr>";
  html += "<th>ID</th>";
  html += "<th>Pasien</th>";
  html += "<th>Prosedur</th>";
  html += "<th>Tanggal</th>";
  html += "<th>Status</th>";
  html += "<th>Aksi</th>";
  html += "</tr></thead><tbody>";

  orders.forEach((order) => {
    html += "<tr>";
    html += `<td>${order.id || "-"}</td>`;
    html += `<td>${order.patient_name || "-"}<br><small class="text-muted">${
      order.patient_national_id || "-"
    }</small></td>`;
    html += `<td>${order.procedure_name || order.procedure_code || "-"}</td>`;
    html += `<td>${
      order.scheduled_at
        ? new Date(order.scheduled_at).toLocaleString("id-ID")
        : "-"
    }</td>`;
    html += `<td><span class="badge bg-success">Tersimpan</span></td>`;
    html += "<td>";
    html += `<button class="btn btn-sm btn-primary me-1" onclick="window.Orders.loadAndFillOrder('${order.id}')">Load</button>`;
    html += `<button class="btn btn-sm btn-danger" onclick="window.Orders.confirmDeleteOrder('${order.id}')">Hapus</button>`;
    html += "</td>";
    html += "</tr>";
  });

  html += "</tbody></table></div>";
  ordersContainer.innerHTML = html;
}

// Load and fill order
async function loadAndFillOrder(orderId) {
  const order = await loadOrderById(orderId);
  if (order) {
    fillFormWithOrder(order);
    toast("Order berhasil dimuat ke form", "success");
  }
}

// Confirm delete order
async function confirmDeleteOrder(orderId) {
  if (confirm("Apakah Anda yakin ingin menghapus order ini?")) {
    const success = await deleteOrder(orderId);
    if (success) {
      // Reload orders list
      const orders = await loadSavedOrders();
      displayOrdersList(orders);
    }
  }
}

// Export functions
window.Orders = {
  saveSimOrder,
  loadSavedOrders,
  deleteOrder,
  loadOrderById,
  fillFormWithOrder,
  clearForm,
  validateOrderData,
  generateRegistrationNumber,
  setupOrderManagement,
  displayOrdersList,
  loadAndFillOrder,
  confirmDeleteOrder,
};
