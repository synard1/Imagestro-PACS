// src/components/Select2.jsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const asArray = (v) => Array.isArray(v) ? v : (v ? [v] : [])
const toStr = (v) => (v ?? '') + ''

export default function Select2({
  value,
  onChange,
  onSelect,               // optional: menerima {value,label,meta}
  fetchOptions,          // async (q) => [{value,label,meta?}]
  fetchInitial,          // async () => samples (max 5)
  placeholder = 'Type to search…',
  minChars = 3,
  disabled = false,
  className = '',
  clearable = true,
  initialLabel = '',
  multi = false,          // new prop: enable multi-select
  taggable = false,       // new prop: enable tagging
  delimiter = ',',        // new prop: delimiter for multi-value strings
}) {
  // fallback aman untuk props function
  const _fetchInitial = fetchInitial ?? (async () => [])
  const _fetchOptions = fetchOptions ?? (async () => [])

  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [opts, setOpts] = useState([])
  const [hi, setHi] = useState(-1)
  const [selectedLabel, setSelectedLabel] = useState(initialLabel || '')
  const boxRef = useRef(null)

  // Sync internal label with initialLabel prop
  useEffect(() => {
    if (initialLabel) setSelectedLabel(initialLabel);
  }, [initialLabel]);

  // Coordinates for portal positioning
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 })
  const [placement, setPlacement] = useState('bottom') // 'bottom' | 'top'

  const updateCoords = () => {
    if (boxRef.current && open) {
      const rect = boxRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const spaceBelow = viewportHeight - rect.bottom;
      const spaceAbove = rect.top;
      const dropdownHeight = 256; // max-h-64 is 16rem = 256px approx

      let top = rect.bottom;
      let place = 'bottom';

      // Simple flip logic: if not enough space below (approx 200px) and more space above, flip it.
      if (spaceBelow < 220 && spaceAbove > spaceBelow) {
        place = 'top';
        top = rect.top; // We will use bottom styling for the dropdown div
      }

      setCoords({
        top,
        left: rect.left,
        width: rect.width,
        bottom: rect.top
      });
      setPlacement(place);
    }
  }

  // Handle position updates
  useEffect(() => {
    if (open) {
      updateCoords();
      window.addEventListener('scroll', updateCoords, true);
      window.addEventListener('resize', updateCoords);
      return () => {
        window.removeEventListener('scroll', updateCoords, true);
        window.removeEventListener('resize', updateCoords);
      }
    }
  }, [open]);

  // For multi-select, convert value to array
  const values = useMemo(() => {
    if (!multi) return [value].filter(Boolean)
    if (Array.isArray(value)) return value.filter(Boolean)
    if (typeof value === 'string') return value.split(delimiter).map(v => v.trim()).filter(Boolean)
    return []
  }, [value, multi, delimiter])

  // For multi-select, create display value
  const displayValue = useMemo(() => {
    if (!multi) return ''
    if (initialLabel) return toStr(initialLabel)
    const labels = values.map(v => {
      const opt = opts.find(o => o?.value === v)
      return toStr(opt?.label ?? v)
    })
    return labels.join(', ')
  }, [values, opts, multi, initialLabel])

  const hasQuery = (q?.trim?.().length ?? 0) >= minChars

  // label untuk value terpilih (coerce string)
  const labelForValue = useMemo(() => {
    // For single select, prefer initialLabel if provided, even when value is empty.
    // This allows showing a preloaded label (e.g., from backend) when the input is disabled.
    if (multi) return displayValue
    if (value) {
      const it = opts.find(o => o?.value === value)
      return toStr(it?.label ?? value)
    }
    return toStr(selectedLabel || initialLabel)
  }, [value, opts, initialLabel, multi, displayValue, selectedLabel])

  // close saat klik di luar
  useEffect(() => {
    const onDocClick = (e) => {
      if (!boxRef.current) return

      // Check if click target is inside the dropdown with specific ID or class
      const dropdownEl = document.getElementById('select2-dropdown-portal');
      if (dropdownEl && dropdownEl.contains(e.target)) return;

      if (!boxRef.current.contains(e.target)) {
        // Use a small delay to ensure click/mousedown events on items can fire first
        setTimeout(() => setOpen(false), 150);
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  // ambil sampel awal ketika dropdown dibuka dan belum cukup karakter
  useEffect(() => {
    let alive = true
    const run = async () => {
      if (!open) return
      if (hasQuery) return
      setBusy(true)
      try {
        const data = await _fetchInitial()
        if (!alive) return
        const arr = asArray(data)
        setOpts(arr)
        setHi(arr.length ? 0 : -1)
      } catch {
        if (!alive) return
        setOpts([])
        setHi(-1)
      } finally {
        if (alive) setBusy(false)
      }
    }
    run()
    return () => { alive = false }
  }, [open, hasQuery, _fetchInitial])

  // pencarian dengan debounce
  useEffect(() => {
    let alive = true
    if (!hasQuery) return
    setBusy(true)
    const id = setTimeout(async () => {
      try {
        const data = await _fetchOptions(q)
        if (!alive) return
        const arr = asArray(data)
        setOpts(arr)
        setHi(arr.length ? 0 : -1)
      } catch {
        if (!alive) return
        setOpts([])
        setHi(-1)
      } finally {
        if (alive) setBusy(false)
      }
    }, 300)
    return () => { alive = false; clearTimeout(id) }
  }, [q, hasQuery, _fetchOptions])

  // Handle selection
  const choose = (opt) => {
    console.log('[Select2] choose:', opt);
    if (multi) {
      // For multi-select, add to values array
      const optValue = opt?.value ?? ''
      if (!values.includes(optValue)) {
        const newValues = [...values, optValue]
        const newValue = newValues.join(delimiter)
        onChange && onChange(newValue)
        onSelect && onSelect(opt ?? null)
      }
    } else {
      // For single select, replace value
      const nextVal = opt?.value ?? ''
      setSelectedLabel(opt?.label || '')
      onChange && onChange(nextVal)
      onSelect && onSelect(opt ?? null)
    }
    // Keep dropdown open for multi-select
    if (!multi) {
      setOpen(false)
      setQ('')
    }
  }

  // Handle tag creation for taggable multi-select
  const createTag = (tagValue) => {
    if (!taggable || !multi) return
    if (!values.includes(tagValue)) {
      const newValues = [...values, tagValue]
      const newValue = newValues.join(delimiter)
      onChange && onChange(newValue)
    }
    setQ('')
  }

  // Handle key events
  const onKey = (e) => {
    if (!open) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi(h => Math.min(h + 1, Math.max(opts.length - 1, 0))) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => Math.max(h - 1, 0)) }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (opts[hi]) {
        choose(opts[hi])
      } else if (taggable && multi && q.trim()) {
        createTag(q.trim())
      }
    }
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false) }
    // For multi-select, allow Backspace to remove last tag when input is empty
    if (multi && e.key === 'Backspace' && !q && values.length > 0) {
      e.preventDefault();
      const newValues = values.slice(0, -1)
      const newValue = newValues.join(delimiter)
      onChange && onChange(newValue)
    }
  }

  // Remove a tag in multi-select mode
  const removeTag = (tagValue) => {
    if (!multi) return
    const newValues = values.filter(v => v !== tagValue)
    const newValue = newValues.join(delimiter)
    onChange && onChange(newValue)
  }

  const dropdownContent = (
    <div
      id="select2-dropdown-portal"
      className="bg-white border rounded shadow-lg z-[9999] max-h-64 overflow-auto flex flex-col"
      style={{
        position: 'fixed',
        left: coords.left,
        width: coords.width,
        ...(placement === 'bottom'
          ? { top: coords.top + 4 }
          : { bottom: window.innerHeight - coords.bottom + 4 }
        )
      }}
    >
      {!hasQuery ? (
        busy ? (
          <div className="px-3 py-2 text-sm">Loading samples…</div>
        ) : (
          <>
            <div className="px-3 py-2 text-xs text-slate-500 border-b flex-shrink-0">
              Examples (select or type ≥ {minChars})
            </div>
            {opts.length === 0 ? (
              <div className="px-3 py-2 text-sm text-slate-500">No sample data</div>
            ) : (
              opts.map((o, idx) => (
                <div
                  key={toStr(o.value) + '-' + idx}
                  className={`px-3 py-2 text-sm cursor-pointer ${idx === hi ? 'bg-slate-100' : ''}`}
                  onMouseEnter={() => setHi(idx)}
                  onMouseDown={(e) => { e.preventDefault(); choose(o) }}
                >
                  <div className="font-medium">{toStr(o.label)}</div>
                  {o.meta && (typeof o.meta === 'string'
                    ? <div className="text-xs text-slate-500">{o.meta}</div>
                    : <div className="text-xs text-slate-500">
                      {Object.values(o.meta).filter(Boolean).join(' · ')}
                    </div>
                  )}
                </div>
              ))
            )}
          </>
        )
      ) : busy ? (
        <div className="px-3 py-2 text-sm">Searching…</div>
      ) : (
        <>
          {taggable && multi && q.trim() && !opts.some(o => o.value === q.trim()) && (
            <div
              className={`px-3 py-2 text-sm cursor-pointer ${hi === -1 ? 'bg-slate-100' : ''}`}
              onMouseEnter={() => setHi(-1)}
              onMouseDown={(e) => { e.preventDefault(); createTag(q.trim()); }}
            >
              <div className="font-medium">Add "{q.trim()}"</div>
              <div className="text-xs text-slate-500">Press Enter to create tag</div>
            </div>
          )}
          {opts.length === 0 ? (
            <div className="px-3 py-2 text-sm text-slate-500">No results</div>
          ) : (
            opts.map((o, idx) => (
              <div
                key={toStr(o.value) + '-' + idx}
                className={`px-3 py-2 text-sm cursor-pointer ${idx === hi ? 'bg-slate-100' : ''}`}
                onMouseEnter={() => setHi(idx)}
                onMouseDown={(e) => { e.preventDefault(); choose(o) }}
              >
                <div className="font-medium">{toStr(o.label)}</div>
                {o.meta && (typeof o.meta === 'string'
                  ? <div className="text-xs text-slate-500">{o.meta}</div>
                  : <div className="text-xs text-slate-500">
                    {Object.values(o.meta).filter(Boolean).join(' · ')}
                  </div>
                )}
              </div>
            ))
          )}
        </>
      )}
    </div>
  );

  return (
    <div className={`relative ${className}`} ref={boxRef} onKeyDown={onKey}>
      <div className="flex gap-2">
        <div className={`border rounded px-3 py-2 w-full ${multi ? 'flex flex-wrap gap-1 items-center' : ''} ${open ? 'border-blue-500 ring-1 ring-blue-500' : 'border-gray-300'}`}>
          {multi && values.map((val, idx) => {
            const opt = opts.find(o => o?.value === val)
            const label = toStr(opt?.label ?? val)
            return (
              <div key={idx} className="bg-blue-100 text-blue-800 rounded px-2 py-1 text-sm flex items-center">
                <span>{label}</span>
                {!disabled && (
                  <button
                    type="button"
                    className="ml-1 text-blue-500 hover:text-blue-700"
                    onClick={() => removeTag(val)}
                  >
                    ×
                  </button>
                )}
              </div>
            )
          })}
          <input
            className={`flex-grow outline-none bg-transparent ${multi ? 'w-auto' : 'w-full'}`}
            placeholder={values.length === 0 ? placeholder : ''}
            value={open ? q : (multi ? '' : labelForValue)}
            onChange={e => { setOpen(true); setQ(e.target.value ?? ''); }}
            onFocus={() => { setOpen(true); updateCoords(); }}
            disabled={disabled}
          />
        </div>
        {clearable && value && !disabled ? (
          <button
            type="button"
            className="px-2 rounded bg-slate-200 text-sm hover:bg-slate-300"
            onClick={() => { onChange?.(''); onSelect?.(null); setQ(''); }}
          >
            Clear
          </button>
        ) : null}
      </div>

      {open && createPortal(dropdownContent, document.body)}
    </div>
  )
}
