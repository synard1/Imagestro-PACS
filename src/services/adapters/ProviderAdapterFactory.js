/**
 * Provider Adapter Factory
 * 
 * Factory pattern implementation for creating provider-specific adapters.
 * Supports multiple SIMRS providers (Khanza, GOS, Generic) with a unified interface.
 * 
 * Requirements: 11.1, 11.2
 */

import { logger } from '../../utils/logger';
import KhanzaAdapter from './KhanzaAdapter';
import GenericAdapter from './GenericAdapter';

/**
 * Get appropriate provider adapter based on provider type
 * @param {Object} externalSystem - External system configuration
 * @param {string} externalSystem.provider - Provider type (khanza, gos, generic)
 * @param {Object} externalSystem.connection - Connection settings
 * @returns {ProviderAdapter} Appropriate adapter instance
 * @throws {Error} If provider is not supported
 */
export const getAdapter = (externalSystem) => {
  if (!externalSystem) {
    throw new Error('External system configuration is required');
  }

  const provider = (externalSystem.provider || 'generic').toLowerCase();

  logger.debug('[ProviderAdapterFactory]', `Creating adapter for provider: ${provider}`);

  switch (provider) {
    case 'khanza':
      return new KhanzaAdapter(externalSystem.connection);

    case 'gos':
      // GOS adapter - currently uses generic adapter with GOS-specific config
      return new GenericAdapter(externalSystem.connection, externalSystem.fieldMappings);

    case 'generic':
    default:
      return new GenericAdapter(externalSystem.connection, externalSystem.fieldMappings);
  }
};

/**
 * Get list of supported providers
 * @returns {Array<string>} List of supported provider names
 */
export const getSupportedProviders = () => {
  return ['khanza', 'gos', 'generic'];
};

/**
 * Check if provider is supported
 * @param {string} provider - Provider name
 * @returns {boolean} True if provider is supported
 */
export const isSupportedProvider = (provider) => {
  return getSupportedProviders().includes((provider || '').toLowerCase());
};

/**
 * Get provider capabilities
 * @param {string} provider - Provider name
 * @returns {Object} Provider capabilities
 */
export const getProviderCapabilities = (provider) => {
  const normalizedProvider = (provider || 'generic').toLowerCase();

  const capabilities = {
    khanza: {
      hasOrderBrowser: true,
      hasPatientLookup: true,
      hasProcedureSearch: true,
      hasDoctorLookup: true,
      supportsImport: true,
      supportsBulkImport: true,
      supportsFieldMapping: false, // Khanza has fixed field mapping
      supportsCustomEndpoints: false,
    },
    gos: {
      hasOrderBrowser: true,
      hasPatientLookup: true,
      hasProcedureSearch: true,
      hasDoctorLookup: true,
      supportsImport: true,
      supportsBulkImport: true,
      supportsFieldMapping: true,
      supportsCustomEndpoints: true,
    },
    generic: {
      hasOrderBrowser: true,
      hasPatientLookup: true,
      hasProcedureSearch: true,
      hasDoctorLookup: true,
      supportsImport: true,
      supportsBulkImport: true,
      supportsFieldMapping: true,
      supportsCustomEndpoints: true,
    },
  };

  return capabilities[normalizedProvider] || capabilities.generic;
};

export default {
  getAdapter,
  getSupportedProviders,
  isSupportedProvider,
  getProviderCapabilities,
};
