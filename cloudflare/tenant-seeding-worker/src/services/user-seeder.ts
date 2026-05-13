/**
 * User seeder service for the Tenant Seeding Worker.
 *
 * Generates and creates default users for a new tenant by calling
 * the auth-service API sequentially. Handles 409 as success, retries
 * on 5xx/timeout, and skips retry for other 4xx errors.
 *
 * Requirements: 3.1, 3.3, 3.4, 3.6, 5.1, 5.2, 5.5, 5.6, 9.1
 */

import type { AuthClient, CreateUserPayload } from './auth-client';
import { generatePassword } from './password-generator';
import { withRetry } from '../utils/retry';
import {
  DEFAULT_USERS,
  USER_CREATION_RETRY,
  type TenantCreatedEvent,
  type ErrorEntry,
} from '../types';

/** Result of a complete seeding operation */
export interface SeedingResult {
  users_created: number;
  users_failed: number;
  error_details: ErrorEntry[];
}

export class UserSeeder {
  private authClient: AuthClient;
  private event: TenantCreatedEvent;

  constructor(authClient: AuthClient, event: TenantCreatedEvent) {
    this.authClient = authClient;
    this.event = event;
  }

  /**
   * Seeds all default users for the tenant sequentially.
   * Returns counts of created/failed users and error details.
   */
  async seedUsers(): Promise<SeedingResult> {
    let users_created = 0;
    let users_failed = 0;
    const error_details: ErrorEntry[] = [];

    const tenantCodeLower = this.event.tenant_code.toLowerCase();

    for (const userDef of DEFAULT_USERS) {
      const username = `${userDef.usernamePrefix}.${tenantCodeLower}`;
      const email = `${userDef.emailPrefix}@${tenantCodeLower}.local`;
      const full_name = `${userDef.fullNamePrefix} ${this.event.tenant_name}`;
      const password = generatePassword();

      const payload: CreateUserPayload = {
        username,
        email,
        password,
        full_name,
        role: userDef.role,
        is_active: true,
        tenant_id: this.event.tenant_id,
      };

      const startTime = Date.now();

      try {
        const response = await withRetry(
          () => this.authClient.createUser(payload),
          USER_CREATION_RETRY
        );

        const responseTimeMs = Date.now() - startTime;

        if (response.status === 201 || response.status === 409) {
          // Success: user created or already exists
          users_created++;
          console.log(
            JSON.stringify({
              tenant_id: this.event.tenant_id,
              username,
              role: userDef.role,
              status: 'success',
              response_time_ms: responseTimeMs,
            })
          );
        } else {
          // Non-retryable failure (4xx other than 409) or exhausted retries (5xx)
          users_failed++;
          const errorBody = await response.text().catch(() => '');
          const errorDetail = `HTTP ${response.status}: ${errorBody}`.slice(0, 500);

          error_details.push({
            username,
            role: userDef.role,
            error: errorDetail,
            timestamp: new Date().toISOString(),
          });

          console.error(
            JSON.stringify({
              tenant_id: this.event.tenant_id,
              username,
              role: userDef.role,
              status: 'failure',
              response_time_ms: responseTimeMs,
              error_detail: errorDetail,
            })
          );
        }
      } catch (error) {
        // Network error or timeout after all retries exhausted
        const responseTimeMs = Date.now() - startTime;
        users_failed++;

        const errorDetail = (
          error instanceof Error ? error.message : String(error)
        ).slice(0, 500);

        error_details.push({
          username,
          role: userDef.role,
          error: errorDetail,
          timestamp: new Date().toISOString(),
        });

        console.error(
          JSON.stringify({
            tenant_id: this.event.tenant_id,
            username,
            role: userDef.role,
            status: 'failure',
            response_time_ms: responseTimeMs,
            error_detail: errorDetail,
          })
        );
      }
    }

    return { users_created, users_failed, error_details };
  }
}
