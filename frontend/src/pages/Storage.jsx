import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useDispatch } from 'react-redux'
import { toast } from 'react-hot-toast'
import { remove } from '@/store/filesSlice'
import {
  getStorageDashboard,
  getLargestFiles,
  getRecentFiles,
  downloadFile,
  emptyTrash,
} from '@/api/filesApi'


function fmtBytes(bytes) {
  if (!bytes && bytes !== 0) return '—'
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let v = bytes, i = 0
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtPct(n) {
  return typeof n === 'number' ? `${n.toFixed(1)}%` : '—'
}


const MIME_META = {
  image:       { icon: 'fa-image',          colour: '#6366f1' },
  video:       { icon: 'fa-film',           colour: '#8b5cf6' },
  'application/pdf': { icon: 'fa-file-pdf', colour: '#ef4444' },
  audio:       { icon: 'fa-music',          colour: '#f59e0b' },
  text:        { icon: 'fa-file-lines',     colour: '#10b981' },
  'application/zip':        { icon: 'fa-file-zipper', colour: '#6b7280' },
  'application/x-zip':      { icon: 'fa-file-zipper', colour: '#6b7280' },
  'application/msword':     { icon: 'fa-file-word',   colour: '#2563eb' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml': {
    icon: 'fa-file-word', colour: '#2563eb',
  },
  'application/vnd.ms-excel': { icon: 'fa-file-excel', colour: '#16a34a' },
  'application/vnd.openxmlformats-officedocument.spreadsheetml': {
    icon: 'fa-file-excel', colour: '#16a34a',
  },
}

function mimeIcon(mime = '') {
  if (!mime) return { icon: 'fa-file', colour: '#94a3b8' }
  const direct = MIME_META[mime]
  if (direct) return direct
  const prefix = Object.keys(MIME_META).find((k) => mime.startsWith(k))
  return prefix ? MIME_META[prefix] : { icon: 'fa-file', colour: '#94a3b8' }
}


const CAT_COLOURS = {
  Images:    '#6366f1',
  Videos:    '#8b5cf6',
  PDFs:      '#ef4444',
  Documents: '#2563eb',
  Others:    '#94a3b8',
}


// ─── Modals ──────────────────────────────────────────────────────────────────

function TrashConfirmModal({ fileName, onConfirm, onCancel }) {
  return (
    <div className="modal-overlay">
      <div className="modal-panel p-6 max-w-sm">
        <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-red-50 dark:bg-red-950 mx-auto mb-4">
          <i className="fas fa-trash text-red-500 text-lg" />
        </div>
        <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 text-center mb-1">Move to Trash?</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 text-center mb-6">
          <span className="font-semibold text-gray-700 dark:text-gray-300 break-all">"{fileName}"</span>
          {' '}will be moved to the trash. You can restore it later from the Trash page.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 text-sm font-semibold hover:bg-gray-50 dark:hover:bg-gray-800 transition"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 transition"
          >
            Move to Trash
          </button>
        </div>
      </div>
    </div>
  )
}

// Replaces window.confirm for empty trash — consistent with TrashConfirmModal pattern
function EmptyTrashModal({ trashCount, trashBytes, onConfirm, onCancel }) {
  return (
    <div className="modal-overlay">
      <div className="modal-panel p-6 max-w-sm">
        <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-red-50 dark:bg-red-950 mx-auto mb-4">
          <i className="fas fa-trash-can text-red-500 text-lg" />
        </div>
        <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 text-center mb-1">Empty Trash?</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 text-center mb-2">
          This will permanently delete{' '}
          <span className="font-semibold text-gray-700 dark:text-gray-300">
            {trashCount} file{trashCount !== 1 ? 's' : ''}
          </span>{' '}
          ({fmtBytes(trashBytes)}). This cannot be undone.
        </p>
        <div className="flex gap-3 mt-6">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 text-sm font-semibold hover:bg-gray-50 dark:hover:bg-gray-800 transition"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 transition"
          >
            Empty Trash
          </button>
        </div>
      </div>
    </div>
  )
}

// Bulk delete confirmation modal
function BulkDeleteModal({ count, onConfirm, onCancel }) {
  return (
    <div className="modal-overlay">
      <div className="modal-panel p-6 max-w-sm">
        <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-red-50 dark:bg-red-950 mx-auto mb-4">
          <i className="fas fa-trash text-red-500 text-lg" />
        </div>
        <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 text-center mb-1">
          Move {count} file{count !== 1 ? 's' : ''} to Trash?
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 text-center mb-6">
          All selected files will be moved to the trash. You can restore them later.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 text-sm font-semibold hover:bg-gray-50 dark:hover:bg-gray-800 transition"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 transition"
          >
            Move to Trash
          </button>
        </div>
      </div>
    </div>
  )
}


// ─── Shared sub-components ────────────────────────────────────────────────────

function StatCard({ label, value, sub, accent }) {
  return (
    <div className="widget-card rounded-lg p-5 flex flex-col gap-1 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">{label}</p>
      <p className="text-2xl font-bold text-slate-900 dark:text-white" style={{ color: accent || '#0f172a' }}>{value}</p>
      {sub && <p className="text-xs text-gray-400 dark:text-gray-500">{sub}</p>}
    </div>
  )
}

function EmptyState({ icon, title, message }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center gap-3">
      <div className="w-14 h-14 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-400 text-2xl">
        <i className={`fas ${icon}`} />
      </div>
      <p className="font-semibold text-gray-600 dark:text-gray-400">{title}</p>
      {message && <p className="text-sm text-gray-400 dark:text-gray-500 max-w-xs">{message}</p>}
    </div>
  )
}

function SectionError({ message, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
      <i className="fas fa-circle-exclamation text-2xl text-red-400" />
      <p className="text-sm text-gray-500 dark:text-gray-400">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="text-sm text-brand-600 hover:underline font-medium"
        >
          Try again
        </button>
      )}
    </div>
  )
}

function FileRow({ file, onDelete, onDownload, onShare, compact, selectable, selected, onSelect }) {
  const { icon, colour } = mimeIcon(file.mime_type)
  return (
    <div className={`flex items-center gap-3 py-3 border-b border-slate-50 dark:border-gray-800 last:border-0 group transition-colors ${selected ? 'bg-indigo-900/40' : ''}`}>

      {/* Checkbox — only rendered when bulk-select mode is active */}
      {selectable && (
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onSelect(file.id)}
          className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 accent-violet-600 flex-shrink-0 cursor-pointer"
        />
      )}

      <div
        className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-sm"
        style={{ background: colour + '18', color: colour }}
      >
        <i className={`fas ${icon}`} />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{file.original_name}</p>
        <p className="text-xs text-gray-400 dark:text-gray-500">
          {fmtDate(file.uploaded_at)}{!compact && ` · ${fmtBytes(file.file_size)}`}
        </p>
      </div>

      {!compact && (
        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 flex-shrink-0 hidden sm:block">
          {fmtBytes(file.file_size)}
        </span>
      )}

      <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => onDownload(file.id, file.original_name)}
          className="w-7 h-7 rounded-lg text-gray-400 hover:bg-brand-50 dark:hover:bg-brand-950 hover:text-brand-600 flex items-center justify-center transition"
          title="Download"
        >
          <i className="fas fa-download text-xs" />
        </button>
        {onShare && (
          <button
            onClick={() => onShare(file)}
            className="w-7 h-7 rounded-lg text-gray-400 hover:bg-violet-50 dark:hover:bg-violet-950 hover:text-violet-600 flex items-center justify-center transition"
            title="Share"
          >
            <i className="fas fa-share-nodes text-xs" />
          </button>
        )}
        <button
          onClick={() => onDelete(file.id, file.original_name)}
          className="w-7 h-7 rounded-lg text-gray-400 hover:bg-red-50 dark:hover:bg-red-950 hover:text-red-500 flex items-center justify-center transition"
          title="Delete"
        >
          <i className="fas fa-trash text-xs" />
        </button>
      </div>
    </div>
  )
}


// ─── Sort options ─────────────────────────────────────────────────────────────

const SORT_OPTIONS = [
  { label: 'Largest',  value: '-file_size' },
  { label: 'Newest',   value: '-uploaded_at' },
  { label: 'Oldest',   value: 'uploaded_at' },
  { label: 'Name A–Z', value: 'original_name' },
]


// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Storage() {
  const dispatch  = useDispatch()

  const [dash,        setDash]        = useState(null)
  const [dashLoading, setDashLoading] = useState(true)
  const [dashError,   setDashError]   = useState(null)

  const [largest,       setLargest]       = useState([])
  const [lPage,         setLPage]         = useState(1)
  const [lTotalPages,   setLTotalPages]   = useState(1)
  const [lSearch,       setLSearch]       = useState('')
  const [lOrdering,     setLOrdering]     = useState('-file_size')
  const [lLoading,      setLLoading]      = useState(false)
  const [lError,        setLError]        = useState(null)

  const [recent,        setRecent]        = useState([])
  const [rPage,         setRPage]         = useState(1)
  const [rTotalPages,   setRTotalPages]   = useState(1)
  const [rLoading,      setRLoading]      = useState(false)
  const [rError,        setRError]        = useState(null)

  const [actionError,   setActionError]   = useState(null)
  const [emptyingTrash, setEmptyingTrash] = useState(false)

  // Single-file trash modal
  const [trashTarget, setTrashTarget] = useState(null)  // { id, name }

  // Empty-trash modal (replaces window.confirm)
  const [showEmptyTrashModal, setShowEmptyTrashModal] = useState(false)

  // Bulk selection state (for Largest Files panel only)
  const [selectedIds,      setSelectedIds]      = useState(new Set())
  const [bulkSelectActive, setBulkSelectActive] = useState(false)
  const [showBulkDelete,   setShowBulkDelete]   = useState(false)
  const [bulkDeleting,     setBulkDeleting]     = useState(false)


  // ── Data loaders ────────────────────────────────────────────────────────────

  const loadDash = useCallback(async () => {
    setDashLoading(true)
    setDashError(null)
    try {
      const { data } = await getStorageDashboard()
      setDash(data.data)
    } catch (e) {
      setDashError(e.response?.data?.message || 'Failed to load storage data.')
    } finally {
      setDashLoading(false)
    }
  }, [])

  const loadLargest = useCallback(async () => {
    setLLoading(true)
    setLError(null)
    try {
      const { data } = await getLargestFiles({ page: lPage, search: lSearch, ordering: lOrdering })
      setLargest(data.data.results || [])
      setLTotalPages(data.data.total_pages || 1)
    } catch (e) {
      setLError(e.response?.data?.message || 'Failed to load files.')
    } finally {
      setLLoading(false)
    }
  }, [lPage, lSearch, lOrdering])

  const loadRecent = useCallback(async () => {
    setRLoading(true)
    setRError(null)
    try {
      const { data } = await getRecentFiles(rPage)
      setRecent(data.data.results || [])
      setRTotalPages(data.data.total_pages || 1)
    } catch (e) {
      setRError(e.response?.data?.message || 'Failed to load recent files.')
    } finally {
      setRLoading(false)
    }
  }, [rPage])

  useEffect(() => { loadDash() }, [loadDash])
  useEffect(() => { loadLargest() }, [loadLargest])
  useEffect(() => { loadRecent() }, [loadRecent])
  useEffect(() => { setLPage(1) }, [lSearch, lOrdering])

  // Clear selection when list refreshes
  useEffect(() => { setSelectedIds(new Set()) }, [largest])


  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleDownload = async (fileId, name) => {
    const toastId = toast.loading(`Downloading ${name || 'file'}...`)
    try {
      const resp = await downloadFile(fileId)
      const url  = URL.createObjectURL(new Blob([resp.data]))
      const a    = Object.assign(document.createElement('a'), { href: url, download: name })
      document.body.appendChild(a); a.click()
      setTimeout(() => { URL.revokeObjectURL(url); a.remove() }, 1000)
      toast.success('Download successful!', { id: toastId })
    } catch {
      toast.error('Download failed.', { id: toastId })
      setActionError('Download failed.')
    }
  }

  const handleDelete = (fileId, fileName) => {
    setTrashTarget({ id: fileId, name: fileName })
  }

  const confirmDelete = async () => {
    const { id } = trashTarget
    setTrashTarget(null)
    try {
      await dispatch(remove(id)).unwrap()
      loadDash(); loadLargest(); loadRecent()
    } catch {
      setActionError('Delete failed.')
    }
  }

  // Bulk selection helpers
  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === largest.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(largest.map((f) => f.id)))
    }
  }

  const exitBulkSelect = () => {
    setBulkSelectActive(false)
    setSelectedIds(new Set())
  }

  // Bulk delete — dispatches remove for each selected file sequentially
  const confirmBulkDelete = async () => {
    setShowBulkDelete(false)
    setBulkDeleting(true)
    const ids = [...selectedIds]
    let failed = 0
    for (const id of ids) {
      try {
        await dispatch(remove(id)).unwrap()
      } catch {
        failed++
      }
    }
    setBulkDeleting(false)
    exitBulkSelect()
    loadDash(); loadLargest(); loadRecent()
    if (failed > 0) setActionError(`${failed} file${failed !== 1 ? 's' : ''} could not be deleted.`)
  }

  const handleEmptyTrash = async () => {
    setShowEmptyTrashModal(false)
    setEmptyingTrash(true)
    try {
      await emptyTrash()
      loadDash()
    } catch {
      setActionError('Failed to empty trash.')
    } finally {
      setEmptyingTrash(false)
    }
  }


  // ── Derived values ───────────────────────────────────────────────────────────

  const actualUsedPct = dash?.usage_percent ?? 0
  const usedPct = Math.min(100, Math.max(0, actualUsedPct))
  const storageFull = dash?.total_gb != null ? dash.used_bytes >= dash.total_gb * 1024 * 1024 * 1024 : usedPct >= 100
  const overQuota = dash?.total_gb != null ? dash.used_bytes > (dash.total_gb * 1024 * 1024 * 1024) : false
  const overWarn = usedPct >= 80
  const overCrit = usedPct >= 95

  // Warn if trash holds ≥20% of total quota — actionable, recoverable space
  const trashPct = (dash?.used_bytes && dash?.trash_bytes)
    ? (dash.trash_bytes / (dash.used_bytes + (dash.available_bytes ?? 0))) * 100
    : 0
  const trashWarn = trashPct >= 20 && (dash?.trash_count ?? 0) > 0

  const barColour = overCrit
    ? 'from-red-500 to-orange-400'
    : overWarn
      ? 'from-amber-500 to-yellow-400'
      : 'from-brand-600 to-indigo-400'

  const allSelected = largest.length > 0 && selectedIds.size === largest.length


  // ── Loading skeleton ─────────────────────────────────────────────────────────

  if (dashLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center py-12">
        <div className="flex flex-col items-center gap-4 text-gray-400">
          <div className="w-10 h-10 border border-brand-200 border-t-brand-500 rounded-full animate-spin" />
          <p className="text-sm font-medium">Loading storage data…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full space-y-6">
      <div className="space-y-6">

        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <header className="flex flex-col sm:flex-row justify-between items-start gap-4">
          <div>
            <h2 className="page-title">Storage</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {fmtBytes(dash?.used_bytes)} of {dash?.total_gb ?? '—'} GB used
              {dash?.file_count != null && ` · ${dash.file_count.toLocaleString()} file${dash.file_count !== 1 ? 's' : ''}`}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Link
              to="/files"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 text-sm font-semibold hover:bg-gray-50 dark:hover:bg-gray-800 transition"
            >
              <i className="fas fa-folder-open text-sm" /> My Files
            </Link>
            <Link
              to="/trash"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 transition"
            >
              <i className="fas fa-trash text-sm" /> Trash
            </Link>
          </div>
        </header>

        {/* ── Global error banner ─────────────────────────────────────────────── */}
        {(dashError || actionError) && (
          <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950 px-4 py-3 text-sm text-red-700 dark:text-red-400 flex items-center justify-between gap-2">
            <span>{dashError || actionError}</span>
            <button onClick={() => { setDashError(null); setActionError(null) }} className="text-red-400 hover:text-red-600">
              <i className="fas fa-xmark" />
            </button>
          </div>
        )}

        {/* ── Storage warning ─────────────────────────────────────────────────── */}
        {overQuota && (
          <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950 px-4 py-3 text-sm text-red-700 dark:text-red-400 flex items-center gap-3">
            <i className="fas fa-triangle-exclamation text-base text-red-500" />
            Storage limit exceeded. Delete files or empty trash to continue uploading.
          </div>
        )}
        {!overQuota && storageFull && (
          <div className="rounded-xl px-4 py-3 flex items-center gap-3 text-sm font-medium bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400">
            <i className="fas fa-triangle-exclamation text-base text-red-500" />
            Storage full — delete files or empty trash to free space.
          </div>
        )}
        {!overQuota && !storageFull && overWarn && (
          <div className={`rounded-xl px-4 py-3 flex items-center gap-3 text-sm font-medium ${
            overCrit
              ? 'bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400'
              : 'bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400'
          }`}>
            <i className={`fas fa-triangle-exclamation text-base ${overCrit ? 'text-red-500' : 'text-amber-500'}`} />
            {overCrit
              ? 'Storage above 95% — delete files or empty trash to free space.'
              : `Storage is ${fmtPct(usedPct)} full. Consider cleaning up to avoid disruptions.`}
          </div>
        )}

        {/* ── Trash size warning — shown when trash holds ≥20% of total quota ── */}
        {trashWarn && (
          <div className="rounded-xl px-4 py-3 flex items-center justify-between gap-3 text-sm font-medium bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400">
            <div className="flex items-center gap-3">
              <i className="fas fa-trash-can text-blue-500" />
              <span>
                Your trash is holding <strong>{fmtBytes(dash.trash_bytes)}</strong> ({fmtPct(trashPct)} of your quota).
                Empty it to free up space.
              </span>
            </div>
            <button
              onClick={() => setShowEmptyTrashModal(true)}
              disabled={emptyingTrash}
              className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-blue-100 dark:bg-blue-900 hover:bg-blue-200 dark:hover:bg-blue-800 text-blue-700 dark:text-blue-300 text-xs font-semibold transition disabled:opacity-60"
            >
              Empty Trash
            </button>
          </div>
        )}

        {/* ── Overview card ───────────────────────────────────────────────────── */}
        <section className="card rounded-lg p-5 shadow-sm space-y-5">
          <h3 className="text-sm font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">Overview</h3>

          <div className="space-y-2">
            <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
              <span>{fmtPct(usedPct)} used</span>
              <span>{fmtBytes(dash?.available_bytes)} free</span>
            </div>
            <div className="h-3 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
              <div
                className={`h-full rounded-full bg-gradient-to-r transition-all duration-700 ${barColour}`}
                style={{ width: `${Math.min(100, usedPct)}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Used"       value={fmtBytes(dash?.used_bytes)}      sub={`${fmtPct(usedPct)} of quota`}            accent="#6366f1" />
            <StatCard label="Available"  value={fmtBytes(dash?.available_bytes)} sub={`of ${dash?.total_gb ?? '—'} GB total`}   accent="#10b981" />
            <StatCard label="Files"      value={(dash?.file_count ?? 0).toLocaleString()} sub="active files"                     accent="#0f172a" />
            <StatCard label="Quota"      value={`${dash?.total_gb ?? '—'} GB`}   sub="total storage"                            accent="#94a3b8" />
          </div>
        </section>

        {/* ── Two-column: Largest Files + sidebar ─────────────────────────────── */}
        <div className="grid gap-5 lg:grid-cols-[1fr_340px]">

          {/* Largest Files */}
          <section className="card rounded-lg shadow-sm overflow-hidden">

            {/* Section header */}
            <div className="px-5 pt-5 pb-4 border-b border-gray-100 dark:border-gray-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h3 className="font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                <i className="fas fa-weight-scale text-brand-500 text-sm" />
                Largest Files
              </h3>
              <div className="flex items-center gap-2 flex-wrap">
                {/* Search */}
                <div className="relative">
                  <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 text-xs" />
                  <input
                    type="text"
                    placeholder="Search…"
                    value={lSearch}
                    onChange={(e) => setLSearch(e.target.value)}
                    className="pl-8 pr-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-300 w-36"
                  />
                </div>
                {/* Sort */}
                <select
                  value={lOrdering}
                  onChange={(e) => setLOrdering(e.target.value)}
                  className="text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 dark:text-gray-200 px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-300"
                >
                  {SORT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                {/* Bulk-select toggle */}
                <button
                  onClick={() => bulkSelectActive ? exitBulkSelect() : setBulkSelectActive(true)}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition ${
                    bulkSelectActive
                      ? 'border-violet-400 bg-violet-50 dark:bg-violet-950 text-violet-700 dark:text-violet-300'
                      : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  <i className="fas fa-check-square mr-1.5" />
                  {bulkSelectActive ? 'Cancel' : 'Select'}
                </button>
              </div>
            </div>

            {/* Bulk action bar — only visible when items are selected */}
            {bulkSelectActive && (
              <div className="px-5 py-2.5 bg-violet-50 dark:bg-violet-950/60 border-b border-violet-100 dark:border-violet-900 flex items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-sm font-medium text-violet-700 dark:text-violet-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 accent-violet-600"
                  />
                  {selectedIds.size > 0
                    ? `${selectedIds.size} selected`
                    : 'Select all'}
                </label>
                <div className="flex items-center gap-2">
                  {selectedIds.size > 0 && (
                    <button
                      onClick={() => setShowBulkDelete(true)}
                      disabled={bulkDeleting}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500 hover:bg-red-600 text-white text-xs font-semibold transition disabled:opacity-60"
                    >
                      {bulkDeleting
                        ? <><i className="fas fa-spinner fa-spin" /> Deleting…</>
                        : <><i className="fas fa-trash" /> Delete {selectedIds.size}</>
                      }
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* File list */}
            <div className="px-5 py-1 min-h-[200px] relative">
              {lLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/60 dark:bg-gray-900/60 z-10 rounded-b-2xl">
                  <div className="w-6 h-6 border border-brand-200 border-t-brand-500 rounded-full animate-spin" />
                </div>
              )}
              {lError && !lLoading ? (
                <SectionError message={lError} onRetry={loadLargest} />
              ) : largest.length === 0 && !lLoading ? (
                <EmptyState icon="fa-folder-open" title="No files yet" message="Upload files to see them here." />
              ) : (
                largest.map((f) => (
                  <FileRow
                    key={f.id}
                    file={f}
                    onDelete={handleDelete}
                    onDownload={handleDownload}
                    selectable={bulkSelectActive}
                    selected={selectedIds.has(f.id)}
                    onSelect={toggleSelect}
                  />
                ))
              )}
            </div>

            {/* Pagination */}
            {lTotalPages > 1 && (
              <div className="px-5 pb-4 flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
                <button
                  disabled={lPage <= 1 || lLoading}
                  onClick={() => setLPage((p) => p - 1)}
                  className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 transition"
                >
                  <i className="fas fa-chevron-left text-xs" />
                </button>
                <span>Page {lPage} of {lTotalPages}</span>
                <button
                  disabled={lPage >= lTotalPages || lLoading}
                  onClick={() => setLPage((p) => p + 1)}
                  className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 transition"
                >
                  <i className="fas fa-chevron-right text-xs" />
                </button>
              </div>
            )}
          </section>

          {/* Sidebar */}
          <div className="space-y-5">

            {/* File Types */}
            <section className="card rounded-lg shadow-sm p-5">
              <h3 className="font-bold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2">
                <i className="fas fa-chart-pie text-brand-500 text-sm" />
                File Types
              </h3>
              {!dash?.type_usage?.length ? (
                <EmptyState icon="fa-chart-pie" title="No data" />
              ) : (
                <div className="space-y-3">
                  {dash.type_usage.map((row) => {
                    const pct = dash.used_bytes ? Math.round((row.bytes / dash.used_bytes) * 100) : 0
                    const col = CAT_COLOURS[row.category] || '#94a3b8'
                    return (
                      <div key={row.category}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="font-medium text-gray-600 dark:text-gray-400">{row.category}</span>
                          <span className="text-gray-400 dark:text-gray-500">{fmtBytes(row.bytes)} · {row.count} file{row.count !== 1 ? 's' : ''}</span>
                        </div>
                        <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${pct}%`, background: col }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>

            {/* Trash */}
            <section className="card rounded-lg shadow-sm p-5">
              <h3 className="font-bold text-gray-800 dark:text-gray-200 mb-3 flex items-center gap-2">
                <i className="fas fa-trash text-red-400 text-sm" />
                Trash
              </h3>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-2xl font-bold text-gray-800 dark:text-gray-200">{fmtBytes(dash?.trash_bytes ?? 0)}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                    {(dash?.trash_count ?? 0).toLocaleString()} file{dash?.trash_count !== 1 ? 's' : ''} in trash
                  </p>
                </div>
                {(dash?.trash_count ?? 0) > 0 && (
                  <button
                    onClick={() => setShowEmptyTrashModal(true)}
                    disabled={emptyingTrash}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400 text-sm font-semibold hover:bg-red-100 dark:hover:bg-red-900 transition disabled:opacity-60"
                  >
                    {emptyingTrash
                      ? <><i className="fas fa-spinner fa-spin text-xs" /> Emptying…</>
                      : <><i className="fas fa-trash-can text-xs" /> Empty Trash</>
                    }
                  </button>
                )}
              </div>
              <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                <Link to="/trash" className="text-sm text-brand-600 hover:underline font-medium">
                  View trash →
                </Link>
              </div>
            </section>

          </div>
        </div>

        {/* ── Recent Files ────────────────────────────────────────────────────── */}
        <section className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm overflow-hidden">
          <div className="px-5 pt-5 pb-4 border-b border-gray-100 dark:border-gray-800">
            <h3 className="font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2">
              <i className="fas fa-clock text-brand-500 text-sm" />
              Recent Files
            </h3>
          </div>

          <div className="px-5 py-1 relative">
            {rLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/60 dark:bg-gray-900/60 z-10 rounded-b-2xl">
                <div className="w-6 h-6 border border-brand-200 border-t-brand-500 rounded-full animate-spin" />
              </div>
            )}
            {rError && !rLoading ? (
              <SectionError message={rError} onRetry={loadRecent} />
            ) : recent.length === 0 && !rLoading ? (
              <EmptyState
                icon="fa-clock-rotate-left"
                title="No recent files"
                message="Your latest uploads will appear here."
              />
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-0 sm:gap-x-6 divide-y sm:divide-y-0 dark:divide-gray-800">
                {recent.map((f) => (
                  <FileRow
                    key={f.id}
                    file={f}
                    compact
                    onDelete={handleDelete}
                    onDownload={handleDownload}
                  />
                ))}
              </div>
            )}
          </div>

          {rTotalPages > 1 && (
            <div className="px-5 pb-4 flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
              <button
                disabled={rPage <= 1 || rLoading}
                onClick={() => setRPage((p) => p - 1)}
                className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 transition"
              >
                <i className="fas fa-chevron-left text-xs" />
              </button>
              <span>Page {rPage} of {rTotalPages}</span>
              <button
                disabled={rPage >= rTotalPages || rLoading}
                onClick={() => setRPage((p) => p + 1)}
                className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 transition"
              >
                <i className="fas fa-chevron-right text-xs" />
              </button>
            </div>
          )}
        </section>

      </div>

      {/* ── Modals ──────────────────────────────────────────────────────────── */}

      {trashTarget && (
        <TrashConfirmModal
          fileName={trashTarget.name}
          onConfirm={confirmDelete}
          onCancel={() => setTrashTarget(null)}
        />
      )}

      {showEmptyTrashModal && (
        <EmptyTrashModal
          trashCount={dash?.trash_count ?? 0}
          trashBytes={dash?.trash_bytes ?? 0}
          onConfirm={handleEmptyTrash}
          onCancel={() => setShowEmptyTrashModal(false)}
        />
      )}

      {showBulkDelete && (
        <BulkDeleteModal
          count={selectedIds.size}
          onConfirm={confirmBulkDelete}
          onCancel={() => setShowBulkDelete(false)}
        />
      )}

    </div>
  )
}