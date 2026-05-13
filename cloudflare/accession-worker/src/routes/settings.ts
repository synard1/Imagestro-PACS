/**
 * Settings routes — GET/PUT /settings/accession_config
 *
 * Requirements: 2.1, 2.7, 2.8, 2.9, 2.10, 2.11, 2.12, 2.13, 3A.1
 */

import { Hono } from 'hono';
import type { Env, TenantContext } from '../types';
import { DEFAULT_ACCESSION_CONFIG } from '../models/config';
import type { AccessionConfig } from '../models/config';
import { validateAccessionConfig } from '../validators/format-pattern';
import { ValidationError } from '../errors';

type Variables = { tenant: TenantContext };

const settingsRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

// GET /settings/accession_config
settingsRoutes.get('/settings/accession_config', async (c) => {
  const tenant = c.get('tenant');
  const row = await c.env.DB
    .prepare(`SELECT value FROM tenant_settings WHERE tenant_id = ? AND key = 'accession_config'`)
    .bind(tenant.tenantId)
    .first<{ value: string }>();

  if (!row) {
    return c.json(DEFAULT_ACCESSION_CONFIG, 200);
  }

  try {
    const config = JSON.parse(row.value);
    return c.json({ ...DEFAULT_ACCESSION_CONFIG, ...config }, 200);
  } catch {
    return c.json(DEFAULT_ACCESSION_CONFIG, 200);
  }
});

// PUT /settings/accession_config
settingsRoutes.put('/settings/accession_config', async (c) => {
  const tenant = c.get('tenant');
  const body = await c.req.json();

  // Validate the config
  validateAccessionConfig(body);

  // Check sequence_digits not too small for existing counters
  if (body.sequence_digits) {
    const maxValue = Math.pow(10, body.sequence_digits) - 1;
    const existingMax = await c.env.DB
      .prepare(`SELECT MAX(current_value) as max_val FROM accession_counters WHERE tenant_id = ?`)
      .bind(tenant.tenantId)
      .first<{ max_val: number | null }>();

    if (existingMax?.max_val && existingMax.max_val > maxValue) {
      throw new ValidationError([{
        field: 'sequence_digits',
        message: `sequence_digits ${body.sequence_digits} is too small for existing counter value ${existingMax.max_val} (max would be ${maxValue})`,
      }]);
    }
  }

  // Upsert the config
  const now = new Date().toISOString();
  const configValue = JSON.stringify({
    pattern: body.pattern,
    counter_reset_policy: body.counter_reset_policy,
    sequence_digits: body.sequence_digits,
    timezone: body.timezone || 'Asia/Jakarta',
    counter_backend: body.counter_backend || 'D1',
    orgCode: body.orgCode,
    siteCode: body.siteCode,
    useModalityInSeqScope: body.useModalityInSeqScope,
  });

  await c.env.DB
    .prepare(`INSERT INTO tenant_settings (tenant_id, key, value, updated_at) VALUES (?, 'accession_config', ?, ?) ON CONFLICT(tenant_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`)
    .bind(tenant.tenantId, configValue, now)
    .run();

  return c.json(JSON.parse(configValue), 200);
});

export { settingsRoutes };
export default settingsRoutes;
