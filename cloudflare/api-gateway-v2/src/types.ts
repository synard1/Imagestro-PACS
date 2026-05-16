/**
 * Shared type definitions for api-gateway-v2.
 */

import type { D1Logger } from '../../shared/logger';

export type Bindings = {
  JWT_SECRET: string;
  JWT_ALGORITHM: string;
  KHANZA_INTERNAL_KEY: string;
  KHANZA_API_URL: string;
  AUTH_SERVICE_URL: string;
  PACS_SERVICE_URL: string;
  MASTER_DATA_SERVICE_URL: string;
  ORDER_SERVICE_URL: string;
  MWL_SERVICE_URL: string;
  SIMRS_UNIVERSAL_URL: string;
  SATUSEHAT_INTEGRATOR_URL: string;
  ALLOWED_ORIGINS: string;
  
  // Feature flags
  THUMBNAIL_CACHE_ENABLED: string;
  
  // Bindings
  API_CACHE: KVNamespace;
  IMAGE_CACHE_R2: R2Bucket;
  BACKBONE: Fetcher;
  
  // Service Bindings
  ACCESSION_WORKER: Fetcher;
  MASTER_DATA_WORKER: Fetcher;
  AUTH_WORKER: Fetcher;
  
  // Durable Objects
  HEALTH_DO: DurableObjectNamespace<import("./objects/InfrastructureHealthDO").InfrastructureHealthSQLite>;
  THUMBNAIL_DO: DurableObjectNamespace<import("./objects/ThumbnailGeneratorDO").ThumbnailGeneratorSQLite>;
  
  // Rate Limiter
  HEALTH_RATE_LIMITER: { limit: (options: { key: string }) => Promise<{ success: boolean }> };
  
  // Centralized D1 Logging
  LOG_DB: D1Database | null;
  LOG_LEVEL: string;
  LOG_SAMPLE_RATE: string;
  LOG_BATCH_SIZE: string;
  LOG_FLUSH_INTERVAL_MS: string;
  LOG_DUAL_WRITE: string;
  ALERT_WEBHOOK_URLS?: string;
};

export type AppContext = {
  Bindings: Bindings;
  Variables: {
    logger: D1Logger;
    requestId?: string;
  };
};

export interface AuthPayload {
  tenant_id: string | null;
  role: string | null;
  username: string | null;
}
