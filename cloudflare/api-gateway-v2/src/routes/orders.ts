/**
 * Order Worker routes.
 * Routes /orders/* to order-worker via Service Binding
 * (when ROUTE_ORDERS_TO_WORKER=true)
 * or falls back to Flask ORDER_SERVICE_URL via BACKBONE.
 */

import { Hono } from 'hono';
import type { AppContext } from '../types';
import { dispatchToWorker, proxyRequest } from '../services/proxy';

export const orderRoutes = new Hono<AppContext>();

/** Dispatch to order-worker or legacy Flask based on feature flag */
async function dispatchOrders(c: any): Promise<Response> {
  const url = new URL(c.req.url);
  const targetPath = url.pathname + url.search;

  if (c.env.ROUTE_ORDERS_TO_WORKER !== 'true') {
    return proxyRequest(
      c, c.env.ORDER_SERVICE_URL,
      c.req.path.replace(/^\/api/, '').replace(/^\/v1/, ''),
      {}, 'order-management'
    );
  }

  return dispatchToWorker(c, c.env.ORDER_WORKER, 'order-worker', targetPath, { hmac: true });
}

// Register order routes
orderRoutes.all('/orders', dispatchOrders);
orderRoutes.all('/orders/*', dispatchOrders);
