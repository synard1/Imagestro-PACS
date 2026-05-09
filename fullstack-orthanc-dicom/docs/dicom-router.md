# DICOM Router

Lightweight wrapper that cleans the incoming directory at startup and delegates to the main router application. Typically exposes DICOM ports and may optionally serve a health endpoint.

- Container name: `dicom-router`
- DICOM listen port: `11112` (C-STORE)
- Internal HTTP API: none detected locally
- Startup script: `patched_main.py` clears `/app/in/*` then runs main module

## Behavior
- On container start, removes residual files under `/app/in` to ensure clean state.
- Forwards incoming DICOM associations to the configured processing pipeline.

## Integration
- Receives C-STORE from Modality Simulator or external devices.
- For MWL, Orthanc typically handles C-FIND; Router is focused on C-STORE ingest.

## Notes
- No local REST endpoints found; management is via DICOM association and container health.
- Verify compose mappings for port `11112` exposure and volume mounts for `/app/in`.