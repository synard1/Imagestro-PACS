/**
 * Application Constants and Configuration
 *
 * This file contains all the constants, configuration values, and settings
 * used throughout the application. Centralizing these values makes the
 * application easier to maintain and configure.
 *
 * @version 1.0.0
 * @author SIMRS Order UI Team
 */

export const APP_CONFIG = {
  // API Configuration
  API: {
    DEFAULT_GATEWAY_BASE: "http://103.42.117.19:8888", // API Gateway URL
    TIMEOUT: 10000, // 10 seconds
    RETRY_ATTEMPTS: 3,
    RETRY_DELAY: 1000, // 1 second base delay for exponential backoff
  },

  // Authentication
  AUTH: {
    TOKEN_KEY: "simrs_auth_token",
    TOKEN_REFRESH_THRESHOLD: 300000, // 5 minutes before expiry
  },

  // Cache Configuration
  CACHE: {
    LOCATIONS_KEY: "satusehat_locations",
    LOCATIONS_META_KEY: "satusehat_locations_meta",
    SUGGESTIONS_MAX: 10,
    CACHE_VERSION: "1.0",
  },

  // UI Configuration
  UI: {
    TOAST_DURATION: 3000, // 3 seconds
    MODAL_ANIMATION_DURATION: 300,
    DEBOUNCE_DELAY: 300,
  },

  // Registration Configuration
  REGISTRATION: {
    SEQUENCE_KEY_PREFIX: "reg_seq_",
    SEQUENCE_PADDING: 4,
    DEFAULT_SERVICE_TYPE: "RJ",
    H_MINUS_7_OFFSET_HOURS: 1,
  },

  // Date and Time
  DATE_TIME: {
    ISO_FORMAT: "YYYY-MM-DDTHH:mm:ss.sssZ",
    LOCAL_DATETIME_FORMAT: "YYYY-MM-DDTHH:mm",
    DATE_FORMAT: "YYYY-MM-DD",
    H_MINUS_7_DAYS: 7,
  },

  // HTTP Status Codes
  HTTP_STATUS: {
    OK: 200,
    CREATED: 201,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    INTERNAL_SERVER_ERROR: 500,
    SERVICE_UNAVAILABLE: 503,
  },

  // Toast Types
  TOAST_TYPES: {
    INFO: "info",
    SUCCESS: "success",
    ERROR: "error",
    WARNING: "warning",
  },

  // Service Types
  SERVICE_TYPES: {
    RAWAT_JALAN: "RJ",
    RAWAT_INAP: "RI",
    IGD: "IGD",
  },

  // Gender Options
  GENDER: {
    MALE: "male",
    FEMALE: "female",
  },

  // API Endpoints
  ENDPOINTS: {
    AUTH: {
      LOGIN: "/api/auth/login",
      VERIFY: "/api/auth/verify",
    },
    CONFIG: "/config",
    ORDERS: {
      CREATE: "/orders/create",
      COMPLETE_FLOW: "/orders/complete-flow",
      SIM_ORDERS: "/sim/orders",
      SERVICE_REQUEST: "/sim/orders/{order_id}/service-request",
    },
    SATUSEHAT: {
      LOCATION: "/satusehat/location",
      ENCOUNTER: "/satusehat/encounter",
      SERVICE_REQUEST: "/satusehat/service-request",
    },
    STATIC: {
      PATIENTS: "/static/data/patients.json",
      PRACTITIONERS: "/static/data/practitioners.json",
      PROCEDURES: "/static/data/procedures.json",
      LOINC_LABELS: "/static/data/loinc-labels.json",
    },
  },

  // Error Messages
  ERROR_MESSAGES: {
    NETWORK_ERROR: "Terjadi kesalahan jaringan. Silakan coba lagi.",
    AUTH_EXPIRED: "Sesi login telah berakhir. Silakan login ulang.",
    VALIDATION_ERROR: "Data yang dimasukkan tidak valid.",
    SERVER_ERROR: "Terjadi kesalahan server. Silakan coba lagi nanti.",
    CACHE_ERROR: "Gagal memuat data dari cache.",
    UNKNOWN_ERROR: "Terjadi kesalahan yang tidak diketahui.",
    INITIALIZATION_FAILED:
      "Gagal menginisialisasi aplikasi. Silakan refresh halaman.",
  },

  // Success Messages
  SUCCESS_MESSAGES: {
    LOGIN_SUCCESS: "Login berhasil",
    LOGOUT_SUCCESS: "Logout berhasil",
    ORDER_SUBMITTED: "Order berhasil dikirim",
    DATA_SAVED: "Data berhasil disimpan",
    CACHE_UPDATED: "Data berhasil diperbarui",
    INITIALIZATION_COMPLETE: "Aplikasi berhasil diinisialisasi",
  },

  // Validation Rules
  VALIDATION: {
    REQUIRED_FIELDS: [
      "patient_national_id",
      "patient_name",
      "sex",
      "birth_date",
      "modality",
      "procedure_code",
      "scheduled_at",
    ],
    NIK_LENGTH: 16,
    MRN_MIN_LENGTH: 3,
    NAME_MIN_LENGTH: 2,
  },
};

// Freeze the configuration to prevent accidental modifications
Object.freeze(APP_CONFIG);

// Named exports for convenience
export const API_ENDPOINTS = APP_CONFIG.ENDPOINTS;
export const MESSAGES = {
  ERROR: {
    ...APP_CONFIG.ERROR_MESSAGES,
    LOGIN_FIELDS_REQUIRED: "Username dan password harus diisi",
    LOGIN_FAILED: "Login gagal. Periksa username dan password Anda",
  },
  SUCCESS: {
    ...APP_CONFIG.SUCCESS_MESSAGES,
  },
};

export default APP_CONFIG;
