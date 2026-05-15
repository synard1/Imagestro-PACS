/**
 * Master Data Worker routes.
 * Routes /patients, /doctors, /procedures, etc. to master-data-worker
 * via Service Binding (when ROUTE_MASTER_TO_WORKER=true)
 * or falls back to Flask MASTER_DATA_SERVICE_URL via BACKBONE.
 */

import { Hono } from 'hono';
import type { AppContext } from '../types';
import { dispatchToWorker, proxyRequest } from '../services/proxy';

export const masterDataRoutes = new Hono<AppContext>();

/** Dispatch to master-data-worker or Flask based on feature flag */
async function dispatchMasterData(c: any): Promise<Response> {
  const url = new URL(c.req.url);
  const targetPath = url.pathname + url.search;

  if (c.env.ROUTE_MASTER_TO_WORKER !== 'true') {
    return proxyRequest(
      c, c.env.MASTER_DATA_SERVICE_URL,
      c.req.path.replace(/^\/api/, '').replace(/^\/v1/, ''),
      {}, 'master-data-flask'
    );
  }

  return dispatchToWorker(c, c.env.MASTER_DATA_WORKER, 'master-data-worker', targetPath, { hmac: true });
}

// Register all master-data module routes
const modules = [
  'patients', 'doctors', 'procedures', 'procedure-mappings',
  'settings', 'nurses', 'modalities', 'external-systems',
];

modules.forEach(mod => {
  masterDataRoutes.all(`/${mod}`, dispatchMasterData);
  masterDataRoutes.all(`/${mod}/*`, dispatchMasterData);
});
