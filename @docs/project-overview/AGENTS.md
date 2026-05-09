# Repository Guidelines

## Project Structure & Module Organization
- `src/` — Vite React app
  - `pages/` — route views (e.g., `Orders.jsx`, `SatusehatMonitor.jsx`)
  - `components/` — reusable UI and layout
  - `services/` — data APIs, config, health, registry, integrations (e.g., `api.js`, `uploadService.js`, `satusehatMonitorService.js`)
  - `hooks/` — app hooks (auth, health)
- `server-with-upload.js` — local Node/Express backend (CRUD, uploads, monitor, SatuSehat proxy)
- `server/` — optional modular backend routes/services
- `docs/` — documentation

## Build, Test, and Development Commands
- `npm run dev` — start Vite dev server
- `npm run build` — build to `dist/`
- `npm run preview` — serve `dist/`
- `npm run server:upload` — start local data server (uploads + monitor + SatuSehat proxy)

## Coding Style & Naming Conventions
- JavaScript/React (React 18), 2‑space indentation
- Components: PascalCase (`MyComponent.jsx`); services/utils: camelCase (`uploadService.js`)
- Keep data access and side effects in `services/`; keep pages declarative
- Use `services/http.js` (`apiClient`, `fetchJson`) for HTTP

## Testing Guidelines
- Manual checks focus:
  - Orders CRUD and file upload/listing
  - Monitor at `/satusehat-monitor` (rows, statuses, health)
  - Settings → Integration → SatuSehat (token/connection via proxy)
- If adding tests, co‑locate as `*.test.js` and document how to run

## Commit & Pull Request Guidelines
- Commits: concise, imperative, scoped (e.g., `monitor: add /api/monitor/health`)
- PRs: include description, linked issues, steps to reproduce, and screenshots for UI
- Keep diffs focused; follow existing folder/module patterns

## Security & Configuration Tips
- Local server uses Basic Auth (`admin/password123` default) — change in production
- Prefer server proxies to avoid CORS (e.g., `/api/satusehat/token`, `/api/proxy/satusehat/organization/:id`)

## Agent-Specific Notes
- New routes: add under `src/pages`, wire in `src/App.jsx`, and menu in `src/components/Layout.jsx`
- Backend modules: configure via `src/services/api-registry.js`
- SatuSehat requests should go through the server proxy

