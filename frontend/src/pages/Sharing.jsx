import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useForm } from 'react-hook-form'
import api from '@/api/axios'
import {
  fetchAllFiles,
  fetchShares,
  share,
  revoke,
  deleteShare,
  createZipShare,
  fetchZipShares,
  revokeZipShare,
  deleteZipShare,
  fetchGlobalAnalytics,
  fetchRequests,
  createRequest,
  closeRequest,
  fetchInbox,
  reviewInboxItem,
  deleteInfectedFile,
  removeInboxItem,
} from '@/store/sharingSlice'
import Alert from '@/components/ui/Alert'
import { toast } from 'react-hot-toast'


const fmt = (n) => (n ?? 0).toLocaleString()


const StatusBadge = ({ status }) => {
  const map = {
    active:       'bg-emerald-50 text-emerald-700 border border-emerald-200',
    expired:      'bg-slate-50 text-slate-500 border border-slate-200',
    revoked:      'bg-red-50 text-red-600 border border-red-200',
    pending:      'bg-amber-50 text-amber-700 border border-amber-200',
    approved:     'bg-emerald-50 text-emerald-700 border border-emerald-200',
    rejected:     'bg-red-50 text-red-600 border border-red-200',
    needs_action: 'bg-orange-50 text-orange-600 border border-orange-200',
    complete:     'bg-blue-50 text-blue-700 border border-blue-200',
    open:         'bg-indigo-50 text-indigo-700 border border-indigo-200',
    fulfilled:    'bg-emerald-50 text-emerald-700 border border-emerald-200',
    closed:       'bg-slate-50 text-slate-500 border border-slate-200',
  }
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold capitalize ${map[status] || map.pending}`}>
      {status?.replace(/_/g, ' ')}
    </span>
  )
}

const ScanBadge = ({ status }) => {
  const cfg = {
    pending:     { cls: 'bg-slate-50 text-slate-500 border-slate-200',      icon: 'fa-clock',                label: 'Pending Scan' },
    scanning:    { cls: 'bg-blue-50 text-blue-600 border-blue-200',          icon: 'fa-spinner fa-spin',      label: 'Scanning…'    },
    safe:        { cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: 'fa-shield-halved',        label: 'Safe'         },
    infected:    { cls: 'bg-red-50 text-red-700 border-red-200',             icon: 'fa-bug',                  label: 'Infected'     },
    scan_failed: { cls: 'bg-orange-50 text-orange-600 border-orange-200',    icon: 'fa-triangle-exclamation', label: 'Scan Failed'  },
  }
  const c = cfg[status] || cfg.pending
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${c.cls}`}>
      <i className={`fas ${c.icon} text-[9px]`}></i>{c.label}
    </span>
  )
}

const Card = ({ children, className = '' }) => (
  <div className={`card rounded-2xl shadow-sm ${className}`}>{children}</div>
)

const StatTile = ({ icon, label, value, tint = 'indigo' }) => (
  <div className="widget-card relative overflow-hidden rounded-2xl p-5">
    <div className={`nav-item-icon icon-tint icon-tint-${tint} mb-3 h-10 w-10`}>
      <i className={`fas ${icon} text-base`} aria-hidden />
    </div>
    <p className="dashboard-metric text-2xl font-bold">{value}</p>
    <p className="dashboard-label text-xs mt-0.5">{label}</p>
  </div>
)

function TabBar({ tabs, active, onChange }) {
  return (
    <div
      className="tab-track overflow-x-auto"
      style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
    >
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={`tab-btn flex-shrink-0 ${active === t.id ? 'tab-btn-active' : ''}`}
        >
          <i className={`fas ${t.icon} text-[11px]`} aria-hidden />
          {t.label}
          {t.count != null && <span className="tab-count">{t.count}</span>}
        </button>
      ))}
    </div>
  )
}

function ConfirmModal({ title, body, confirmLabel, confirmClass, onCancel, onConfirm, loading }) {
  return (
    <div className="modal-overlay">
      <div className="modal-panel p-6 max-w-sm w-full mx-4">
        <h3 className="section-title text-base mb-2">{title}</h3>
        <p className="page-subtitle mb-6">{body}</p>
        <div className="flex gap-3">
          <button type="button" onClick={onCancel} className="btn-secondary flex-1 py-3 rounded-xl font-bold text-sm">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`flex-1 py-3 text-white rounded-xl font-bold text-sm transition-all disabled:opacity-60 flex items-center justify-center gap-2 ${confirmClass}`}
          >
            {loading ? <><i className="fas fa-spinner fa-spin text-xs"></i>Please wait…</> : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

function EmailChipInput({ label, helper, value, onChange, required }) {
  const [raw, setRaw] = useState('')

  const parse = (text) => {
    const list = text
      .split(/[,;\s\n]+/)
      .map((e) => e.trim())
      .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
    onChange([...new Set([...value, ...list])])
  }

  const onKeyDown = (e) => {
    if (['Enter', ',', ';', ' '].includes(e.key)) {
      e.preventDefault()
      parse(raw)
      setRaw('')
    }
  }

  const remove = (email) => onChange(value.filter((x) => x !== email))

  return (
    <div>
      <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wider">
        {label}{required && <span className="text-red-500 ml-1">*</span>}
        {helper && <span className="normal-case text-slate-400 font-normal ml-1">{helper}</span>}
      </label>
      <div className="relative">
        <input
          type="text"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => { if (raw) { parse(raw); setRaw('') } }}
          placeholder="name@example.com  (press Enter or comma)"
          className="w-full px-4 py-3 bg-slate-50 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-indigo-200 focus:outline-none"
        />
        {value.length > 0 && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 bg-indigo-100 text-indigo-700 text-xs font-bold px-2 py-0.5 rounded-full">
            {value.length}
          </span>
        )}
      </div>
      {value.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {value.map((e) => (
            <span key={e} className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-50 text-indigo-700 text-xs font-semibold rounded-full">
              <i className="fas fa-envelope text-[10px]"></i>{e}
              <button type="button" onClick={() => remove(e)}>
                <i className="fas fa-xmark text-[10px] hover:text-red-500"></i>
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}


function FileSelector({ files, loading, selectedFiles, onToggle }) {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    if (!search.trim()) return files
    const q = search.toLowerCase()
    return files.filter(
      (f) => f.original_name?.toLowerCase().includes(q) || f.mime_type?.toLowerCase().includes(q),
    )
  }, [files, search])

  return (
    <div>
      <label className="block text-xs font-bold text-slate-600 mb-2 uppercase tracking-wider">
        Files *{' '}
        <span className="normal-case text-slate-400 font-normal">
          (select one for a direct link · two or more for a ZIP bundle)
        </span>
      </label>
      <div className="relative mb-2">
        <i className="fas fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or type…"
          className="w-full pl-8 pr-9 py-2.5 bg-slate-50 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-indigo-200 focus:outline-none"
        />
        {search && (
          <button type="button" onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
            <i className="fas fa-xmark text-xs"></i>
          </button>
        )}
      </div>
      <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100 bg-white">
        {loading ? (
          <div className="flex items-center justify-center py-10 text-slate-400">
            <i className="fas fa-spinner fa-spin mr-2"></i>Loading your files…
          </div>
        ) : files.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">No files found. Upload files first.</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">No files match "{search}"</p>
        ) : (
          filtered.map((f) => {
            const checked = selectedFiles.includes(f.id)
            return (
              <label key={f.id} className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-slate-50 transition-colors ${checked ? 'bg-indigo-50' : ''}`}>
                <input type="checkbox" checked={checked} onChange={() => onToggle(f.id)} className="w-4 h-4 rounded accent-indigo-600 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-700 truncate font-medium">{f.original_name}</p>
                  <p className="text-[10px] text-slate-400">{f.mime_type || 'Unknown type'}</p>
                </div>
                <span className="text-xs text-slate-400 flex-shrink-0">{f.file_size_display}</span>
              </label>
            )
          })
        )}
      </div>
      {selectedFiles.length > 0 && (
        <p className="text-xs text-indigo-600 font-semibold mt-1.5 flex items-center gap-1">
          <i className="fas fa-check-circle"></i>
          {selectedFiles.length} file{selectedFiles.length !== 1 ? 's' : ''} selected
        </p>
      )}
    </div>
  )
}


function Pagination({ currentPage, totalPages, count, onPageChange, loading, label }) {
  if (!totalPages || totalPages <= 1) return null
  return (
    <div className="flex items-center justify-center gap-2 pt-2 flex-wrap">
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage <= 1 || loading}
        className="flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
      >
        <i className="fas fa-chevron-left text-[10px]"></i> Prev
      </button>
      <span className="text-xs text-slate-500 font-medium px-2">
        {label && <span className="text-slate-400 mr-1">{label} ·</span>}
        Page {currentPage} of {totalPages}
        {count != null && <span className="text-slate-400 ml-1">({fmt(count)} total)</span>}
      </span>
      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage >= totalPages || loading}
        className="flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
      >
        Next <i className="fas fa-chevron-right text-[10px]"></i>
      </button>
    </div>
  )
}


function FileViewerModal({ file, onClose }) {
  const isImage = file.mime_type?.startsWith('image/')
  const isPdf   = file.mime_type === 'application/pdf'
  const isText  = file.mime_type?.startsWith('text/')
  const isVideo = file.mime_type?.startsWith('video/')
  const isAudio = file.mime_type?.startsWith('audio/')

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-panel w-full max-w-4xl max-h-[90vh] mx-2 sm:mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center flex-shrink-0">
              <i className="fas fa-eye text-emerald-600 text-sm"></i>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-900 truncate">{file.original_filename}</p>
              <p className="text-xs text-slate-400">{file.mime_type} · <ScanBadge status="safe" /></p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button type="button" onClick={onClose} className="chrome-icon-btn">
              <i className="fas fa-xmark" aria-hidden />
            </button>
          </div>
        </div>
        <div className="modal-body bg-slate-50 dark:bg-transparent">
          {isImage && (
            <div className="flex items-center justify-center h-full min-h-64">
              <img src={file.file_url} alt={file.original_filename} className="max-w-full max-h-[70vh] object-contain rounded-xl shadow-md" />
            </div>
          )}
          {isPdf && <iframe src={file.file_url} className="w-full h-[60vh] sm:h-[70vh] rounded-xl border border-slate-200" title={file.original_filename} />}
          {isVideo && (
            <div className="flex items-center justify-center">
              <video controls className="max-w-full max-h-[70vh] rounded-xl shadow-md">
                <source src={file.file_url} type={file.mime_type} />
              </video>
            </div>
          )}
          {isAudio && (
            <div className="flex items-center justify-center p-8">
              <audio controls className="w-full max-w-lg">
                <source src={file.file_url} type={file.mime_type} />
              </audio>
            </div>
          )}
          {isText && (
            <div className="card rounded-xl p-4">
              <p className="text-xs text-slate-500 mb-3 flex items-center gap-2">
                <i className="fas fa-file-lines text-slate-400"></i>
                Text preview — <a href={file.file_url} className="text-indigo-600 hover:underline">open full file</a>
              </p>
              <iframe src={file.file_url} className="w-full h-96 border-0" title={file.original_filename} />
            </div>
          )}
          {!isImage && !isPdf && !isVideo && !isAudio && !isText && (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <i className="fas fa-file text-5xl mb-4 text-slate-300"></i>
              <p className="text-sm font-semibold text-slate-600 mb-1">Preview not available</p>
              <p className="text-xs text-slate-400 mb-4">This file type cannot be previewed in the browser.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function SaveToStorageModal({ submission, onCancel, onConfirm, loading }) {
  const defaultName = submission?.original_filename || ''
  const [filename, setFilename] = useState(defaultName)
  const isValid = filename.trim().length > 0

  return (
    <div className="modal-overlay">
      <div className="modal-panel p-6 max-w-sm w-full mx-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 bg-emerald-50 rounded-xl flex items-center justify-center flex-shrink-0">
            <i className="fas fa-floppy-disk text-emerald-600"></i>
          </div>
          <div>
            <h3 className="section-title text-base leading-tight">Save to Storage</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">Optionally rename before saving permanently</p>
          </div>
        </div>

        <div className="mb-5">
          <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wider">
            File Name
          </label>
          <input
            type="text"
            value={filename}
            onChange={(e) => setFilename(e.target.value)}
            className="w-full px-4 py-3 bg-slate-50 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-emerald-200 focus:outline-none"
            placeholder="Enter file name…"
            autoFocus
          />
          {!isValid && (
            <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
              <i className="fas fa-circle-exclamation text-[10px]"></i>File name cannot be empty.
            </p>
          )}
        </div>

        <div className="px-3 py-2.5 bg-blue-50 rounded-xl border border-blue-100 text-xs text-blue-700 mb-5 flex items-start gap-2">
          <i className="fas fa-info-circle mt-0.5 flex-shrink-0"></i>
          <span>This file will be moved from the inbox into your permanent storage. This action cannot be undone.</span>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="btn-secondary flex-1 py-3 rounded-xl font-bold text-sm"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(filename.trim())}
            disabled={loading || !isValid}
            className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm transition-all disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {loading
              ? <><i className="fas fa-spinner fa-spin text-xs"></i>Saving…</>
              : <><i className="fas fa-floppy-disk text-xs"></i>Save to Storage</>
            }
          </button>
        </div>
      </div>
    </div>
  )
}

function FormModal({ title, subtitle, icon, iconBg, onClose, children, maxWidth = 'max-w-2xl' }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-6"
      style={{ background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        className={`relative w-full ${maxWidth} bg-white dark:bg-slate-900 rounded-3xl shadow-2xl flex flex-col max-h-[90vh] form-modal-enter`}
        style={{ boxShadow: '0 32px 80px -12px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.08)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 sm:gap-4 px-4 sm:px-6 py-4 sm:py-5 border-b border-slate-100 dark:border-slate-800 flex-shrink-0">
          <div className={`w-9 h-9 sm:w-10 sm:h-10 ${iconBg} rounded-2xl flex items-center justify-center flex-shrink-0 shadow-sm`}>
            <i className={`fas ${icon} text-sm`}></i>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 leading-tight">{title}</h2>
            {subtitle && <p className="text-xs text-slate-400 mt-0.5 leading-tight line-clamp-1">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 hover:text-slate-700 transition-all flex-shrink-0"
            aria-label="Close"
          >
            <i className="fas fa-xmark text-sm"></i>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-4 sm:px-6 py-4 sm:py-6 custom-scrollbar">
          {children}
        </div>
      </div>

      <style>{`
        @keyframes formModalEnter {
          from { opacity: 0; transform: translateY(20px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)    scale(1);    }
        }
        .form-modal-enter { animation: formModalEnter 0.22s cubic-bezier(0.34,1.56,0.64,1) both; }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 99px; }
      `}</style>
    </div>
  )
}


function SharesPanel() {
  const dispatch = useDispatch()
  const {
    allFiles, allFilesLoading,
    shares, pagination, sharing,
    zipShares, zipPagination, zipSharing,
    error,
  } = useSelector((s) => s.sharing)

  const [showForm,        setShowForm]        = useState(false)
  const [singlesPage,     setSinglesPage]     = useState(1)
  const [zipsPage,        setZipsPage]        = useState(1)
  const [successMsg,      setSuccessMsg]      = useState('')
  const [emails,          setEmails]          = useState([])
  const [selectedFiles,   setSelectedFiles]   = useState([])
  const [actionConfirm,   setActionConfirm]   = useState(null)
  const [actionLoading,   setActionLoading]   = useState(false)
  const [initialLoaded,   setInitialLoaded]   = useState(false)
  const [formSubmitting,  setFormSubmitting]  = useState(false)

  const { register: field, handleSubmit, reset } = useForm({
    defaultValues: { expiration_hours: 24, message: '', zip_name: 'shared_files' },
  })

  useEffect(() => { dispatch(fetchAllFiles()) }, [dispatch])

  useEffect(() => {
    dispatch(fetchShares({ page: singlesPage })).then(() => setInitialLoaded(true))
  }, [dispatch, singlesPage])

  useEffect(() => {
    dispatch(fetchZipShares({ page: zipsPage }))
  }, [dispatch, zipsPage])

  const toggleFile = (id) =>
    setSelectedFiles((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])

  const isZipMode    = selectedFiles.length >= 2
  const isSingleMode = selectedFiles.length === 1
  const isFormValid  = emails.length > 0 && selectedFiles.length >= 1
  const isSubmitting = sharing || zipSharing || formSubmitting

  const flash = (msg) => {
    setSuccessMsg(msg)
    setTimeout(() => setSuccessMsg(''), 8000)
  }

  const onSubmit = async (data) => {
    if (!isFormValid || formSubmitting) return
    setFormSubmitting(true)

    try {
      let result
      if (isZipMode) {
        result = await dispatch(createZipShare({
          file_ids:         selectedFiles,
          recipient_emails: emails,
          expiration_hours: Number(data.expiration_hours),
          message:          data.message || '',
          zip_name:         (data.zip_name || 'shared_files').replace(/\.zip$/i, '') + '.zip',
        }))
        if (createZipShare.fulfilled.match(result)) {
          const p = result.payload
          flash(`✓ ${p.file_count} files bundled into ${p.count} unique ZIP link${p.count !== 1 ? 's' : ''}. Each recipient received their own private download link by email.`)
        } else {
          flash(`⚠ ZIP share failed: ${result.payload || 'Unknown error'}`)
        }
      } else {
        result = await dispatch(share({
          file_id:          selectedFiles[0],
          recipient_emails: emails,
          expiration_hours: Number(data.expiration_hours),
          message:          data.message || '',
        }))
        if (share.fulfilled.match(result)) {
          const count = result.payload.count ?? 0
          flash(`✓ File shared with ${emails.length} recipient${emails.length !== 1 ? 's' : ''}. ${count} unique private link${count !== 1 ? 's' : ''} sent by email.`)
        } else {
          flash(`⚠ Share failed: ${result.payload || 'Unknown error'}`)
        }
      }

      reset()
      setEmails([])
      setSelectedFiles([])
      setShowForm(false)
      setSinglesPage(1)
      setZipsPage(1)
      await Promise.all([
        dispatch(fetchShares({ page: 1 })),
        dispatch(fetchZipShares({ page: 1 })),
      ])
    } finally {
      setFormSubmitting(false)
    }
  }

  const handleConfirmAction = async () => {
    if (!actionConfirm) return
    setActionLoading(true)
    const { id, type, action } = actionConfirm
    try {
      if (action === 'revoke') {
        type === 'zip' ? await dispatch(revokeZipShare(id)) : await dispatch(revoke(id))
      } else {
        type === 'zip' ? await dispatch(deleteZipShare(id)) : await dispatch(deleteShare(id))
      }
      await Promise.all([
        dispatch(fetchShares({ page: singlesPage })),
        dispatch(fetchZipShares({ page: zipsPage })),
      ])
    } finally {
      setActionLoading(false)
      setActionConfirm(null)
    }
  }

  const allShares = useMemo(() => {
    const singles = (shares || []).map((s) => ({ ...s, _type: 'single' }))
    const zips    = (zipShares || []).map((z) => ({ ...z, _type: 'zip' }))
    return [...singles, ...zips].sort((a, b) => new Date(b.shared_at) - new Date(a.shared_at))
  }, [shares, zipShares])

  const singlesTotalPages = pagination?.total_pages    || 1
  const singlesCount      = pagination?.count          || 0
  const zipsTotalPages    = zipPagination?.total_pages || 1
  const zipsCount         = zipPagination?.count       || 0

  const showSpinner = !initialLoaded && (sharing || zipSharing)

  const closeForm = () => {
    setShowForm(false)
    reset()
    setEmails([])
    setSelectedFiles([])
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Shared Files</h2>
          <p className="text-sm text-slate-500">1 file → private download link per recipient · 2+ files → ZIP bundle per recipient</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="self-start sm:self-auto flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all shadow-sm"
        >
          <i className="fas fa-share-nodes"></i>
          Share Files
        </button>
      </div>

      {error      && <Alert type="error"   message={error}      className="rounded-xl" />}
      {successMsg && <Alert type="success" message={successMsg} className="rounded-xl" />}

      {showForm && (
        <FormModal
          title="Share Files"
          subtitle="1 file → private link per recipient · 2+ files → ZIP bundle per recipient"
          icon="fa-share-alt"
          iconBg="bg-indigo-100 text-indigo-600"
          onClose={closeForm}
          maxWidth="max-w-2xl"
        >
          <div className="space-y-5">
            <div className="flex items-start gap-2 px-3 py-2.5 bg-blue-50 rounded-xl border border-blue-100 text-xs text-blue-700">
              <i className="fas fa-shield-halved mt-0.5 flex-shrink-0"></i>
              <span>Share links are <strong>private and unique per recipient</strong>. Each link is sent by email — no public links are created. Links expire automatically.</span>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
              <FileSelector files={allFiles} loading={allFilesLoading} selectedFiles={selectedFiles} onToggle={toggleFile} />

              {selectedFiles.length > 0 && (
                <div className={`flex items-start gap-3 px-4 py-3 rounded-xl border text-xs font-semibold ${
                  isSingleMode ? 'bg-indigo-50 border-indigo-100 text-indigo-700' : 'bg-violet-50 border-violet-100 text-violet-700'
                }`}>
                  <i className={`fas ${isSingleMode ? 'fa-link' : 'fa-file-zipper'} text-sm mt-0.5 flex-shrink-0`}></i>
                  <span>
                    {isSingleMode
                      ? 'Single file mode — each recipient receives their own private download link'
                      : `ZIP bundle mode — ${selectedFiles.length} files will be bundled; each recipient gets one ZIP download link`}
                  </span>
                </div>
              )}

              {isZipMode && (
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wider">ZIP File Name</label>
                  <div className="flex items-stretch">
                    <input type="text" {...field('zip_name')} placeholder="shared_files" className="flex-1 px-4 py-3 bg-slate-50 rounded-l-xl border border-r-0 border-slate-200 text-sm focus:ring-2 focus:ring-indigo-200 focus:outline-none" />
                    <span className="px-3 py-3 bg-slate-100 rounded-r-xl text-sm text-slate-500 font-medium border border-l-0 border-slate-200">.zip</span>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wider">Expires After</label>
                <select {...field('expiration_hours')} className="w-full px-4 py-3 bg-slate-50 rounded-xl border border-slate-200 text-sm font-medium text-slate-800 focus:ring-2 focus:ring-indigo-200 focus:outline-none">
                  <option value="1">1 hour</option>
                  <option value="24">1 day</option>
                  <option value="72">3 days</option>
                  <option value="168">1 week</option>
                  <option value="720">30 days</option>
                </select>
              </div>

              <div>
                <EmailChipInput
                  label="Recipients"
                  helper="(required — each gets their own private link by email)"
                  value={emails}
                  onChange={setEmails}
                  required
                />
                {emails.length === 0 && (
                  <p className="text-xs text-amber-600 font-medium mt-1.5 flex items-center gap-1">
                    <i className="fas fa-circle-exclamation text-[10px]"></i>
                    At least one recipient email is required to share files.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wider">Message (optional)</label>
                <input type="text" {...field('message')} placeholder="Add a personal note shown in the email…" className="w-full px-4 py-3 bg-slate-50 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-indigo-200 focus:outline-none" />
              </div>

              {selectedFiles.length > 0 && emails.length > 0 && (
                <div className="flex items-start gap-3 px-4 py-3 bg-indigo-50 rounded-xl border border-indigo-100">
                  <i className="fas fa-info-circle text-indigo-400 mt-0.5 flex-shrink-0"></i>
                  <p className="text-xs text-indigo-700 leading-relaxed">
                    {isSingleMode
                      ? <><strong>{emails.length} unique private link{emails.length !== 1 ? 's' : ''}</strong> sent by email immediately. Links expire after the selected period.</>
                      : <><strong>{selectedFiles.length} files</strong> bundled into <strong>{emails.length} private ZIP archive{emails.length !== 1 ? 's' : ''}</strong> — one per recipient, sent by email.</>}
                  </p>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-3 pt-1">
                <button
                  type="submit"
                  disabled={isSubmitting || !isFormValid}
                  className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <><i className="fas fa-spinner fa-spin"></i>Sharing…</>
                  ) : isZipMode ? (
                    <><i className="fas fa-file-zipper"></i>Create ZIP Share ({selectedFiles.length} files · {emails.length || '…'} recipients)</>
                  ) : (
                    <><i className="fas fa-paper-plane"></i>Share with {emails.length || '…'} recipient{emails.length !== 1 ? 's' : ''}</>
                  )}
                </button>
                <button type="button" onClick={closeForm} className="sm:w-auto px-6 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold text-sm hover:bg-slate-200 transition-all">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </FormModal>
      )}

      {showSpinner ? (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <i className="fas fa-spinner fa-spin text-xl mr-2"></i>Loading shares…
        </div>
      ) : allShares.length === 0 ? (
        <Card className="p-12 text-center">
          <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <i className="fas fa-share-nodes text-2xl text-slate-400"></i>
          </div>
          <p className="text-slate-500 font-semibold">No shares yet</p>
          <p className="text-slate-400 text-sm mt-1">Share 1 file for a direct link, or 2+ files for a ZIP bundle.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {allShares.map((s) => {
            const isZip = s._type === 'zip'
            return (
              <Card key={`${s._type}-${s.id}`} className="p-4 sm:p-5">
                {/* top row: info + actions */}
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  {/* left: file info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${isZip ? 'bg-violet-100' : 'bg-indigo-100'}`}>
                        <i className={`fas ${isZip ? 'fa-file-zipper text-violet-600' : 'fa-file text-indigo-600'} text-xs`}></i>
                      </div>
                      {isZip ? (
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-900 truncate">{s.zip_name}</p>
                          <p className="text-[10px] text-violet-500 font-semibold">{s.file_count} files bundled</p>
                        </div>
                      ) : (
                        <p className="text-sm font-bold text-slate-900 truncate max-w-[180px] sm:max-w-xs">{s.file_name}</p>
                      )}
                      <StatusBadge status={s.status} />
                      {isZip && <span className="text-[10px] px-2 py-0.5 bg-violet-50 text-violet-600 rounded-full font-bold border border-violet-100">ZIP</span>}
                    </div>
                    <p className="text-xs text-slate-500 mt-1.5">
                      <i className="fas fa-envelope text-slate-400 mr-1"></i>{s.recipient_email}
                    </p>
                  </div>
                  {/* right: actions */}
                  <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
                    {s.status === 'active' && (
                      <button onClick={() => setActionConfirm({ id: s.id, type: s._type, action: 'revoke' })} className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 text-amber-700 rounded-lg text-xs font-semibold hover:bg-amber-100 transition-all border border-amber-100">
                        <i className="fas fa-ban text-[11px]"></i>Revoke
                      </button>
                    )}
                    <button onClick={() => setActionConfirm({ id: s.id, type: s._type, action: 'delete' })} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs font-semibold hover:bg-red-100 transition-all border border-red-100">
                      <i className="fas fa-trash text-[11px]"></i>Delete
                    </button>
                  </div>
                </div>

                {/* stats grid */}
                <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {[
                    ...(!isZip ? [] : [{ icon: 'fa-files', label: 'Files', value: s.file_count }]),
                    { icon: 'fa-download', label: 'Downloads', value: fmt(s.download_count) },
                    { icon: 'fa-calendar', label: 'Shared',    value: new Date(s.shared_at).toLocaleDateString() },
                    { icon: 'fa-clock',    label: 'Expires',   value: new Date(s.expires_at).toLocaleDateString() },
                  ].map(({ icon, label, value }) => (
                    <div key={label} className="bg-slate-50 rounded-xl px-3 py-2">
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1">
                        <i className={`fas ${icon} text-[9px]`}></i>{label}
                      </p>
                      <p className="text-sm font-bold text-slate-800 mt-0.5">{value}</p>
                    </div>
                  ))}
                </div>

                {isZip && s.files_info?.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Files in ZIP</p>
                    <div className="flex flex-wrap gap-1.5">
                      {s.files_info.map((f) => (
                        <span key={f.id} className="text-[10px] px-2 py-1 bg-violet-50 text-violet-700 rounded-lg font-medium">{f.original_name}</span>
                      ))}
                    </div>
                  </div>
                )}
                {s.has_been_accessed && (
                  <p className="mt-3 flex items-center gap-2 text-xs text-emerald-600">
                    <i className="fas fa-circle-check text-[10px]"></i>
                    {isZip ? 'ZIP downloaded' : 'File accessed'} · Last: {s.accessed_at ? new Date(s.accessed_at).toLocaleString() : '—'}
                  </p>
                )}
                {s.message && (
                  <div className="mt-3 px-4 py-2.5 bg-blue-50 border-l-2 border-blue-300 rounded-r-xl text-xs text-blue-800">
                    <i className="fas fa-comment-alt mr-1.5"></i>"{s.message}"
                  </div>
                )}
              </Card>
            )
          })}
          <Pagination
            currentPage={singlesPage}
            totalPages={singlesTotalPages}
            count={singlesCount}
            onPageChange={(p) => setSinglesPage(p)}
            loading={sharing}
            label="Single shares"
          />
          <Pagination
            currentPage={zipsPage}
            totalPages={zipsTotalPages}
            count={zipsCount}
            onPageChange={(p) => setZipsPage(p)}
            loading={zipSharing}
            label="ZIP shares"
          />
        </div>
      )}

      {actionConfirm && (
        <ConfirmModal
          title={actionConfirm.action === 'revoke' ? `Revoke this ${actionConfirm.type === 'zip' ? 'ZIP share' : 'share'}?` : `Delete this ${actionConfirm.type === 'zip' ? 'ZIP share' : 'share'}?`}
          body={actionConfirm.action === 'revoke' ? 'The recipient will no longer be able to download using this link. This cannot be undone.' : 'This share record will be permanently removed. The source files are not affected.'}
          confirmLabel={actionConfirm.action === 'revoke' ? 'Revoke' : 'Delete'}
          confirmClass={actionConfirm.action === 'revoke' ? 'bg-amber-500 hover:bg-amber-600' : 'bg-red-500 hover:bg-red-600'}
          loading={actionLoading}
          onCancel={() => setActionConfirm(null)}
          onConfirm={handleConfirmAction}
        />
      )}
    </div>
  )
}


function AnalyticsPanel() {
  const dispatch = useDispatch()
  const { globalAnalytics, analyticsLoading } = useSelector((s) => s.sharing)

  useEffect(() => { dispatch(fetchGlobalAnalytics()) }, [dispatch])

  if (analyticsLoading || !globalAnalytics) return (
    <div className="flex items-center justify-center py-20 text-slate-400">
      <i className="fas fa-spinner fa-spin text-2xl mr-3"></i>Loading analytics…
    </div>
  )

  const { totals, top_shares = [], single_file = {}, zip_shares = {} } = globalAnalytics

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Sharing Analytics</h2>
        <p className="text-sm text-slate-500">Aggregated stats across single-file shares and ZIP bundles.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        <StatTile icon="fa-share-nodes"  label="Total Shares"    value={fmt(totals?.total_shares)}    tint="indigo"  />
        <StatTile icon="fa-download"     label="Total Downloads" value={fmt(totals?.total_downloads)} tint="emerald" />
        <StatTile icon="fa-circle-check" label="Active"          value={fmt(totals?.active_count)}    tint="emerald" />
        <StatTile icon="fa-clock"        label="Expired"         value={fmt(totals?.expired_count)}   tint="amber"   />
        <StatTile icon="fa-ban"          label="Revoked"         value={fmt(totals?.revoked_count)}   tint="rose"    />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="p-4 sm:p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 bg-indigo-100 rounded-lg flex items-center justify-center"><i className="fas fa-file text-indigo-600 text-xs"></i></div>
            <h3 className="text-sm font-bold text-slate-800">Single-file Shares</h3>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Shares',    value: fmt(single_file?.total_shares) },
              { label: 'Downloads', value: fmt(single_file?.total_downloads) },
              { label: 'Active',    value: fmt(single_file?.active_count) },
              { label: 'Expired',   value: fmt(single_file?.expired_count) },
            ].map(({ label, value }) => (
              <div key={label} className="bg-slate-50 rounded-xl px-3 py-2">
                <p className="text-[10px] text-slate-400 font-bold uppercase">{label}</p>
                <p className="text-sm font-bold text-slate-800">{value}</p>
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-4 sm:p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 bg-violet-100 rounded-lg flex items-center justify-center"><i className="fas fa-file-zipper text-violet-600 text-xs"></i></div>
            <h3 className="text-sm font-bold text-slate-800">ZIP Bundle Shares</h3>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'ZIP Shares', value: fmt(zip_shares?.total_zip_shares) },
              { label: 'Downloads',  value: fmt(zip_shares?.total_zip_downloads) },
              { label: 'Active',     value: fmt(zip_shares?.zip_active) },
              { label: 'Expired',    value: fmt(zip_shares?.zip_expired) },
            ].map(({ label, value }) => (
              <div key={label} className="bg-slate-50 rounded-xl px-3 py-2">
                <p className="text-[10px] text-slate-400 font-bold uppercase">{label}</p>
                <p className="text-sm font-bold text-slate-800">{value}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {top_shares.length > 0 && (
        <Card className="overflow-hidden">
          <div className="px-4 sm:px-6 py-4 border-b border-slate-100 flex items-center gap-2">
            <i className="fas fa-trophy text-amber-500"></i>
            <h3 className="text-sm font-bold text-slate-900">Top Single-file Shares by Downloads</h3>
          </div>
          <div className="divide-y divide-slate-50">
            {top_shares.map((s, i) => (
              <div key={s.id} className="flex items-center gap-3 sm:gap-4 px-4 sm:px-6 py-4 flex-wrap sm:flex-nowrap">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 ${i === 0 ? 'bg-amber-100 text-amber-700' : i === 1 ? 'bg-slate-100 text-slate-600' : 'bg-orange-50 text-orange-600'}`}>{i + 1}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{s.file_name}</p>
                  <p className="text-xs text-slate-400 truncate">{s.recipient_email}</p>
                </div>
                <div className="flex items-center gap-3 sm:gap-4 text-xs flex-shrink-0">
                  <span className="flex items-center gap-1 text-emerald-600 font-semibold"><i className="fas fa-download text-[10px]"></i>{fmt(s.download_count)}</span>
                  <StatusBadge status={s.status} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}


function RequestsPanel() {
  const dispatch = useDispatch()
  const { requests, requestLoading, requestPagination, error } = useSelector((s) => s.sharing)

  const [showForm,        setShowForm]        = useState(false)
  const [closeConfirm,    setCloseConfirm]    = useState(null)
  const [successMsg,      setSuccessMsg]      = useState('')
  const [recipientEmails, setRecipientEmails] = useState([])
  const [currentPage,     setCurrentPage]     = useState(1)
  const [emailError,      setEmailError]      = useState('')
  const [initialLoaded,   setInitialLoaded]   = useState(false)
  const [formSubmitting,  setFormSubmitting]  = useState(false)

  const { register: field, handleSubmit, reset, formState: { errors } } = useForm({
    mode: 'onTouched',
    defaultValues: { expiration_hours: 168, max_files: 10, title: '', description: '', allowed_extensions: '' },
  })

  useEffect(() => {
    const load = async () => {
      await dispatch(fetchRequests({ page: currentPage }))
      setInitialLoaded(true)
    }
    load()
  }, [dispatch, currentPage])

  const isSubmitting = formSubmitting || requestLoading

  const validateAndSubmit = (data) => {
    if (recipientEmails.length === 0) {
      setEmailError('At least one recipient email is required. Upload links are sent by email only.')
      return
    }
    setEmailError('')
    onSubmit(data)
  }

  const onSubmit = async (data) => {
    if (formSubmitting) return
    setFormSubmitting(true)

    const allowedExt = data.allowed_extensions
      ? data.allowed_extensions.split(/[,\s]+/).map((e) => e.trim().replace(/^\./, '').toLowerCase()).filter(Boolean)
      : []

    const perRecipientMax = Number(data.max_files)

    const payload = {
      title:              data.title,
      description:        data.description || '',
      recipient_emails:   recipientEmails,
      recipient_email:    '',
      expiration_hours:   Number(data.expiration_hours),
      max_files:          perRecipientMax,
      allowed_extensions: allowedExt,
    }

    try {
      const result = await dispatch(createRequest(payload))
      if (createRequest.fulfilled.match(result)) {
        reset()
        setRecipientEmails([])
        setShowForm(false)
        const count = recipientEmails.length
        setSuccessMsg(
          `✓ File request created. ${count} unique upload link${count !== 1 ? 's' : ''} sent by email to ${count} recipient${count !== 1 ? 's' : ''}. Each recipient can upload up to ${perRecipientMax} file${perRecipientMax !== 1 ? 's' : ''}.`
        )
        setTimeout(() => setSuccessMsg(''), 10000)
        setCurrentPage(1)
        await dispatch(fetchRequests({ page: 1 }))
      }
    } finally {
      setFormSubmitting(false)
    }
  }

  const handleClose = async (id) => {
    await dispatch(closeRequest(id))
    setCloseConfirm(null)
    await dispatch(fetchRequests({ page: currentPage }))
  }

  const totalPages = requestPagination?.total_pages || 1
  const totalCount = requestPagination?.count || 0
  const showSpinner = !initialLoaded && requestLoading

  const closeForm = () => {
    setShowForm(false)
    reset()
    setRecipientEmails([])
    setEmailError('')
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">File Requests</h2>
          <p className="text-sm text-slate-500">Ask recipients to upload files — upload links delivered by email only.</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="self-start sm:self-auto flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all shadow-sm"
        >
          <i className="fas fa-plus"></i>
          New Request
        </button>
      </div>

      {error      && <Alert type="error"   message={error}      className="rounded-xl" />}
      {successMsg && <Alert type="success" message={successMsg} className="rounded-xl" />}

      {showForm && (
        <FormModal
          title="Create Upload Request"
          subtitle="Ask recipients to upload files via a secure, email-delivered link"
          icon="fa-inbox"
          iconBg="bg-indigo-100 text-indigo-600"
          onClose={closeForm}
          maxWidth="max-w-2xl"
        >
          <div className="space-y-5">
            <div className="space-y-2">
              <div className="flex items-start gap-2 px-3 py-2.5 bg-blue-50 rounded-xl border border-blue-100 text-xs text-blue-700">
                <i className="fas fa-shield-halved mt-0.5 flex-shrink-0"></i>
                <span><strong>Email delivery only</strong> — upload links are sent directly to recipients and are not publicly accessible. Each recipient gets a unique, single-use link.</span>
              </div>
              <div className="flex items-start gap-2 px-3 py-2.5 bg-amber-50 rounded-xl border border-amber-100 text-xs text-amber-700">
                <i className="fas fa-virus-slash mt-0.5 flex-shrink-0"></i>
                <span>All uploaded files are <strong>automatically scanned for security</strong> before they appear in your inbox. Infected files are quarantined and flagged immediately.</span>
              </div>
              <div className="flex items-start gap-2 px-3 py-2.5 bg-emerald-50 rounded-xl border border-emerald-100 text-xs text-emerald-700">
                <i className="fas fa-key mt-0.5 flex-shrink-0"></i>
                <span>Recipients must <strong>verify their email via a one-time code (OTP)</strong> before they can upload. This ensures only the intended person can use each upload link.</span>
              </div>
            </div>

            <form onSubmit={handleSubmit(validateAndSubmit)} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wider">Title *</label>
                <input
                  type="text"
                  {...field('title', { required: 'Title is required.' })}
                  placeholder="e.g. Q4 Invoice Submission"
                  className={`w-full px-4 py-3 bg-slate-50 rounded-xl border text-sm focus:ring-2 focus:ring-indigo-200 focus:outline-none ${errors.title ? 'border-red-300 ring-2 ring-red-100' : 'border-slate-200'}`}
                />
                {errors.title && <p className="text-red-500 text-xs mt-1">{errors.title.message}</p>}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wider">Description</label>
                <textarea {...field('description')} rows={3} placeholder="What files do you need? Any specific requirements?" className="w-full px-4 py-3 bg-slate-50 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-indigo-200 focus:outline-none resize-none" />
              </div>

              <div>
                <EmailChipInput
                  label="Recipients"
                  helper="(required — each gets their own unique upload link by email)"
                  value={recipientEmails}
                  onChange={(v) => { setRecipientEmails(v); if (v.length > 0) setEmailError('') }}
                  required
                />
                {emailError && (
                  <div className="mt-2 flex items-start gap-2 px-3 py-2 bg-red-50 rounded-xl border border-red-200 text-xs text-red-700">
                    <i className="fas fa-circle-exclamation mt-0.5 flex-shrink-0"></i>
                    <span>{emailError}</span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wider">Expires After</label>
                  <select {...field('expiration_hours')} className="w-full px-4 py-3 bg-slate-50 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-indigo-200 focus:outline-none">
                    <option value="24">1 day</option>
                    <option value="72">3 days</option>
                    <option value="168">1 week</option>
                    <option value="720">30 days</option>
                    <option value="8760">1 year</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wider">
                    Max Files Per Recipient
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    {...field('max_files')}
                    className="w-full px-4 py-3 bg-slate-50 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-indigo-200 focus:outline-none"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    <i className="fas fa-info-circle mr-1"></i>Each recipient gets this many upload slots independently.
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wider">
                  Allowed File Types <span className="normal-case text-slate-400 font-normal">(optional — leave blank to accept all safe types)</span>
                </label>
                <input
                  type="text"
                  {...field('allowed_extensions')}
                  placeholder="e.g. pdf, docx, jpg, png"
                  className="w-full px-4 py-3 bg-slate-50 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-indigo-200 focus:outline-none"
                />
                <p className="text-xs text-slate-400 mt-1">Separate with commas. Executable files (.exe, .sh, .bat…) are always blocked.</p>
              </div>

              {recipientEmails.length > 0 && (
                <div className="flex items-start gap-3 px-4 py-3 bg-emerald-50 rounded-xl border border-emerald-100">
                  <i className="fas fa-check-circle text-emerald-500 mt-0.5 flex-shrink-0"></i>
                  <p className="text-xs text-emerald-700 leading-relaxed">
                    <strong>{recipientEmails.length} private upload link{recipientEmails.length !== 1 ? 's' : ''}</strong> will be sent by email. Each recipient must verify via OTP before uploading. All uploads are security-scanned before delivery.
                  </p>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-3 pt-1">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition-all disabled:opacity-60 flex items-center justify-center gap-2 shadow-sm"
                >
                  {isSubmitting ? (
                    <><i className="fas fa-spinner fa-spin text-sm"></i>Sending…</>
                  ) : (
                    <><i className="fas fa-paper-plane"></i>Create &amp; Send {recipientEmails.length > 0 ? `(${recipientEmails.length} recipient${recipientEmails.length !== 1 ? 's' : ''})` : 'Request'}</>
                  )}
                </button>
                <button type="button" onClick={closeForm} className="sm:w-auto px-6 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold text-sm hover:bg-slate-200 transition-all">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </FormModal>
      )}

      {showSpinner ? (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <i className="fas fa-spinner fa-spin text-xl mr-2"></i>Loading…
        </div>
      ) : requests.length === 0 ? (
        <Card className="p-12 text-center">
          <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <i className="fas fa-inbox text-2xl text-slate-400"></i>
          </div>
          <p className="text-slate-500 font-semibold">No file requests yet</p>
          <p className="text-slate-400 text-sm mt-1">Create a request to collect files from anyone via a secure email link.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {requests.map((req) => {
            const recipients      = req.recipients || []
            const submissionCount = req.submission_count ?? 0
            const perRecipientMax = req.max_files ?? 0
            const recipientCount  = recipients.length || 1
            const totalMaxFiles   = perRecipientMax * recipientCount
            const allReceived     = totalMaxFiles > 0 && submissionCount >= totalMaxFiles

            return (
              <Card key={req.id} className="p-4 sm:p-5">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-slate-900">{req.title}</p>
                      <StatusBadge status={req.status} />
                      {req.is_expired && <span className="text-xs text-red-500 font-semibold">Expired</span>}
                      {totalMaxFiles > 0 && (
                        <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold border ${
                          allReceived
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-slate-50 text-slate-500 border-slate-200'
                        }`}>
                          <i className={`fas ${allReceived ? 'fa-circle-check' : 'fa-file'} text-[9px]`}></i>
                          {submissionCount}/{totalMaxFiles} received
                        </span>
                      )}
                    </div>
                    {req.description && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{req.description}</p>}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[11px] text-slate-400">
                      {req.expires_at && (
                        <span><i className="fas fa-clock mr-1"></i>Expires {new Date(req.expires_at).toLocaleDateString()}</span>
                      )}
                      {recipients.length > 0 && (
                        <span><i className="fas fa-users mr-1"></i>{recipients.length} recipient{recipients.length !== 1 ? 's' : ''}</span>
                      )}
                      {perRecipientMax > 0 && (
                        <span className="flex items-center gap-1">
                          <i className="fas fa-upload text-[10px]"></i>
                          {perRecipientMax} file{perRecipientMax !== 1 ? 's' : ''} max per recipient
                        </span>
                      )}
                      {req.allowed_extensions?.length > 0 && (
                        <span><i className="fas fa-filter mr-1"></i>{req.allowed_extensions.join(', ')}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {req.status === 'open' && (
                      <button onClick={() => setCloseConfirm(req.id)} className="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-xs font-semibold hover:bg-slate-200 transition-all">
                        Close
                      </button>
                    )}
                  </div>
                </div>

                {recipients.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                      Recipients · {recipients.length}
                      {perRecipientMax > 0 && (
                        <span className="ml-1.5 normal-case font-normal text-slate-300">
                          (each allowed {perRecipientMax} file{perRecipientMax !== 1 ? 's' : ''})
                        </span>
                      )}
                    </p>
                    <div className="space-y-1.5">
                      {recipients.map((r) => {
                        const filesUploaded = r.files_submitted ?? r.upload_count ?? 0
                        const isFull        = perRecipientMax > 0 && filesUploaded >= perRecipientMax

                        return (
                          <div key={r.id} className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-xl">
                            <i className="fas fa-user text-slate-300 text-[11px] flex-shrink-0"></i>
                            <span className="text-xs font-medium text-slate-700 truncate flex-1">{r.email}</span>
                            {filesUploaded > 0 ? (
                              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold flex-shrink-0 flex items-center gap-1 ${
                                isFull
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : 'bg-blue-50 text-blue-700'
                              }`}>
                                <i className={`fas ${isFull ? 'fa-circle-check' : 'fa-upload'} text-[9px]`}></i>
                                {filesUploaded}{perRecipientMax > 0 ? `/${perRecipientMax}` : ''} uploaded
                              </span>
                            ) : (
                              <span className="text-[10px] bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded-full font-medium flex-shrink-0">
                                0{perRecipientMax > 0 ? `/${perRecipientMax}` : ''} — awaiting
                              </span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {req.required_files?.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Required Files</p>
                    <div className="flex flex-wrap gap-1.5">
                      {req.required_files.map((f) => (
                        <span key={f} className="px-2 py-0.5 bg-amber-50 text-amber-700 text-[11px] font-semibold rounded-full border border-amber-100">{f}</span>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            )
          })}

          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            count={totalCount}
            onPageChange={(p) => setCurrentPage(p)}
            loading={requestLoading}
          />
        </div>
      )}

      {closeConfirm && (
        <ConfirmModal
          title="Close this request?"
          body="The upload link will no longer work. Existing submissions are preserved."
          confirmLabel="Close Request"
          confirmClass="bg-slate-700 hover:bg-slate-800"
          onCancel={() => setCloseConfirm(null)}
          onConfirm={() => handleClose(closeConfirm)}
        />
      )}
    </div>
  )
}


const SCAN_POLL_INTERVAL = 10000

function InboxPanel() {
  const dispatch = useDispatch()
  const { inbox, inboxLoading, inboxPagination, inboxStatusCounts, scanStatusCounts, deletingFile, removingItem } = useSelector((s) => s.sharing)

  const [activeStatus,    setActiveStatus]    = useState('')
  const [reviewModal,     setReviewModal]     = useState(null)
  const [deleteConfirm,   setDeleteConfirm]   = useState(null)
  const [viewFile,        setViewFile]        = useState(null)
  const [reviewNote,      setReviewNote]      = useState('')
  const [errorMsg,        setErrorMsg]        = useState('')
  const [currentPage,     setCurrentPage]     = useState(1)
  const [initialLoaded,   setInitialLoaded]   = useState(false)
  const [saveModal,       setSaveModal]       = useState(null)
  const [saveLoading,     setSaveLoading]     = useState(false)
  const [saveSuccessMsg,  setSaveSuccessMsg]  = useState('')

  const pollRef = useRef(null)

  const scanningIds = useMemo(
    () => inbox.filter((s) => s.scan_status === 'scanning' || s.scan_status === 'pending').map((s) => s.id),
    [inbox],
  )

  const hasScanning = scanningIds.length > 0

  const handleDownload = useCallback(async (downloadUrl, filename) => {
    const toastId = toast.loading(`Downloading ${filename || 'file'}...`)
    try {
      if (!downloadUrl) {
        toast.error('Download URL not available', { id: toastId })
        return
      }
      const response = await api.get(downloadUrl, { responseType: 'blob' })
      const blob = new Blob([response.data], { type: response.headers['content-type'] })
      const blobUrl = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = blobUrl
      link.download = filename || 'download'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(blobUrl)
      toast.success('Download successful!', { id: toastId })
    } catch (error) {
      console.error('Download failed:', error)
      toast.error('Download failed.', { id: toastId })
    }
  }, [])

  const loadInbox = useCallback(async () => {
    await dispatch(fetchInbox({ page: currentPage, status: activeStatus }))
    setInitialLoaded(true)
  }, [dispatch, currentPage, activeStatus])

  useEffect(() => {
    loadInbox()
  }, [loadInbox])

  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current)

    pollRef.current = setInterval(() => {
      dispatch(fetchInbox({ page: currentPage, status: activeStatus }))
    }, SCAN_POLL_INTERVAL)

    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [dispatch, currentPage, activeStatus])

  const handleReview = async () => {
    if (!reviewModal) return
    if (reviewModal.action === 'approve' && reviewModal.submission.scan_status !== 'safe') {
      setErrorMsg('Cannot approve: file has not passed security scanning yet.')
      setReviewModal(null)
      setTimeout(() => setErrorMsg(''), 5000)
      return
    }
    const result = await dispatch(reviewInboxItem({ id: reviewModal.submission.id, action: reviewModal.action, note: reviewNote }))
    if (reviewInboxItem.rejected.match(result)) {
      setErrorMsg(result.payload || 'Action failed.')
      setTimeout(() => setErrorMsg(''), 5000)
    }
    setReviewModal(null)
    setReviewNote('')
    loadInbox()
  }

  const handleDelete = async () => {
    if (!deleteConfirm) return
    const sub = deleteConfirm
    const isInfected = ['infected', 'scan_failed'].includes(sub.scan_status)
    let result
    if (isInfected) {
      result = await dispatch(deleteInfectedFile(sub.id))
      if (deleteInfectedFile.rejected.match(result)) {
        setErrorMsg(result.payload || 'Delete failed.')
        setTimeout(() => setErrorMsg(''), 5000)
      }
    } else {
      result = await dispatch(removeInboxItem(sub.id))
      if (removeInboxItem.rejected.match(result)) {
        setErrorMsg(result.payload || 'Delete failed.')
        setTimeout(() => setErrorMsg(''), 5000)
      }
    }
    setDeleteConfirm(null)
    loadInbox()
  }

  const handleSaveToStorage = async (filename) => {
    if (!saveModal) return
    setSaveLoading(true)
    try {
      await api.post(`/api/sharing/inbox/${saveModal.id}/save-to-storage/`, { filename })
      setSaveSuccessMsg(`✓ "${filename}" has been saved to your storage.`)
      setTimeout(() => setSaveSuccessMsg(''), 8000)
      setSaveModal(null)
      loadInbox()
      dispatch(fetchAllFiles())
    } catch (err) {
      setErrorMsg(err.response?.data?.detail || err.message || 'Failed to save file to storage.')
      setTimeout(() => setErrorMsg(''), 6000)
      setSaveModal(null)
    } finally {
      setSaveLoading(false)
    }
  }

  const sourceIcon = (src) =>
    ({ file_request: 'fa-inbox', direct_share: 'fa-share-alt', anonymous: 'fa-user-secret' }[src] || 'fa-file')

  const statusTabs = [
    { id: '',             label: 'All',      count: Object.values(inboxStatusCounts || {}).reduce((a, b) => a + b, 0) },
    { id: 'pending',      label: 'Pending',  count: inboxStatusCounts?.pending },
    { id: 'needs_action', label: 'Action',   count: inboxStatusCounts?.needs_action },
    { id: 'approved',     label: 'Approved', count: inboxStatusCounts?.approved },
    { id: 'rejected',     label: 'Rejected', count: inboxStatusCounts?.rejected },
    { id: 'complete',     label: 'Complete', count: inboxStatusCounts?.complete },
  ]

  const totalPages = inboxPagination?.total_pages || 1
  const totalCount = inboxPagination?.count || 0
  const showSpinner = !initialLoaded && inboxLoading

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Submission Inbox</h2>
          <p className="text-sm text-slate-500">Files submitted via your requests — review, view, download, or delete.</p>
        </div>
      </div>

      {scanStatusCounts && Object.keys(scanStatusCounts).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(scanStatusCounts).map(([s, n]) =>
            n > 0 && (
              <div key={s} className="flex items-center gap-1.5 px-3 py-1.5 bg-white rounded-xl border border-slate-100 shadow-sm">
                <ScanBadge status={s} />
                <span className="text-xs font-bold text-slate-600 ml-1">{n}</span>
              </div>
            )
          )}
        </div>
      )}

      {errorMsg       && <Alert type="error"   message={errorMsg}       className="rounded-xl" />}
      {saveSuccessMsg && <Alert type="success" message={saveSuccessMsg} className="rounded-xl" />}

      {/* Status filter tabs — horizontally scrollable on mobile */}
      <div
        className="flex flex-wrap gap-1.5 overflow-x-auto pb-1"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {statusTabs.map((t) => (
          <button
            key={t.id}
            onClick={() => { setActiveStatus(t.id); setCurrentPage(1) }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
              activeStatus === t.id
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
            }`}
          >
            {t.label}
            {t.count != null && t.count > 0 && (
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${activeStatus === t.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'}`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {showSpinner ? (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <i className="fas fa-spinner fa-spin text-xl mr-2"></i>Loading inbox…
        </div>
      ) : inbox.length === 0 ? (
        <Card className="p-12 text-center">
          <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <i className="fas fa-inbox text-2xl text-slate-400"></i>
          </div>
          <p className="text-slate-500 font-semibold">Inbox is empty</p>
          <p className="text-slate-400 text-sm mt-1">Files submitted via your requests will appear here.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {inbox.map((sub) => {
            const isInfected    = ['infected', 'scan_failed'].includes(sub.scan_status)
            const isSafe        = sub.scan_status === 'safe'
            const isScanning    = ['scanning', 'pending'].includes(sub.scan_status)
            const downloadable  = isSafe && sub.download_url
            const viewable      = isSafe && sub.file_url
            const isComplete    = sub.status === 'complete'
            const isNeedsAction = sub.status === 'needs_action'

            return (
              <Card key={sub.id} className={`p-4 sm:p-5 ${isInfected ? 'border-red-100 bg-red-50/30' : ''}`}>
                {/* top section: icon + info */}
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 ${isInfected ? 'bg-red-100' : isSafe ? 'bg-emerald-50' : 'bg-indigo-50'}`}>
                    <i className={`fas ${isInfected ? 'fa-bug text-red-500' : isSafe ? 'fa-shield-halved text-emerald-500' : sourceIcon(sub.source_type) + ' text-indigo-500'}`}></i>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-slate-900 truncate max-w-full sm:max-w-xs">{sub.original_filename}</p>
                      <StatusBadge status={sub.status} />
                      <ScanBadge status={sub.scan_status} />
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[11px] text-slate-400">
                      {sub.submitter_email && <span className="truncate max-w-[160px] sm:max-w-none"><i className="fas fa-envelope mr-1"></i>{sub.submitter_email}</span>}
                      {sub.submitter_name  && <span><i className="fas fa-user mr-1"></i>{sub.submitter_name}</span>}
                      {sub.request_title   && <span className="truncate max-w-[120px] sm:max-w-none"><i className="fas fa-inbox mr-1"></i>{sub.request_title}</span>}
                      <span><i className="fas fa-clock mr-1"></i>{new Date(sub.submitted_at).toLocaleString()}</span>
                    </div>
                    {isInfected && sub.scan_result && (
                      <div className="mt-2 px-3 py-2 bg-red-50 rounded-lg border border-red-100 text-xs text-red-700 flex items-start gap-1.5">
                        <i className="fas fa-triangle-exclamation mt-0.5 flex-shrink-0"></i>
                        <span>{sub.scan_result}</span>
                      </div>
                    )}
                    {sub.review_note && (
                      <p className="mt-1.5 text-xs text-slate-500 bg-slate-50 px-3 py-1.5 rounded-lg">{sub.review_note}</p>
                    )}
                    {sub.rejection_reason && (
                      <p className="mt-1.5 text-xs text-red-600 bg-red-50 px-3 py-1.5 rounded-lg">
                        <i className="fas fa-circle-exclamation mr-1"></i>{sub.rejection_reason}
                      </p>
                    )}
                    {isComplete && !sub.saved_to_storage && (
                      <div className="mt-2 px-3 py-2 bg-emerald-50 rounded-lg border border-emerald-100 text-xs text-emerald-700 flex items-center gap-1.5">
                        <i className="fas fa-circle-info flex-shrink-0"></i>
                        <span>This file is processed and ready to be saved permanently to your storage.</span>
                      </div>
                    )}
                    {isComplete && sub.saved_to_storage && (
                      <div className="mt-2 px-3 py-2 bg-blue-50 rounded-lg border border-blue-100 text-xs text-blue-700 flex items-center gap-1.5">
                        <i className="fas fa-circle-check flex-shrink-0"></i>
                        <span>Saved to storage{sub.saved_filename ? ` as "${sub.saved_filename}"` : ''}.</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* action buttons — full width below, wrapping */}
                <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-1.5 flex-wrap">
                  {viewable && (
                    <button onClick={() => setViewFile(sub)} className="flex items-center gap-1 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-bold hover:bg-blue-100 transition-all">
                      <i className="fas fa-eye text-[10px]"></i> View
                    </button>
                  )}
                  {downloadable && (
                    <button onClick={() => handleDownload(sub.download_url, sub.original_filename)} className="flex items-center gap-1 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-bold hover:bg-emerald-100 transition-all">
                      <i className="fas fa-download text-[10px]"></i> Download
                    </button>
                  )}
                  {isScanning && (
                    <span className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-xs font-semibold">
                      <i className="fas fa-spinner fa-spin text-[10px]"></i>Scanning
                    </span>
                  )}

                  {sub.status === 'pending' && !isInfected && (
                    <>
                      <button
                        onClick={() => { setReviewModal({ submission: sub, action: 'approve' }); setReviewNote('') }}
                        disabled={!isSafe}
                        title={!isSafe ? 'Wait for security scan to complete' : undefined}
                        className="flex items-center gap-1 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-bold hover:bg-emerald-100 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <i className="fas fa-check text-[10px]"></i> Approve
                      </button>
                      <button
                        onClick={() => { setReviewModal({ submission: sub, action: 'needs_action' }); setReviewNote('') }}
                        className="flex items-center gap-1 px-3 py-1.5 bg-orange-50 text-orange-600 rounded-lg text-xs font-bold hover:bg-orange-100 transition-all"
                      >
                        <i className="fas fa-flag text-[10px]"></i> Flag
                      </button>
                      <button
                        onClick={() => { setReviewModal({ submission: sub, action: 'reject' }); setReviewNote('') }}
                        className="flex items-center gap-1 px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs font-bold hover:bg-red-100 transition-all"
                      >
                        <i className="fas fa-xmark text-[10px]"></i> Reject
                      </button>
                    </>
                  )}

                  {isNeedsAction && !isInfected && (
                    <>
                      <span className="flex items-center gap-1 text-[10px] font-bold text-orange-500 bg-orange-50 border border-orange-100 px-2 py-1 rounded-lg">
                        <i className="fas fa-flag text-[9px]"></i>Flagged
                      </span>
                      <button
                        onClick={() => { setReviewModal({ submission: sub, action: 'approve' }); setReviewNote('') }}
                        disabled={!isSafe}
                        title={!isSafe ? 'Wait for security scan to complete' : undefined}
                        className="flex items-center gap-1 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-bold hover:bg-emerald-100 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <i className="fas fa-check text-[10px]"></i> Approve
                      </button>
                      <button
                        onClick={() => { setReviewModal({ submission: sub, action: 'reject' }); setReviewNote('') }}
                        className="flex items-center gap-1 px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs font-bold hover:bg-red-100 transition-all"
                      >
                        <i className="fas fa-xmark text-[10px]"></i> Reject
                      </button>
                    </>
                  )}

                  {sub.status === 'approved' && (
                    <button
                      onClick={() => { setReviewModal({ submission: sub, action: 'complete' }); setReviewNote('') }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-bold hover:bg-blue-100 transition-all"
                    >
                      <i className="fas fa-circle-check text-[10px]"></i> Complete
                    </button>
                  )}

                  {isComplete && isSafe && !sub.saved_to_storage && (
                    <button
                      onClick={() => setSaveModal(sub)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 transition-all shadow-sm"
                    >
                      <i className="fas fa-floppy-disk text-[10px]"></i> Save to Storage
                    </button>
                  )}

                  <button
                    onClick={() => setDeleteConfirm(sub)}
                    disabled={deletingFile || removingItem}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-40 ${
                      isInfected ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                    title={isInfected ? 'Permanently delete infected file' : 'Delete this file from inbox'}
                  >
                    <i className="fas fa-trash text-[10px]"></i>
                    {isInfected ? 'Delete' : 'Remove'}
                  </button>
                </div>
              </Card>
            )
          })}

          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            count={totalCount}
            onPageChange={(p) => setCurrentPage(p)}
            loading={inboxLoading}
          />
        </div>
      )}

      {reviewModal && (
        <div className="modal-overlay">
          <div className="modal-panel p-6 max-w-md w-full mx-4">
            <h3 className="section-title text-base mb-1 capitalize">{reviewModal.action.replace(/_/g, ' ')} Submission</h3>
            <p className="page-subtitle mb-4">File: <span className="font-semibold text-gray-800 dark:text-gray-200">{reviewModal.submission.original_filename}</span></p>
            <textarea
              value={reviewNote}
              onChange={(e) => setReviewNote(e.target.value)}
              placeholder={reviewModal.action === 'reject' ? 'Rejection reason (recommended)…' : 'Optional note…'}
              rows={3}
              className="field w-full resize-none mb-4"
            />
            <div className="flex gap-3">
              <button type="button" onClick={() => setReviewModal(null)} className="btn-secondary flex-1 py-3 rounded-xl font-bold text-sm">Cancel</button>
              <button
                onClick={handleReview}
                className={`flex-1 py-3 text-white rounded-xl font-bold text-sm transition-all ${
                  reviewModal.action === 'reject'   ? 'bg-red-500 hover:bg-red-600'
                  : reviewModal.action === 'approve'  ? 'bg-emerald-500 hover:bg-emerald-600'
                  : reviewModal.action === 'complete' ? 'bg-blue-500 hover:bg-blue-600'
                  : 'bg-orange-500 hover:bg-orange-600'
                }`}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <ConfirmModal
          title={
            ['infected', 'scan_failed'].includes(deleteConfirm.scan_status)
              ? 'Permanently delete infected file?'
              : `Remove "${deleteConfirm.original_filename}"?`
          }
          body={
            ['infected', 'scan_failed'].includes(deleteConfirm.scan_status)
              ? `"${deleteConfirm.original_filename}" contains malware and will be permanently deleted. This cannot be undone.`
              : `This will remove "${deleteConfirm.original_filename}" from your inbox${deleteConfirm.scan_status === 'safe' ? ' and delete it from storage' : ''}. This cannot be undone.`
          }
          confirmLabel={['infected', 'scan_failed'].includes(deleteConfirm.scan_status) ? 'Delete Permanently' : 'Remove File'}
          confirmClass={['infected', 'scan_failed'].includes(deleteConfirm.scan_status) ? 'bg-red-600 hover:bg-red-700' : 'bg-slate-700 hover:bg-slate-800'}
          loading={deletingFile || removingItem}
          onCancel={() => setDeleteConfirm(null)}
          onConfirm={handleDelete}
        />
      )}

      {saveModal && (
        <SaveToStorageModal
          submission={saveModal}
          loading={saveLoading}
          onCancel={() => setSaveModal(null)}
          onConfirm={handleSaveToStorage}
        />
      )}

      {viewFile && <FileViewerModal file={viewFile} onClose={() => setViewFile(null)} />}
    </div>
  )
}


export default function Sharing() {
  const dispatch = useDispatch()
  const { shares, zipShares, inboxStatusCounts } = useSelector((s) => s.sharing)
  const [activeTab, setActiveTab] = useState(
    () => localStorage.getItem('sharingActiveTab') || 'shares'
  )

  const handleTabChange = (tab) => {
    setActiveTab(tab)
    localStorage.setItem('sharingActiveTab', tab)
  }

  useEffect(() => {
    dispatch(fetchShares({ page: 1 }))
    dispatch(fetchZipShares({ page: 1 }))
    dispatch(fetchRequests({ page: 1 }))
    dispatch(fetchInbox())
    dispatch(fetchGlobalAnalytics())
    dispatch(fetchAllFiles())
  }, [dispatch])

  const pendingCount = inboxStatusCounts?.pending || 0
  const totalShares  = (shares?.length || 0) + (zipShares?.length || 0)

  const tabs = [
    { id: 'shares',    label: 'Shares',    icon: 'fa-share-nodes',     count: totalShares || null },
    { id: 'analytics', label: 'Analytics', icon: 'fa-chart-line',      count: null },
    { id: 'requests',  label: 'Requests',  icon: 'fa-inbox',           count: null },
    { id: 'inbox',     label: 'Inbox',     icon: 'fa-tray-arrow-down', count: pendingCount || null },
  ]

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="page-title text-2xl sm:text-3xl">Sharing Hub</h1>
          <p className="page-subtitle">Share files · ZIP bundles · File requests · Submission inbox</p>
        </div>
        <TabBar tabs={tabs} active={activeTab} onChange={handleTabChange} />
      </div>

      {activeTab === 'shares'    && <SharesPanel />}
      {activeTab === 'analytics' && <AnalyticsPanel />}
      {activeTab === 'requests'  && <RequestsPanel />}
      {activeTab === 'inbox'     && <InboxPanel />}
    </div>
  )
}