// api.js - API calls dan data fetching
// =====================================================

// Global variables for static data
let SAMPLE_PATIENTS = [];
let SAMPLE_PRACTITIONERS = [];
let PROCEDURE_SAMPLES = [];
let LOINC_LABELS = [];

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
  const { state, gatewayApiBase, toast, getCacheAge } = window.Utils;
  const { populateLocationDropdown } = window.UI;
  
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

// Resolve SATUSEHAT Patient ID
async function resolveSatusehatPatientId() {
  const { qs, state, gatewayApiBase, toast } = window.Utils;
  
  const patientNik = (qs("#patient_national_id")?.value || "").trim();
  if (!patientNik) {
    toast("NIK pasien harus diisi untuk resolve Patient ID", "error");
    return;
  }

  const base = gatewayApiBase();
  const url = `${base}/satusehat/patient?nik=${encodeURIComponent(patientNik)}`;

  try {
    const res = await fetch(url, {
      headers: {
        Authorization: "Bearer " + state.token,
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status}: ${errText || res.statusText}`);
    }

    const data = await res.json();
    const patientId = data?.id;

    if (patientId) {
      const ihsField = qs("#ihs_number");
      if (ihsField) {
        ihsField.value = patientId;
      }
      toast(`Patient ID berhasil di-resolve: ${patientId}`, "success");
    } else {
      toast("Patient ID tidak ditemukan dalam respon", "warning");
    }
  } catch (e) {
    console.error("Resolve Patient ID error:", e);
    toast("Gagal resolve Patient ID: " + (e?.message || e), "error");
  }
}

// Generate Encounter ID
async function generateEncounterId() {
  const { qs, state, gatewayApiBase, toast, isoFromLocalDatetime } = window.Utils;
  const { saveSimOrder } = window.Orders;
  const { updateCopyButtonStatus } = window.UI;
  
  const patientId = (qs("#ihs_number")?.value || "").trim();
  const practitionerRef = (qs("#satusehat_practitioner_id")?.value || "").trim();
  const locationRef = (qs("#satusehat_location_id")?.value || "").trim();
  const registrationNumber = (qs("#registration_number")?.value || "").trim();
  const patientName = (qs("#patient_name")?.value || "").trim();
  const practitionerName = (qs("#practitioner_name")?.value || "").trim();
  const periodStartStr = (qs("#scheduled_at")?.value || "").trim();

  if (!patientId) {
    toast("SATUSEHAT Patient ID harus diisi", "error");
    return;
  }
  if (!practitionerRef) {
    toast("SATUSEHAT Practitioner ID harus diisi", "error");
    return;
  }

  const periodStartIso = periodStartStr ? isoFromLocalDatetime(periodStartStr) : null;
  const base = gatewayApiBase();

  try {
    const encounterPayload = {
      resourceType: "Encounter",
      status: "finished",
      class: {
        system: "http://terminology.hl7.org/CodeSystem/v3-ActCode",
        code: "AMB",
        display: "ambulatory",
      },
      subject: {
        reference: `Patient/${patientId}`,
        display: patientName || undefined,
      },
      participant: [
        {
          type: [
            {
              coding: [
                {
                  system: "http://terminology.hl7.org/CodeSystem/v3-ParticipationType",
                  code: "ATND",
                  display: "attender",
                },
              ],
            },
          ],
          individual: {
            reference: `Practitioner/${practitionerRef}`,
            display: practitionerName || undefined,
          },
        },
      ],
      period: {
        start: periodStartIso || new Date().toISOString(),
      },
      identifier: registrationNumber
        ? [
            {
              system: "http://sys-ids.kemkes.go.id/encounter/{{organization_id}}",
              value: registrationNumber,
            },
          ]
        : [],
    };

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
        errText = await resp.text();
        errJson = JSON.parse(errText);
      } catch (e) {
        console.warn("Failed to parse error response:", e);
      }

      if (errJson && errJson.resourceType === "OperationOutcome") {
        const issues = errJson.issue || [];
        const isDuplicate = issues.some((it) => {
          const code = (it?.code || "").toLowerCase();
          const detailsText = (it?.details?.text || "").toLowerCase();
          return code === "duplicate" || detailsText.includes("duplicate");
        });
        if (isDuplicate) {
          // Check if automatic search was performed and existing encounters were found
          if (errJson.duplicateDetected && errJson.searchPerformed && errJson.existingEncounters) {
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
                const practitioner = encounter.participant?.[0]?.individual?.display || "N/A";
                const location = encounter.location?.[0]?.location?.reference || "N/A";
                
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
              `Encounter duplikat terdeteksi! Gagal mencari encounter yang sudah ada: ${errJson.searchError || "Unknown error"}\n\nSilakan ganti tanggal kunjungan atau data pasien/praktisi.`,
              "error"
            );
          } else {
            toast(
              "Encounter duplikat: ganti tanggal kunjungan atau data pasien/praktisi. Satu encounter hanya untuk satu kunjungan per pasien per hari.",
              "error"
            );
          }
        } else {
          const detailsText = issues[0]?.details?.text || "";
          toast(
            "Gagal membuat Encounter: " + (detailsText || resp.statusText),
            "error"
          );
        }
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
        toast("Data berhasil disimpan dengan Encounter ID: " + encounterId, "success");
      } catch (saveError) {
        console.error("Auto-save error:", saveError);
        toast("Encounter ID berhasil dibuat, tetapi gagal menyimpan data: " + (saveError?.message || saveError), "warning");
      }
    }
  } catch (e) {
    console.error(e);
    toast("Gagal membuat Encounter: " + (e?.message || e), "error");
  }
}

// Search Encounter by ID
async function searchEncounterById() {
  const { qs, state, gatewayApiBase, toast } = window.Utils;
  
  const patientId = (qs("#ihs_number")?.value || "").trim();
  
  if (!patientId) {
    toast("SATUSEHAT Patient ID harus diisi untuk mencari encounter", "error");
    return;
  }

  const base = gatewayApiBase();
  const url = `${base}/satusehat/encounter/patient/${encodeURIComponent(patientId)}`;

  try {
    const res = await fetch(url, {
      headers: {
        Authorization: "Bearer " + state.token,
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status}: ${errText || res.statusText}`);
    }

    const data = await res.json();
    const encounters = data?.entry || [];
    const totalEncounters = data?.totalEncounters || 0;

    if (totalEncounters === 0) {
      toast("Tidak ada encounter ditemukan untuk Patient ID ini", "info");
      return;
    }

    // Jika hanya ada 1 encounter, otomatis isi field
    if (encounters.length === 1) {
      const encounter = encounters[0].resource;
      const encounterId = encounter.id;
      const encounterField = qs("#satusehat_encounter_id");
      if (encounterField) {
        encounterField.value = encounterId;
      }
      toast(`Encounter ditemukan dan diisi otomatis: ${encounterId}`, "success");
      return;
    }

    // Jika ada multiple encounters, tampilkan daftar
    let encounterInfo = `Ditemukan ${totalEncounters} encounter untuk pasien ini:\n\n`;
    encounters.forEach((entry, index) => {
      const encounter = entry.resource;
      const encounterId = encounter.id;
      const identifier = encounter.identifier?.[0]?.value || "N/A";
      const period = encounter.period?.start || "N/A";
      const practitioner = encounter.participant?.[0]?.individual?.display || "N/A";
      const location = encounter.location?.[0]?.location?.reference || "N/A";
      
      encounterInfo += `${index + 1}. ID: ${encounterId}\n`;
      encounterInfo += `   Nomor Registrasi: ${identifier}\n`;
      encounterInfo += `   Tanggal: ${period}\n`;
      encounterInfo += `   Praktisi: ${practitioner}\n`;
      encounterInfo += `   Lokasi: ${location}\n\n`;
    });

    toast(encounterInfo + "Silakan pilih encounter yang sesuai dan isi manual ke field Encounter ID.", "info");

  } catch (e) {
    console.error("Search encounter error:", e);
    toast("Gagal mencari encounter: " + (e?.message || e), "error");
  }
}

// Export functions and data
window.API = {
  SAMPLE_PATIENTS,
  SAMPLE_PRACTITIONERS, 
  PROCEDURE_SAMPLES,
  LOINC_LABELS,
  loadStaticData,
  fetchSatusehatLocations,
  resolveSatusehatPatientId,
  generateEncounterId,
  searchEncounterById
};

// Export data arrays for global access
window.SAMPLE_PATIENTS = SAMPLE_PATIENTS;
window.SAMPLE_PRACTITIONERS = SAMPLE_PRACTITIONERS;
window.PROCEDURE_SAMPLES = PROCEDURE_SAMPLES;
window.LOINC_LABELS = LOINC_LABELS;