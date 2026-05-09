# Documentation Guide (For Agents)

This guide tells human and AI agents how to create and store project documentation so it stays organized and discoverable.

## Scope
- Applies to all new docs for this repo.
- Default format: Markdown (`.md`, ASCII). Use `.txt` only for raw exports, then convert to `.md`.
- Do not place docs in the repository root; always file them under `@docs/` or an existing subfolder.

## File Placement Rules
- **Project overview**: high-level or cross-cutting info → `@docs/project-overview/`.
- **Guides/how-to/quick starts**: step-by-step instructions → `@docs/guides/`.
- **Implementation/integration**: designs, plans, feature summaries → `@docs/implementation/` (or existing product-area subfolder under `@docs/implementation/`).
- **Troubleshooting/fixes/postmortems**: incident reports, bug fixes → `@docs/troubleshooting/`.
- **Reports/status**: checklists, evidence, completion tables → `@docs/reports/` (create a subfolder per initiative, e.g., `@docs/reports/task-1-5/`).
- **Deployment/ops**: rollout steps, restart procedures → `@docs/deployment/`.
- **Schemas/API**: data models, endpoint docs → `@docs/schemas/` or `@docs/api/` if present.
- **Archive**: imports from backups or historical artifacts → `@docs/archive/<source>/`.
- If a matching subfolder already exists (e.g., `@docs/dicom`, `@docs/worklist`), prefer it over creating a new category.

## Naming Conventions
- Use clear, dash-separated filenames, e.g., `REPORTS_LAYOUT_EXECUTION_SUMMARY.md`, `SATUSEHAT_MONITOR_FIX.md`.
- Add date only when the doc is time-bound, e.g., `2025-02-10_RELEASE_NOTES.md`.

## Minimal Structure Template
```
# <Title>
## Context
- What this doc covers and why it exists.

## Scope
- Systems/features impacted.

## Procedure / Steps
- Ordered steps or key implementation notes.

## Outcomes / Evidence
- Results, links, screenshots (paths), or verification notes.

## Next Actions
- Follow-ups, owners, due dates (if any).
```

## Operational Rules
- Keep sections concise; use bullet lists over prose where possible.
- Link to related docs using relative paths (e.g., `../troubleshooting/PRINT_FIX_SUMMARY.md`).
- When moving docs, preserve history by keeping filenames stable; note relocations in commit messages.
- For multi-file efforts, group them in a subfolder under the relevant category.
- Avoid duplicating content; reference existing docs instead of copying.
