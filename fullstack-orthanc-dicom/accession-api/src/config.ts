// Configuration file for Accession API
// All configurable values and validation settings

export interface ValidationConfig {
  // Feature toggles
  enableIhsValidation: boolean;
  enableNikValidation: boolean;
  enableBirthDateValidation: boolean;
  enableMrnValidation: boolean;
  enableSexValidation: boolean;
  
  // Required field toggles
  mrnRequired: boolean;
  
  // Validation patterns
  nikPattern: RegExp;
  ihsPattern: RegExp;
  birthDatePattern: RegExp;
  mrnPattern: RegExp;
  
  // Valid values
  validModalities: string[];
  validSexValues: string[];
  
  // Length constraints
  mrnMinLength: number;
  mrnMaxLength: number;
  
  // Sequence formatting
  sequencePadding: number;
  
  // Default values
  defaultStationAet: string;
  defaultStatus: string;
  
  // Facility configuration
  facilityName: string;
  
  // Response configuration
  includeIssuerInResponse: boolean;
}

export interface ErrorMessages {
  patientRequired: string;
  nikRequired: string;
  nikInvalid: string;
  nameRequired: string;
  ihsRequired: string;
  ihsInvalid: string;
  birthDateInvalid: string;
  birthDateFuture: string;
  mrnRequired: string;
  mrnInvalid: string;
  mrnLength: string;
  sexInvalid: string;
  modalityRequired: string;
  modalityInvalid: string;
  scheduledAtInvalid: string;
}

// Load configuration from environment variables
export function loadConfig(): ValidationConfig {
  return {
    // Feature toggles
    enableIhsValidation: process.env.ENABLE_IHS_VALIDATION !== "false", // default: true
    enableNikValidation: process.env.ENABLE_NIK_VALIDATION !== "false", // default: true
    enableBirthDateValidation: process.env.ENABLE_BIRTHDATE_VALIDATION !== "false", // default: true
    enableMrnValidation: process.env.ENABLE_MRN_VALIDATION !== "false", // default: true
    enableSexValidation: process.env.ENABLE_SEX_VALIDATION !== "false", // default: true
    
    // Required field toggles
    mrnRequired: process.env.MRN_REQUIRED === "true", // default: false
    
    // Validation patterns
    nikPattern: new RegExp(process.env.NIK_PATTERN || "^\\d{16}$"),
    ihsPattern: new RegExp(process.env.IHS_PATTERN || "^P\\d{11}$"),
    birthDatePattern: new RegExp(process.env.BIRTHDATE_PATTERN || "^\\d{4}-\\d{2}-\\d{2}$"),
    mrnPattern: new RegExp(process.env.MRN_PATTERN || "^[a-zA-Z0-9\\-_]+$"),
    
    // Valid values
    validModalities: (process.env.VALID_MODALITIES || "CT,MR,CR,DX,US,XA,RF,MG,NM,PT").split(","),
    validSexValues: (process.env.VALID_SEX_VALUES || "male,female,other,unknown").split(","),
    
    // Length constraints
    mrnMinLength: parseInt(process.env.MRN_MIN_LENGTH || "1"),
    mrnMaxLength: parseInt(process.env.MRN_MAX_LENGTH || "50"),
    
    // Sequence formatting
    sequencePadding: parseInt(process.env.SEQUENCE_PADDING || "6"),
    
    // Default values
    defaultStationAet: process.env.DEFAULT_STATION_AET || "ORTHANC",
    defaultStatus: process.env.DEFAULT_ACCESSION_STATUS || "issued",
    
    // Facility configuration
    facilityName: process.env.FACILITY_NAME || "Default Healthcare Facility",
    
    // Response configuration
    includeIssuerInResponse: process.env.INCLUDE_ISSUER_IN_RESPONSE !== "false" // default: true
  };
}

// Load error messages from environment variables
export function loadErrorMessages(): ErrorMessages {
  return {
    patientRequired: process.env.ERROR_PATIENT_REQUIRED || "Field 'patient' wajib diisi sesuai standar SATUSEHAT",
    nikRequired: process.env.ERROR_NIK_REQUIRED || "Field 'patient.id' (NIK) wajib diisi dan tidak boleh kosong",
    nikInvalid: process.env.ERROR_NIK_INVALID || "NIK harus berupa 16 digit angka",
    nameRequired: process.env.ERROR_NAME_REQUIRED || "Field 'patient.name' wajib diisi dan tidak boleh kosong",
    ihsRequired: process.env.ERROR_IHS_REQUIRED || "Field 'patient.ihs_number' wajib diisi sesuai standar SATUSEHAT",
    ihsInvalid: process.env.ERROR_IHS_INVALID || "IHS Number harus berformat P diikuti 11 digit angka (contoh: P02478375538)",
    birthDateInvalid: process.env.ERROR_BIRTHDATE_INVALID || "Field 'birthDate' harus dalam format YYYY-MM-DD (contoh: 1990-01-15)",
    birthDateFuture: process.env.ERROR_BIRTHDATE_FUTURE || "Tanggal lahir tidak boleh di masa depan",
    mrnRequired: process.env.ERROR_MRN_REQUIRED || "Field 'patient.medical_record_number' wajib diisi dan tidak boleh kosong",
    mrnInvalid: process.env.ERROR_MRN_INVALID || "Medical Record Number hanya boleh berisi huruf, angka, tanda hubung (-), dan underscore (_)",
    mrnLength: process.env.ERROR_MRN_LENGTH || "Medical Record Number harus antara {min}-{max} karakter",
    sexInvalid: process.env.ERROR_SEX_INVALID || "Sex harus salah satu dari: {validValues}",
    modalityRequired: process.env.ERROR_MODALITY_REQUIRED || "Field 'modality' wajib diisi (contoh: CT, MR, CR, DX, US)",
    modalityInvalid: process.env.ERROR_MODALITY_INVALID || "Modality harus salah satu dari: {validModalities}",
    scheduledAtInvalid: process.env.ERROR_SCHEDULED_AT_INVALID || "Field 'scheduled_at' harus dalam format ISO 8601 (contoh: 2024-01-20T10:30:00Z)"
  };
}

// Global configuration instances
export const config = loadConfig();
export const errorMessages = loadErrorMessages();