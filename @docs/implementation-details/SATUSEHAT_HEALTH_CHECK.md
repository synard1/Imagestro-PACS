# SatuSehat Health Check Implementation

## Overview

This document describes the implementation of the specialized health check for SatuSehat integration. Unlike other backend modules, SatuSehat requires OAuth2 authentication before performing health checks.

## Implementation Details

### Special Health Check Logic

The [useBackendHealth](file:///e:/Project/docker/mwl-pacs-ui/src/hooks/useBackend.js#L4-L77) hook in [src/hooks/useBackend.js](file:///e:/Project/docker/mwl-pacs-ui/src/hooks/useBackend.js) has been modified to handle SatuSehat's special requirements:

1. **Token Generation**: Before performing any health check, the system first generates an OAuth2 token using the client credentials flow.
2. **Health Check**: Once a token is obtained, the system performs a health check by querying the Organization endpoint.
3. **Status Reporting**: The health status includes response time and error details when applicable.

### Configuration

The SatuSehat module configuration in [src/services/api-registry.js](file:///e:/Project/docker/mwl-pacs-ui/src/services/api-registry.js) includes the following fields required for health checks:

- `enabled`: Whether the integration is enabled
- `env`: Environment ('sandbox' or 'production')
- `clientId`: OAuth2 client ID
- `clientSecret`: OAuth2 client secret
- `organizationId`: Organization ID for health check
- `tokenEndpoint`: OAuth2 token endpoint URL
- `restApiUrl`: Base URL for the REST API (optional)

### Health Check Flow

1. Check if SatuSehat integration is enabled
2. Generate OAuth2 token using client credentials flow
3. Use the token to query the Organization endpoint
4. Report health status with response time or error details

### Error Handling

The implementation handles various error scenarios:

- Network timeouts
- Authentication failures
- Invalid token responses
- API errors during health check

## Settings UI

The Settings page includes a specialized UI for configuring and testing SatuSehat integration:

- OAuth2 configuration fields
- Test Connection button that performs a full authentication and health check
- Token information display showing token status and expiration

## Testing

A test file [src/services/satusehatHealthCheck.test.js](file:///e:/Project/docker/mwl-pacs-ui/src/services/satusehatHealthCheck.test.js) is included to verify the health check implementation.