/**
 * Shared type definitions for api-gateway-v2.
 */

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
  
  // Bindings
  API_CACHE: KVNamespace;
  THUMBNAIL_CACHE_R2: R2Bucket;
  BACKBONE: Fetcher;
  
  // Service Bindings
  ACCESSION_WORKER: Fetcher;
  MASTER_DATA_WORKER: Fetcher;
  AUTH_WORKER: Fetcher;
  
  // Durable Objects
  HEALTH_DO: DurableObjectNamespace<import("./objects/InfrastructureHealthDO").InfrastructureHealthDO>;
  THUMBNAIL_DO: DurableObjectNamespace<import("./objects/ThumbnailGeneratorDO").ThumbnailGeneratorDO>;
  
  // Rate Limiter
  HEALTH_RATE_LIMITER: { limit: (options: { key: string }) => Promise<{ success: boolean }> };
};

export type AppContext = {
  Bindings: Bindings;
};

export interface AuthPayload {
  tenant_id: string | null;
  role: string | null;
  username: string | null;
}
