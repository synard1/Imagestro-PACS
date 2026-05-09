/**
 * FacetedSearch Component
 * Provides advanced search with filters, saved presets, and export capabilities
 *
 * Features:
 * - Real-time search with debouncing
 * - Faceted filters (date ranges, status, modality, etc.)
 * - Save/load filter presets
 * - Export results to CSV
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * Generic FacetedSearch component
 * Adapts to different data types via configuration
 */
export default function FacetedSearch({
  // Configuration
  config,
  // Data
  data = [],
  loading = false,
  // Callbacks
  onSearch,
  onExport,
  // Presets
  savedPresets = [],
  onSavePreset,
  onLoadPreset,
  onDeletePreset,
  // UI
  className = '',
  showExport = true,
  showPresets = true,
  placeholder = 'Search...'
}) {
  const { t } = useTranslation()

  // Extract field names from config
  const {
    searchFields = [],      // Fields to search in (e.g., ['name', 'mrn', 'accession'])
    filterFields = [],      // Available filter configurations
    dateFields = []         // Fields that are dates (for date range pickers)
  } = config

  // Search state
  const [searchTerm, setSearchTerm] = useState('')
  const [activeFilters, setActiveFilters] = useState({})
  const [dateRanges, setDateRanges] = useState({})
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [presetName, setPresetName] = useState('')
  const [showPresetModal, setShowPresetModal] = useState(false)

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (onSearch) {
        onSearch({
          q: searchTerm,
          filters: activeFilters,
          dateRanges
        })
      }
    }, 300) // 300ms debounce

    return () => clearTimeout(timer)
  }, [searchTerm, activeFilters, dateRanges, onSearch])

  // Handle filter change
  const handleFilterChange = (field, value) => {
    setActiveFilters(prev => {
      if (value === '' || value === null || value === 'all') {
        const { [field]: _, ...rest } = prev
        return rest
      }
      return { ...prev, [field]: value }
    })
  }

  // Clear all filters
  const clearFilters = () => {
    setActiveFilters({})
    setDateRanges({})
    setSearchTerm('')
  }

  // Active filter count for badge
  const activeFilterCount = useMemo(() => {
    return Object.keys(activeFilters).length + Object.keys(dateRanges).filter(k => dateRanges[k]).length
  }, [activeFilters, dateRanges])

  // Save preset
  const handleSavePreset = () => {
    if (!presetName.trim()) return

    onSavePreset?.({
      name: presetName,
      searchTerm,
      filters: activeFilters,
      dateRanges
    })
    setPresetName('')
    setShowPresetModal(false)
  }

  // Load preset
  const handleLoadPreset = (preset) => {
    setSearchTerm(preset.searchTerm || '')
    setActiveFilters(preset.filters || {})
    setDateRanges(preset.dateRanges || {})
    onLoadPreset?.(preset)
  }

  // Render filter controls based on config
  const renderFilters = () => {
    if (filterFields.length === 0) return null

    return (
      <div className="space-y-4">
        {filterFields.map(field => (
          <div key={field.key}>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {field.label}
            </label>
            {field.type === 'select' ? (
              <select
                className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                value={activeFilters[field.key] || ''}
                onChange={(e) => handleFilterChange(field.key, e.target.value)}
              >
                <option value="">{t('All')}</option>
                {field.options?.map(opt => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            ) : field.type === 'multiselect' ? (
              <div className="space-y-2">
                {field.options?.map(opt => (
                  <label key={opt.value} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={(activeFilters[field.key] || []).includes(opt.value)}
                      onChange={(e) => {
                        const current = activeFilters[field.key] || []
                        const newValue = e.target.checked
                          ? [...current, opt.value]
                          : current.filter(v => v !== opt.value)
                        handleFilterChange(field.key, newValue.length ? newValue : '')
                      }}
                      className="rounded border-slate-300"
                    />
                    <span className="text-sm">{opt.label}</span>
                  </label>
                ))}
              </div>
            ) : null}
          </div>
        ))}

        {/* Date range pickers */}
        {dateFields.map(field => (
          <div key={field.key} className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {field.label} From
              </label>
              <input
                type="date"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                value={dateRanges[`${field.key}_from`] || ''}
                onChange={(e) => setDateRanges(prev => ({
                  ...prev,
                  [`${field.key}_from`]: e.target.value
                }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {field.label} To
              </label>
              <input
                type="date"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                value={dateRanges[`${field.key}_to`] || ''}
                onChange={(e) => setDateRanges(prev => ({
                  ...prev,
                  [`${field.key}_to`]: e.target.value
                }))}
              />
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className={`faceted-search ${className}`}>
      {/* Search Bar */}
      <div className="flex flex-col md:flex-row gap-3 mb-4">
        <div className="flex-1 relative">
          <input
            type="text"
            className="w-full border border-slate-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder={placeholder}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {loading && (
            <div className="absolute right-3 top-2.5">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
            </div>
          )}
        </div>

        <div className="flex gap-2">
          {/* Toggle Advanced Filters */}
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className={`px-4 py-2 rounded-lg border ${
              showAdvanced || activeFilterCount > 0
                ? 'border-blue-500 bg-blue-50 text-blue-700'
                : 'border-slate-300 text-slate-700 hover:bg-slate-50'
            }`}
          >
            {t('Filters')}
            {activeFilterCount > 0 && (
              <span className="ml-2 bg-blue-600 text-white text-xs px-2 py-0.5 rounded-full">
                {activeFilterCount}
              </span>
            )}
          </button>

          {/* Clear Filters */}
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={clearFilters}
              className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
            >
              {t('Clear')}
            </button>
          )}

          {/* Export */}
          {showExport && onExport && (
            <button
              type="button"
              onClick={() => onExport(data)}
              className="px-4 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700"
              title={t('Export results to CSV')}
            >
              📥 CSV
            </button>
          )}

          {/* Presets */}
          {showPresets && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowPresetModal(!showPresetModal)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
              >
                💾 {t('Presets')}
              </button>

              {showPresetModal && (
                <div className="absolute right-0 mt-2 w-72 bg-white border border-slate-200 rounded-lg shadow-lg z-10">
                  <div className="p-3 border-b border-slate-200">
                    <input
                      type="text"
                      className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                      placeholder={t('Preset name')}
                      value={presetName}
                      onChange={(e) => setPresetName(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={handleSavePreset}
                      disabled={!presetName.trim()}
                      className="mt-2 w-full px-3 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
                    >
                      {t('Save current filters')}
                    </button>
                  </div>
                  <div className="max-h-60 overflow-y-auto">
                    {savedPresets.length === 0 ? (
                      <div className="p-3 text-sm text-slate-500">{t('No saved presets')}</div>
                    ) : (
                      savedPresets.map((preset, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between px-3 py-2 hover:bg-slate-50 border-b border-slate-100 last:border-b-0"
                        >
                          <button
                            type="button"
                            onClick={() => handleLoadPreset(preset)}
                            className="flex-1 text-left text-sm"
                          >
                            {preset.name}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              onDeletePreset?.(preset)
                              // Force re-render
                              setShowPresetModal(false)
                              setTimeout(() => setShowPresetModal(true), 0)
                            }}
                            className="text-red-500 hover:text-red-700 text-xs"
                          >
                            🗑️
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Advanced Filters Panel */}
      {showAdvanced && filterFields.length > 0 && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-700">{t('Advanced Filters')}</h3>
            <button
              type="button"
              onClick={() => setShowAdvanced(false)}
              className="text-sm text-slate-500 hover:text-slate-700"
            >
              ✕
            </button>
          </div>
          {renderFilters()}
        </div>
      )}

      {/* Active Filters Tags */}
      {activeFilterCount > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {Object.entries(activeFilters).map(([key, value]) => {
            const fieldConfig = filterFields.find(f => f.key === key)
            const label = fieldConfig?.label || key

            return (
              <span
                key={key}
                className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm"
              >
                {label}: {Array.isArray(value) ? value.join(', ') : value}
                <button
                  type="button"
                  onClick={() => handleFilterChange(key, '')}
                  className="ml-1 hover:text-blue-900"
                >
                  ✕
                </button>
              </span>
            )
          })}
          {Object.entries(dateRanges).filter(([_, v]) => v).map(([key, value]) => {
            const fieldConfig = dateFields.find(f => `${f.key}_from` === key || `${f.key}_to` === key)
            if (!fieldConfig) return null

            return (
              <span
                key={key}
                className="inline-flex items-center gap-1 bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm"
              >
                {fieldConfig.label}: {value}
                <button
                  type="button"
                  onClick={() => setDateRanges(prev => ({ ...prev, [key]: '' }))}
                  className="ml-1 hover:text-green-900"
                >
                  ✕
                </button>
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}

/**
 * Hook for managing saved filter presets in localStorage
 */
export function useSavedPresets(storageKey = 'search-presets') {
  const [presets, setPresets] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })

  const savePreset = useCallback((preset) => {
    setPresets(prev => {
      const newPresets = [...prev, { ...preset, id: Date.now() }]
      localStorage.setItem(storageKey, JSON.stringify(newPresets))
      return newPresets
    })
  }, [storageKey])

  const deletePreset = useCallback((presetToDelete) => {
    setPresets(prev => {
      const newPresets = prev.filter(p => p.id !== presetToDelete.id)
      localStorage.setItem(storageKey, JSON.stringify(newPresets))
      return newPresets
    })
  }, [storageKey])

  return { presets, savePreset, deletePreset }
}
