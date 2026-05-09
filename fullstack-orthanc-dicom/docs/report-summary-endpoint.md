# Comprehensive Report Endpoint Spec

Front-end page: `src/pages/Reports.jsx`
Service layer: `src/services/reportService.js`

The UI expects a single consolidated endpoint that returns all metrics needed to render the comprehensive report dashboard. The service already handles mock data, but once the backend exists we want it to respond with this shape so we can drop the fallback.

---

## HTTP Contract

- **Method:** `GET`
- **Path:** `/reports/summary`
- **Query params (all optional):**
  - `startDate` (`YYYY-MM-DD`): lower bound (inclusive) for scheduled/created timestamps. Default: 30 days before `endDate`.
  - `endDate` (`YYYY-MM-DD`): upper bound (inclusive). Default: today.
  - `modality`: modality code (e.g. `CT`, `MR`). Use `all`/omit for any.
  - `priority`: `stat`, `urgent`, `routine`. Use `all`/omit for any.
  - `statuses`: comma-separated workflow statuses (e.g. `scheduled,in_progress,completed`). When absent, include all.

Backend should validate `startDate <= endDate` and apply timezone normalization (UTC ISO-8601 in responses).

---

## Response Shape

```jsonc
{
  "generatedAt": "2025-11-13T12:00:00.000Z",
  "range": { "start": "2025-10-15T00:00:00.000Z", "end": "2025-11-13T23:59:59.000Z" },
  "filtersApplied": {
    "modality": "all",
    "priority": "all",
    "statuses": ["scheduled","in_progress","completed"]
  },
  "totals": {
    "orders": 120,
    "completed": 68,
    "scheduled": 32,
    "inProgress": 15,
    "cancelled": 5,
    "satusehatSynced": 54,
    "averageTurnaroundHours": 8.4,
    "averageWaitHours": 3.2
  },
  "trends": [
    { "date": "2025-11-01", "created": 5, "completed": 3, "synced": 2 }
  ],
  "modalityBreakdown": [
    { "name": "CT", "count": 30, "completed": 22 }
  ],
  "doctorPerformance": [
    { "name": "Dr. John Doe", "orders": 12, "completed": 10, "completionRate": 83 }
  ],
  "statusBreakdown": [
    { "status": "scheduled", "count": 32 }
  ],
  "priorityBreakdown": [
    { "priority": "urgent", "count": 8 }
  ],
  "satusehat": {
    "synced": 54,
    "pending": 20,
    "failed": 2
  },
  "bottlenecks": [
    { "label": "Orders waiting > 24h", "count": 4, "severity": "medium" }
  ],
  "longRunningOrders": [
    {
      "id": "order-id",
      "accession": "251028-0042",
      "patient": "Ardianto Putra",
      "modality": "CT",
      "status": "scheduled",
      "scheduledAt": "2025-10-29T09:00:00.000Z",
      "waitingHours": 36.5
    }
  ]
}
```

### Field Notes

- `generatedAt`: ISO timestamp when backend produced the report.
- `range`: actual date bounds after validation/defaulting; always ISO UTC.
- `filtersApplied`: backend echoes the effective filters (after defaults, normalization).
- `totals`: numeric aggregates for KPI cards. `averageTurnaroundHours` is completion minus scheduled time; `averageWaitHours` is scheduled minus created.
- `trends`: 30-day window (or whatever span requested) for charts. The UI expects every day in range, so fill missing dates with zeros to keep the graph continuous.
- `modalityBreakdown`: `name` string (e.g. `CT`), `count` (total orders), `completed` (subset).
- `doctorPerformance`: 5-10 top referring/requesting doctors based on order count. `completionRate` is integer percentage.
- `statusBreakdown`: counts per workflow status. Include at least `scheduled`, `in_progress`, `completed`, `cancelled`.
- `priorityBreakdown`: counts grouped by priority; UI treats missing array as “no data”.
- `satusehat`: pipeline health summary. Values should align with attachments or SATUSEHAT async job states.
- `bottlenecks`: short list of operational alerts with `severity` ∈ {`high`,`medium`,`info`}. UI shows count + label.
- `longRunningOrders`: top (≤10) orders still pending, sorted by highest `waitingHours`. `status` should match MWL status codes. `scheduledAt` must be ISO to format client-side.

---

## Implementation Guidance

1. **Data sources**
   - Orders table with timestamps: `created_at`, `scheduled_start_at`, `completed_at`, `status`, `priority`, `modality`.
   - Order/doctor relation for performance block.
   - SATUSEHAT sync logs / attachments to determine `satusehat` summary. Provide `synced`, `pending`, `failed` counts based on latest sync status.

2. **Filtering**
   - Use `scheduled_start_at` as the primary date for inclusion; fallback to `created_at` when missing.
   - Apply optional filters before aggregation.

3. **Performance considerations**
   - Add proper SQL indexes on `scheduled_start_at`, `status`, `modality`, `priority`.
   - Consider caching recent results keyed by filter tuple if the dataset is large.

4. **Error handling**
   - Respond with HTTP 400 when date range invalid or params malformed.
   - Return HTTP 200 with empty arrays/zeros when no orders match the filter (front-end handles empty states).

Once the backend endpoint aligns with this contract, the front-end automatically prefers the backend data (see `getReportSummary` in `src/services/reportService.js`). No further UI changes required.
