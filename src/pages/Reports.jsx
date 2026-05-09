import { useEffect, useMemo, useState } from 'react'
import LoadingScreen from '../components/LoadingScreen'
import { getReportSummary } from '../services/reportService'
import { getConfig } from '../services/config'
import { useAuth } from '../hooks/useAuth'

const STATUS_OPTIONS = [
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
]

const SECTION_DEFAULTS = {
  summary: true,
  status: true,
  modality: true,
  doctors: true,
  pending: true,
}

const REPORTS_ALLOWED_ROLES = ['superadmin', 'developer']

const PrintStyles = () => (
  <style>{`
    @media print {
      body {
        background: #fff;
      }
      body * {
        visibility: hidden !important;
      }
      #report-printable,
      #report-printable * {
        visibility: visible !important;
      }
      #report-printable {
        position: absolute;
        inset: 0;
        padding: 32px;
        width: 100%;
        background: #fff;
      }
      .no-print {
        display: none !important;
      }
    }
  `}</style>
)

const initialFilters = () => {
  const end = new Date()
  const start = new Date()
  start.setDate(end.getDate() - 6)
  return {
    startDate: formatInputDate(start),
    endDate: formatInputDate(end),
    modality: 'all',
    priority: 'all',
    statuses: [],
  }
}

function formatInputDate(date) {
  return date.toISOString().slice(0, 10)
}

function formatDateTime(dateString) {
  if (!dateString) return '-'
  const date = new Date(dateString)
  if (isNaN(date.getTime())) return dateString
  return date.toLocaleString()
}

function humanize(value = '') {
  if (!value) return 'Unknown'
  return value
    .split(/[_\s-]/)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export default function Reports({ canAccessReports: propAccess }) {
  const [filters, setFilters] = useState(() => initialFilters())
  const [appliedFilters, setAppliedFilters] = useState(() => initialFilters())
  const [sections, setSections] = useState(SECTION_DEFAULTS)
  const [config, setConfig] = useState(null)
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filterError, setFilterError] = useState(null)
  const { currentUser } = useAuth() || {}
  const hasRoleAccess = useMemo(() => {
    if (typeof propAccess === 'boolean') {
      return propAccess
    }
    const role = (currentUser?.role || '').toLowerCase()
    return REPORTS_ALLOWED_ROLES.includes(role)
  }, [propAccess, currentUser])

  useEffect(() => {
    let mounted = true
    getConfig().then(cfg => {
      if (mounted) setConfig(cfg)
    })
    return () => { mounted = false }
  }, [])

  const fetchSummary = async (activeFilters) => {
    setLoading(true)
    setError(null)
    try {
      const data = await getReportSummary(activeFilters)
      setSummary(data)
      setAppliedFilters(activeFilters)
    } catch (err) {
      setError(err.message || 'Unable to load report data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!hasRoleAccess) {
      setLoading(false)
      return
    }
    fetchSummary(appliedFilters)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasRoleAccess])

  const handleFilterChange = (field, value) => {
    setFilters(prev => ({ ...prev, [field]: value }))
  }

  const toggleStatus = (value) => {
    setFilters(prev => {
      const exists = prev.statuses.includes(value)
      return {
        ...prev,
        statuses: exists
          ? prev.statuses.filter(s => s !== value)
          : [...prev.statuses, value]
      }
    })
  }

  const toggleSection = (key) => {
    setSections(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const handleGenerate = () => {
    const start = new Date(filters.startDate)
    const end = new Date(filters.endDate)
    if (start > end) {
      setFilterError('Start date must be before end date')
      return
    }
    setFilterError(null)
    fetchSummary({ ...filters })
  }

  const handleReset = () => {
    const base = initialFilters()
    setFilters(base)
    setSections(SECTION_DEFAULTS)
    setFilterError(null)
    fetchSummary(base)
  }

  const handlePrint = () => {
    if (!summary) return
    window.print()
  }

  const facilityName = config?.siteName || 'MWL / mini-PACS'
  const periodText = `${appliedFilters.startDate} → ${appliedFilters.endDate}`
  const generatedAt = summary?.generatedAt ? formatDateTime(summary.generatedAt) : formatDateTime(new Date().toISOString())

  const selectedStatuses = useMemo(() => (
    appliedFilters.statuses?.length
      ? appliedFilters.statuses.map(humanize).join(', ')
      : 'All statuses'
  ), [appliedFilters.statuses])

  if (!hasRoleAccess) {
    return (
      <div className="max-w-2xl mx-auto">
        <ReportsRestrictedNotice />
      </div>
    )
  }

  if (loading && !summary) {
    return <LoadingScreen message="Preparing printable report..." />
  }

  return (
    <div className="space-y-6">
      <PrintStyles />
      <div className="no-print flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Printable Report</h1>
          <p className="text-sm text-slate-500">Generate PDF-ready summaries for audits or offline sharing.</p>
        </div>
        <div className="flex gap-2">
          <button
            className="px-4 py-2 border border-slate-300 rounded-lg text-sm"
            onClick={handleReset}
            disabled={loading}
          >
            Reset
          </button>
          <button
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm"
            onClick={handleGenerate}
            disabled={loading}
          >
            Refresh Data
          </button>
          <button
            className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm"
            onClick={handlePrint}
            disabled={!summary}
          >
            Print / Save PDF
          </button>
        </div>
      </div>

      <div className="no-print card space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <FilterField label="Start Date">
            <input
              type="date"
              className="input"
              value={filters.startDate}
              onChange={e => handleFilterChange('startDate', e.target.value)}
            />
          </FilterField>
          <FilterField label="End Date">
            <input
              type="date"
              className="input"
              value={filters.endDate}
              onChange={e => handleFilterChange('endDate', e.target.value)}
            />
          </FilterField>
          <FilterField label="Modality">
            <select
              className="input"
              value={filters.modality}
              onChange={e => handleFilterChange('modality', e.target.value)}
            >
              <option value="all">All Modalities</option>
              {(config?.modalities || []).map(mod => (
                <option key={mod} value={mod}>{mod}</option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Priority">
            <select
              className="input"
              value={filters.priority}
              onChange={e => handleFilterChange('priority', e.target.value)}
            >
              <option value="all">All Priorities</option>
              <option value="stat">STAT / Emergency</option>
              <option value="urgent">Urgent</option>
              <option value="routine">Routine</option>
            </select>
          </FilterField>
        </div>

        <div>
          <div className="text-xs font-semibold text-slate-500 mb-2">Statuses</div>
          <div className="flex flex-wrap gap-2">
            {STATUS_OPTIONS.map(opt => {
              const active = filters.statuses.includes(opt.value)
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => toggleStatus(opt.value)}
                  className={`px-3 py-1 rounded-full text-sm border ${active ? 'bg-slate-900 text-white border-slate-900' : 'border-slate-200 text-slate-600'}`}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <div className="text-xs font-semibold text-slate-500 mb-2">Include Sections</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {Object.entries(SECTION_DEFAULTS).map(([key]) => (
              <label key={key} className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={sections[key]}
                  onChange={() => toggleSection(key)}
                />
                <span>{sectionLabel(key)}</span>
              </label>
            ))}
          </div>
        </div>

        {filterError && (
          <div className="text-sm text-red-500">{filterError}</div>
        )}
      </div>

      {error && (
        <div className="no-print p-4 border border-red-200 bg-red-50 text-sm text-red-600 rounded-lg">
          {error}
        </div>
      )}

      <div id="report-printable" className="bg-white border border-slate-200 rounded-xl shadow-sm">
        <div className="p-6 space-y-6">
          <header className="flex flex-col gap-1 border-b border-slate-200 pb-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">Radiology Report</div>
            <h2 className="text-2xl font-semibold">{facilityName}</h2>
            <div className="text-sm text-slate-600 flex flex-wrap gap-3">
              <span>Period: {periodText}</span>
              <span>Statuses: {selectedStatuses}</span>
              <span>Generated: {generatedAt}</span>
            </div>
          </header>

          {sections.summary && summary && (
            <section>
              <SectionTitle>1. Order Summary</SectionTitle>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <SummaryCard label="Total Orders" value={summary.totals?.orders ?? 0} />
                <SummaryCard label="Completed" value={summary.totals?.completed ?? 0} />
                <SummaryCard label="In Progress" value={summary.totals?.inProgress ?? 0} />
                <SummaryCard label="Scheduled" value={summary.totals?.scheduled ?? 0} />
                <SummaryCard label="Avg Turnaround (hrs)" value={summary.totals?.averageTurnaroundHours ?? 0} />
                <SummaryCard label="Avg Waiting (hrs)" value={summary.totals?.averageWaitHours ?? 0} />
              </div>
              <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                <div className="p-3 bg-slate-50 rounded-lg">
                  <div className="text-xs text-slate-500">SatuSehat Synced</div>
                  <div className="text-xl font-semibold">{summary.satusehat?.synced ?? 0}</div>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg">
                  <div className="text-xs text-slate-500">SatuSehat Pending</div>
                  <div className="text-xl font-semibold">{summary.satusehat?.pending ?? 0}</div>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg">
                  <div className="text-xs text-slate-500">SatuSehat Failed</div>
                  <div className="text-xl font-semibold text-red-600">{summary.satusehat?.failed ?? 0}</div>
                </div>
              </div>
            </section>
          )}

          {sections.status && (
            <section>
              <SectionTitle>2. Status Breakdown</SectionTitle>
              <SimpleTable
                headers={['Status', 'Orders']}
                rows={(summary?.statusBreakdown || []).map(item => [humanize(item.status), item.count])}
                emptyText="No status data available"
              />
            </section>
          )}

          {sections.modality && (
            <section>
              <SectionTitle>3. Modality Distribution</SectionTitle>
              <SimpleTable
                headers={['Modality', 'Orders', 'Completed']}
                rows={(summary?.modalityBreakdown || []).map(item => [item.name, item.count, item.completed])}
                emptyText="No modality data available"
              />
            </section>
          )}

          {sections.doctors && (
            <section>
              <SectionTitle>4. Top Referring Doctors</SectionTitle>
              <SimpleTable
                headers={['Doctor', 'Orders', 'Completed', 'Completion Rate']}
                rows={(summary?.doctorPerformance || []).map(doc => [
                  doc.name,
                  doc.orders,
                  doc.completed,
                  `${doc.completionRate ?? 0}%`
                ])}
                emptyText="No doctor performance data available"
              />
            </section>
          )}

          {sections.pending && (
            <section>
              <SectionTitle>5. Longest Pending Orders</SectionTitle>
              <SimpleTable
                headers={['Accession', 'Patient', 'Modality', 'Status', 'Scheduled', 'Waiting (hrs)']}
                rows={(summary?.longRunningOrders || []).map(item => [
                  item.accession || '—',
                  item.patient,
                  item.modality,
                  humanize(item.status),
                  formatDateTime(item.scheduledAt),
                  item.waitingHours
                ])}
                emptyText="No pending orders exceeded the threshold"
              />
            </section>
          )}

          <footer className="text-xs text-slate-500 border-t border-slate-200 pt-4">
            Generated automatically by MWL / mini-PACS. Use the browser print dialog to save this report as PDF.
          </footer>
        </div>
      </div>
    </div>
  )
}

function FilterField({ label, children }) {
  return (
    <label className="text-sm font-medium text-slate-600 flex flex-col gap-1">
      <span>{label}</span>
      {children}
    </label>
  )
}

function SectionTitle({ children }) {
  return (
    <div className="text-base font-semibold text-slate-800 mb-2">{children}</div>
  )
}

function SummaryCard({ label, value }) {
  return (
    <div className="p-3 border border-slate-100 rounded-lg">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-xl font-semibold">{value}</div>
    </div>
  )
}

function SimpleTable({ headers, rows, emptyText }) {
  if (!rows.length) {
    return <div className="text-sm text-slate-500">{emptyText}</div>
  }
  return (
    <div className="overflow-auto">
      <table className="w-full text-sm border border-slate-200 rounded-lg">
        <thead className="bg-slate-50">
          <tr>
            {headers.map((header, idx) => (
              <th key={idx} className="text-left px-3 py-2 border-b border-slate-200 text-xs tracking-wide uppercase text-slate-500">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx} className="border-b border-slate-100 last:border-0">
              {row.map((col, colIdx) => (
                <td key={colIdx} className="px-3 py-2">{col}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ReportsRestrictedNotice() {
  return (
    <div className="p-6 rounded-xl border border-amber-200 bg-amber-50 text-amber-900 space-y-3">
      <div>
        <p className="text-xs uppercase tracking-wide text-amber-600 font-semibold">Limited Release</p>
        <h2 className="text-xl font-semibold">Reports are in private preview</h2>
      </div>
      <p className="text-sm text-amber-900/80">
        The printable report builder is still being hardened for release. Only users with the Super Admin or
        Developer role can access it for now.
      </p>
    </div>
  )
}

function sectionLabel(key) {
  switch (key) {
    case 'summary':
      return 'Summary & KPI'
    case 'status':
      return 'Status Breakdown'
    case 'modality':
      return 'Modality Distribution'
    case 'doctors':
      return 'Doctor Performance'
    case 'pending':
      return 'Longest Pending Orders'
    default:
      return humanize(key)
  }
}
