/**
 * Accession Worker routes.
 * Routes /accession-api/* to accession-worker via Service Binding.
 */

import { Hono } from 'hono';
import type { AppContext } from '../types';
import { dispatchToWorker, proxyRequest } from '../services/proxy';

export const accessionRoutes = new Hono<AppContext>();

accessionRoutes.all('/accession-api/*', async (c) => {
  const url = new URL(c.req.url);
  const targetPath = url.pathname.replace('/accession-api', '') + url.search;

  if (c.env.ACCESSION_WORKER) {
    return dispatchToWorker(c, c.env.ACCESSION_WORKER, 'accession-worker', targetPath, { hmac: true });
  }

  // Fallback to HTTP URL
  const fallbackUrl = c.env.ACCESSION_WORKER_URL || 'https://accession-worker.satupintudigital.workers.dev';
  return proxyRequest(c, fallbackUrl, targetPath, {}, 'accession-worker');
});
