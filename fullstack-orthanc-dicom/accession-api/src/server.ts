import { Hono } from "hono";
import { pool, initDb, nextSeq, generateAndInsertAccession } from "./sql.ts";
import { config, errorMessages } from "./config.ts";

const app = new Hono();

const TZ = process.env.TIMEZONE || "Asia/Jakarta";
const FACILITY = process.env.DEFAULT_FACILITY_CODE || "RSABC";
const ISSUER = process.env.ISSUER_BASE_URL || "https://sys-ids.kemkes.go.id/acsn";
const MWL_URL = process.env.MWL_WRITER_URL || "http://mwl-writer:8000/mwl";

function toYYMMDD(d: Date) {
  const y = String(d.getFullYear()).slice(2);
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}${m}${day}`;
}

// Liveness
app.get("/health", (c) => c.json({ status: "ok", service: "accession-api", timestamp: new Date().toISOString() }));

// Readiness (DB)
app.get("/healthz", async (c) => {
  try {
    await pool.query("SELECT 1");
    return c.json({ status: "ok", service: "accession-api", database: true, timestamp: new Date().toISOString() });
  } catch (e) {
    return c.json({ status: "unhealthy", service: "accession-api", database: false, error: String(e) }, 503);
  }
});

app.get("/internal/verify-accession", async (c) => {
  const an = c.req.query("an") || "";
  const { rows } = await pool.query("select 1 from accessions where accession_number=$1 limit 1", [an]);
  if (rows.length) return c.json({ ok: true });
  return c.json({ ok: false }, 404);
});

// hook dari Orthanc (opsional)
app.post("/api/hooks/missing-acc", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  console.warn("[missing-acc]", body);
  return c.json({ received: true });
});

// Backward-compatible endpoint (expects patient object)
app.post("/api/accessions", async (c) => {
  const p = await c.req.json();
  
  // Validasi data patient wajib sesuai standar SATUSEHAT
  if (!p.patient) {
    return c.json({ error: errorMessages.patientRequired }, 400);
  }

  // Validasi NIK (patient.id) - dapat dinonaktifkan via config
  if (config.enableNikValidation) {
    if (!p.patient.id || typeof p.patient.id !== "string" || p.patient.id.trim() === "") {
      return c.json({ error: errorMessages.nikRequired }, 400);
    }
    
    if (!config.nikPattern.test(p.patient.id)) {
      return c.json({ error: errorMessages.nikInvalid }, 400);
    }
  }

  // Validasi nama patient - wajib
  if (!p.patient.name || typeof p.patient.name !== "string" || p.patient.name.trim() === "") {
    return c.json({ error: errorMessages.nameRequired }, 400);
  }

  // Validasi IHS Number - dapat dinonaktifkan via config
  if (config.enableIhsValidation) {
    if (!p.patient.ihs_number || typeof p.patient.ihs_number !== "string" || p.patient.ihs_number.trim() === "") {
      return c.json({ error: errorMessages.ihsRequired }, 400);
    }
    
    if (!config.ihsPattern.test(p.patient.ihs_number)) {
      return c.json({ error: errorMessages.ihsInvalid }, 400);
    }
  }

  // Validasi birthDate - dapat dinonaktifkan via config
  const birthDateValue = p.patient.birthDate || p.patient.birth_date;
  if (config.enableBirthDateValidation && birthDateValue) {
    if (!config.birthDatePattern.test(birthDateValue)) {
      return c.json({ error: errorMessages.birthDateInvalid }, 400);
    }
    
    const birthDate = new Date(birthDateValue);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (birthDate > today) {
      return c.json({ error: errorMessages.birthDateFuture }, 400);
    }
  }

  // Validasi medical_record_number - dapat dinonaktifkan via config
  if (config.enableMrnValidation) {
    const mrn = p.patient.medical_record_number;
    const isMrnEmpty = !mrn || (typeof mrn === "string" && mrn.trim() === "");
    
    if (config.mrnRequired && isMrnEmpty) {
      return c.json({ error: errorMessages.mrnRequired }, 400);
    }
    
    if (!isMrnEmpty) {
      if (typeof mrn !== "string") {
        return c.json({ error: "Medical Record Number harus berupa string" }, 400);
      }
      
      const trimmedMrn = mrn.trim();
      if (trimmedMrn === "") {
        return c.json({ error: "Medical Record Number tidak boleh kosong jika diisi" }, 400);
      }
      
      if (!config.mrnPattern.test(trimmedMrn)) {
        return c.json({ error: errorMessages.mrnInvalid }, 400);
      }
      
      if (trimmedMrn.length < config.mrnMinLength || trimmedMrn.length > config.mrnMaxLength) {
        return c.json({ error: errorMessages.mrnLength.replace("{min}", config.mrnMinLength.toString()).replace("{max}", config.mrnMaxLength.toString()) }, 400);
      }
    }
  }

  // Validasi sex - dapat dinonaktifkan via config
  if (config.enableSexValidation && p.patient.sex) {
    if (!config.validSexValues.includes(p.patient.sex)) {
      return c.json({ error: errorMessages.sexInvalid.replace("{validValues}", config.validSexValues.join(", ")) }, 400);
    }
  }

  // Validasi modality - wajib dan harus valid
  if (!p.modality || p.modality.trim() === "") {
    return c.json({ error: errorMessages.modalityRequired }, 400);
  }

  const modality = p.modality.toUpperCase();
  if (!config.validModalities.includes(modality)) {
    return c.json({ error: errorMessages.modalityInvalid.replace("{validModalities}", config.validModalities.join(", ")) }, 400);
  }

  const procedure_code = p.procedure_code || null;
  const scheduled_at = p.scheduled_at || null; // ISO
  const payload = {
    patient_national_id: p.patient.id.trim(),
    patient_name: p.patient.name.trim(),
    gender: p.patient.sex ? p.patient.sex.toLowerCase() : null,
    birth_date: p.patient.birthDate || p.patient.birth_date || null,
    medical_record_number: p.patient.medical_record_number ? p.patient.medical_record_number.trim() : null,
    ihs_number: config.enableIhsValidation && p.patient.ihs_number ? p.patient.ihs_number.trim() : (p.patient.ihs_number || null),
    procedure_code,
    scheduled_at
  };
  const now = new Date();
  const yymmdd = toYYMMDD(now);

  if (scheduled_at) {
    const scheduledDate = new Date(scheduled_at);
    if (isNaN(scheduledDate.getTime())) {
      return c.json({ error: errorMessages.scheduledAtInvalid }, 400);
    }
  }

  const dateString = `${now.getFullYear()}-${(now.getMonth()+1+"").padStart(2,"0")}-${(now.getDate()+"").padStart(2,"0")}`;
  const { id: accessionId, accession_number: an, issuer } = await generateAndInsertAccession(
    FACILITY,
    modality,
    dateString,
    yymmdd,
    config.sequencePadding,
    ISSUER,
    payload
  );

  // (opsional) generate MWL file
  if (process.env.ENABLE_MWL === "true") {
    try {
      await fetch(MWL_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          accession_number: an,
          issuer,
          modality,
          description: p.note || "",
          scheduled_at: scheduled_at || new Date().toISOString(),
          station_aet: p.station_aet || config.defaultStationAet,
          procedure_id: p.procedure_id || an,
          patient: {
            id: payload.patient_national_id || "UNKNOWN",
            ihs_number: payload.ihs_number || (config.enableIhsValidation ? "UNKNOWN" : null),
            name: payload.patient_name || "UNKNOWN",
            birthDate: payload.birth_date || null,
            sex: payload.gender || null,
            medical_record_number: payload.medical_record_number || null
          }
        })
      });
    } catch (e) {
      console.warn("MWL writer error:", String(e));
    }
  }

  const response: any = { 
    id: accessionId,
    accession_number: an, 
    facility: {
      code: FACILITY,
      name: config.facilityName
    }
  };
  
  if (config.includeIssuerInResponse) {
    response.issuer = issuer;
  }
  
  return c.json(response);
});

// Unified SIMRS payload endpoint
app.post("/accession/create", async (c) => {
  const p = await c.req.json();

  // Required fields minimal
  const required = [
    "modality",
    "patient_national_id",
    "patient_name",
    "gender",
    "birth_date"
  ];
  const missing = required.filter((k) => !p[k] || String(p[k]).trim() === "");
  if (missing.length) {
    return c.json({ error: `Missing required fields: ${missing.join(", ")}` }, 400);
  }

  // Validate patterns
  if (config.enableNikValidation && !config.nikPattern.test(String(p.patient_national_id))) {
    return c.json({ error: errorMessages.nikInvalid }, 400);
  }
  if (config.enableBirthDateValidation && !config.birthDatePattern.test(String(p.birth_date))) {
    return c.json({ error: errorMessages.birthDateInvalid }, 400);
  }
  if (config.enableSexValidation && !config.validSexValues.includes(String(p.gender))) {
    return c.json({ error: errorMessages.sexInvalid.replace("{validValues}", config.validSexValues.join(", ")) }, 400);
  }

  const modality = String(p.modality).toUpperCase();
  if (!config.validModalities.includes(modality)) {
    return c.json({ error: errorMessages.modalityInvalid.replace("{validModalities}", config.validModalities.join(", ")) }, 400);
  }

  const now = new Date();
  const yymmdd = toYYMMDD(now);
  const dateString = `${now.getFullYear()}-${(now.getMonth()+1+"").padStart(2,"0")}-${(now.getDate()+"").padStart(2,"0")}`;

  const payload = {
    procedure_code: p.procedure_code,
    procedure_name: p.procedure_name,
    scheduled_at: p.scheduled_at,
    patient_national_id: String(p.patient_national_id).trim(),
    patient_name: String(p.patient_name).trim(),
    gender: String(p.gender).toLowerCase(),
    birth_date: p.birth_date,
    medical_record_number: p.medical_record_number,
    ihs_number: p.ihs_number,
    registration_number: p.registration_number
  };

  const { id: accessionId, accession_number: an, issuer } = await generateAndInsertAccession(
    FACILITY,
    modality,
    dateString,
    yymmdd,
    config.sequencePadding,
    ISSUER,
    payload
  );

  const response: any = {
    id: accessionId,
    accession_number: an,
    issuer: config.includeIssuerInResponse ? issuer : undefined
  };
  return c.json(response, 201);
});

app.get("/api/accessions/:an", async (c) => {
  const an = c.req.param("an");
  const { rows } = await pool.query("select * from accessions where accession_number=$1", [an]);
  if (!rows.length) return c.json({ error: "not found" }, 404);
  return c.json(rows[0]);
});

// New endpoint to get accession by UUID
app.get("/api/accessions/id/:id", async (c) => {
  const id = c.req.param("id");
  
  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    return c.json({ error: "Invalid UUID format" }, 400);
  }
  
  const { rows } = await pool.query("select * from accessions where id=$1", [id]);
  if (!rows.length) return c.json({ error: "not found" }, 404);
  return c.json(rows[0]);
});

await initDb();

export default {
  port: Number(process.env.PORT || 8180),
  fetch: app.fetch,
};
