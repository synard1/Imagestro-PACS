# Settings Service Setup Instructions

## Overview

This document explains how to configure and use the new settings service that retrieves settings data from the backend API with a fallback to local settings.

## Configuration

The settings service is configured to connect to the MasterData service through the API Gateway with the following credentials:

- **Gateway Base URL**: http://103.42.117.19:8888
- **Settings Permission**: setting:read (id=39ac100c-370b-4fc7-83f8-d2a4321b98fb)
- **Settings Role (DB)**: SETTINGS_CLIENT (id=b9c4ca41-e4c0-48e4-9004-840b9395e532)
- **Base Role (legacy)**: VIEWER
- **Settings User**: ui-settings
- **Settings User Email**: ui-settings@system.local
- **Settings User Password**: UiSettings!2025

## How It Works

The settings service follows this priority order:

1. **Backend API**: First attempts to retrieve settings from the backend API through the gateway
2. **Local Storage**: If the backend is unavailable, falls back to local settings stored in browser localStorage
3. **Default Values**: If no local settings exist, uses built-in default values

## Authentication

To access the backend settings service, the system will authenticate using the provided credentials. The authentication process:

1. Makes a POST request to the gateway's login endpoint
2. Receives an access token for subsequent requests
3. Uses the token in the Authorization header for settings requests

## Usage

The settings service is automatically integrated into the application through:

- `getSettings()` - Retrieves settings with backend fallback
- `updateSettings(settings)` - Updates settings in backend with local fallback
- `getLocalSettings()` - Retrieves settings from localStorage
- `saveLocalSettings(settings)` - Saves settings to localStorage

## Testing the Connection

To test if the settings service can connect to the backend:

1. Ensure the gateway is running at http://103.42.117.19:8888
2. Verify the credentials are correctly configured in the settings service
3. Check the browser console for any connection errors
4. Confirm that settings are being retrieved from the backend (rather than local defaults)

## Troubleshooting

If the settings service is not connecting to the backend:

1. **Check Network Connectivity**: Ensure the gateway URL is accessible
2. **Verify Credentials**: Confirm the username and password are correct
3. **Check Permissions**: Ensure the SETTINGS_CLIENT role has the setting:read permission
4. **Review Logs**: Check browser console for detailed error messages
5. **Test Fallback**: Verify that local settings are working as a fallback

## Security Considerations

- Settings credentials are stored in the application code and should be protected
- In production, consider using environment variables or a secure configuration service
- The settings service uses HTTPS when available to protect data in transit
- Access tokens are stored securely and refreshed as needed