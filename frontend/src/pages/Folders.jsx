/**
 * Folders.jsx — Dedicated Folders management page
 *
 * Features:
 *  - Card grid of all folders with file count, colour, icon
 *  - Create / rename / delete folders with inline validation
 *  - Click into a folder → file list with select, remove, share
 *  - Add Files modal: pick from storage files not already in folder
 *  - Share modal: per-file links or ZIP bundle (reuses same backend as Files page)
 *  - Breadcrumb navigation: Folders → [Folder Name]
 *  - Empty states, loading skeletons, error banners
 *  - Consistent design with the existing Files page (indigo palette, rounded-lg cards)
 */

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import {
  fetchFolders,
  fetchFolderDetail,
  createFolder,
  updateFolder,
  deleteFolder,
  removeFilesFromFolder,
  shareFolderFiles,
  clearOpenFolder,
  clearShareResult,
} from '@/store/foldersSlice'
import { addFilesToFolder as apiAddFilesToFolder } from '@/api/foldersApi'
import { getFilesWithPageSize } from '@/api/filesApi'


const FOLDER_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
  '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#3b82f6', '#64748b',
]

const FOLDER_ICONS = [
  'fa-folder', 'fa-folder-open', 'fa-star', 'fa-heart',
  'fa-bookmark', 'fa-tag', 'fa-briefcase', 'fa-graduation-cap',
  'fa-camera', 'fa-music', 'fa-code', 'fa-chart-bar',
]


const fmt = (n) => (n ?? 0).toLocaleString()

const getFileIcon = (mime) => {
  if (!mime)                                                   return 'fa-file text-gray-400'
  if (mime.includes('pdf'))                                    return 'fa-file-pdf text-red-400'
  if (mime.includes('image'))                                  return 'fa-image text-blue-400'
  if (mime.includes('video'))                                  return 'fa-video text-purple-400'
  if (mime.includes('word') || mime.includes('document'))      return 'fa-file-word text-blue-600'
  if (mime.includes('spreadsheet') || mime.includes('sheet'))  return 'fa-file-excel text-green-500'
  if (mime.includes('zip') || mime.includes('archive'))        return 'fa-file-zipper text-orange-400'
  if (mime.includes('audio'))                                  return 'fa-file-audio text-pink-400'
  if (mime.includes('text'))                                   return 'fa-file-lines text-gray-400'
  return 'fa-file text-gray-400'
}


function EmailChipInput({ value, onChange }) {
  const [raw, setRaw] = useState('')

  const parse = (text) => {
    const list = text.split(/[,;\s\n]+/).map((e) => e.trim())
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

  return (
    <div>
      <div className="relative">
        <input
          type="text" value={raw}
          onChange={(e) => setRaw(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => { if (raw) { parse(raw); setRaw('') } }}
          placeholder="name@example.com — press Enter or comma"
          className="w-full px-3 py-2.5 bg-gray-50 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-brand-200 focus:outline-none"
        />
        {value.length > 0 && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 bg-brand-100 text-brand-700 text-xs font-bold px-2 py-0.5 rounded-full">
            {value.length}
          </span>
        )}
      </div>
      {value.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {value.map((e) => (
            <span key={e} className="inline-flex items-center gap-1 px-2 py-0.5 bg-brand-50 text-brand-700 text-xs font-semibold rounded-full">
              {e}
              <button type="button" onClick={() => onChange(value.filter((x) => x !== e))}>
                <i className="fas fa-xmark text-[10px] hover:text-red-500" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}


// ─── Add Files Modal ──────────────────────────────────────────────────────────

function AddFilesModal({ folder, currentFileIds, onClose, onAdded }) {
  // All files fetched once from server — client-side search avoids re-fetching
  // and eliminates flicker. We use page_size=100 (backend max) and loop pages
  // so users can select across ALL their files, not just the first page.
  const [allFiles,  setAllFiles]  = useState([])   // every file the user owns
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState('')
  const [selected,  setSelected]  = useState([])
  const [adding,    setAdding]    = useState(false)
  const [search,    setSearch]    = useState('')

  // Fetch every page and accumulate — runs once on mount
  useEffect(() => {
    // Use an object so the cancelled flag is shared by reference across
    // the async closure even after the effect cleanup runs.
    const state = { cancelled: false }

    ;(async () => {
      setLoading(true)
      setError('')
      const collected = []
      try {
        let p = 1
        let totalPages = 1
        do {
          const res = await getFilesWithPageSize(p, '', '-uploaded_at', 100)
          if (state.cancelled) return
          const body = res?.data?.data ?? res?.data ?? {}
          const results = Array.isArray(body.results) ? body.results : []
          totalPages = body.total_pages ?? 1
          collected.push(...results)
          p++
        } while (p <= totalPages)

        if (state.cancelled) return
        setAllFiles(collected)
        setLoading(false)
      } catch (e) {
        if (state.cancelled) return
        setError(e?.response?.data?.message || e?.message || 'Failed to load files.')
        setLoading(false)
      }
    })()

    return () => { state.cancelled = true }
  }, []) // load once on mount

  // Freeze the set of already-added IDs — it won't change while modal is open
  const excludedIds = useRef(new Set(currentFileIds.map(String)))

  // Client-side filtering: exclude already-in-folder files, then apply search
  // Both operations are O(n) at most — instant even with hundreds of files
  const available = useMemo(() => {
    const notInFolder = allFiles.filter((f) => !excludedIds.current.has(String(f.id)))
    if (!search.trim()) return notInFolder
    const q = search.toLowerCase()
    return notInFolder.filter((f) => f.original_name.toLowerCase().includes(q))
  }, [allFiles, search])

  const toggle = (id) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )

  const toggleAll = () =>
    setSelected(available.length > 0 && selected.length === available.length
      ? []
      : available.map((f) => String(f.id))
    )

  const handleAdd = async () => {
    if (!selected.length) return
    setAdding(true)
    setError('')
    try {
      await apiAddFilesToFolder(folder.id, selected)
      onAdded(selected.length)
      onClose()
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to add files.')
      setAdding(false)
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-panel w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: folder.color + '20' }}>
              <i className={`fas ${folder.icon} text-base`} style={{ color: folder.color }} />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900">Add Files to "{folder.name}"</p>
              <p className="text-[11px] text-gray-400">
                {loading ? 'Loading your files…' : `${available.length} file${available.length !== 1 ? 's' : ''} available`}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-all">
            <i className="fas fa-xmark" />
          </button>
        </div>

        {/* Search — always visible; filters client-side so no loading state */}
        <div className="px-6 pt-4 pb-2">
          <div className="relative">
            <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search files…"
              disabled={loading}
              className="w-full pl-9 pr-3 py-2 bg-gray-50 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-brand-200 focus:outline-none disabled:opacity-50"
            />
          </div>
        </div>

        {/* File list */}
        <div className="flex-1 overflow-y-auto px-6 pb-2">
          {error && (
            <div className="flex items-start gap-2 px-4 py-3 mb-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-700">
              <i className="fas fa-circle-exclamation mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {loading ? (
            <div className="space-y-2 py-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <div key={n} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-gray-50 animate-pulse">
                  <div className="w-4 h-4 bg-gray-200 rounded flex-shrink-0" />
                  <div className="w-8 h-8 bg-gray-200 rounded-xl flex-shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 bg-gray-200 rounded-full w-3/5" />
                    <div className="h-2 bg-gray-100 rounded-full w-1/4" />
                  </div>
                </div>
              ))}
            </div>
          ) : available.length === 0 ? (
            <div className="py-12 text-center">
              <i className="fas fa-folder-open text-3xl text-gray-200 mb-3" />
              <p className="text-sm font-semibold text-gray-400">
                {allFiles.length === 0
                  ? 'No files in your storage'
                  : search
                    ? `No files match "${search}"`
                    : 'All your files are already in this folder'}
              </p>
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="mt-2 text-xs text-brand-500 hover:underline font-semibold"
                >
                  Clear search
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Select-all bar */}
              <div className="flex items-center justify-between py-2 mb-1">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={available.length > 0 && selected.length === available.length}
                    onChange={toggleAll}
                    className="w-4 h-4 rounded accent-brand-600"
                  />
                  <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                    {available.length > 0 && selected.length === available.length ? 'Deselect all' : 'Select all'}
                  </span>
                </label>
                {selected.length > 0 && (
                  <span className="px-2.5 py-0.5 bg-brand-100 text-brand-700 text-xs font-bold rounded-full">
                    {selected.length} selected
                  </span>
                )}
              </div>

              {/* File rows — no pagination; all files in one scrollable list */}
              <div className="rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden bg-white">
                {available.map((f) => (
                  <label
                    key={f.id}
                    className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors select-none ${
                      selected.includes(String(f.id)) ? 'bg-brand-50' : 'hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected.includes(String(f.id))}
                      onChange={() => toggle(String(f.id))}
                      className="w-4 h-4 rounded accent-brand-600 flex-shrink-0"
                    />
                    <div className="w-8 h-8 bg-gray-50 rounded-xl flex items-center justify-center flex-shrink-0">
                      <i className={`fas ${getFileIcon(f.mime_type)} text-xs`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{f.original_name}</p>
                      <p className="text-[11px] text-gray-400">{f.file_size_display}</p>
                    </div>
                    <span className="text-[11px] text-gray-400 flex-shrink-0 hidden sm:block">
                      {new Date(f.uploaded_at).toLocaleDateString()}
                    </span>
                  </label>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2.5 bg-gray-100 text-gray-600 rounded-xl text-sm font-bold hover:bg-gray-200 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleAdd}
            disabled={adding || selected.length === 0}
            className="flex-1 py-2.5 bg-brand-600 text-white rounded-xl text-sm font-bold hover:bg-brand-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {adding
              ? <><i className="fas fa-spinner fa-spin text-xs" />Adding…</>
              : <><i className="fas fa-folder-plus text-xs" />Add {selected.length > 0 ? `${selected.length} File${selected.length !== 1 ? 's' : ''}` : 'Files'}</>
            }
          </button>
        </div>
      </div>
    </div>
  )
}


function ShareModal({ folder, onClose }) {
  const dispatch = useDispatch()
  const { sharing, shareResult, error: folderError } = useSelector((s) => s.folders)

  const files = folder.files || []

  const [shareType,  setShareType]  = useState('single')
  const [fileIds,    setFileIds]    = useState([])
  const [emails,     setEmails]     = useState([])
  const [expiry,     setExpiry]     = useState(24)
  const [message,    setMessage]    = useState('')
  const [zipName,    setZipName]    = useState(folder.name)
  const [successMsg, setSuccessMsg] = useState('')

  useEffect(() => {
    if (shareResult) {
      const c = shareResult.count ?? 0
      setSuccessMsg(
        shareType === 'zip'
          ? `✓ ${shareResult.file_count} files bundled into ${c} ZIP link${c !== 1 ? 's' : ''} — emails sent.`
          : `✓ ${c} unique link${c !== 1 ? 's' : ''} sent by email.`
      )
      dispatch(clearShareResult())
    }
  }, [shareResult, dispatch, shareType])

  const toggleFile = (id) =>
    setFileIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])

  const toggleAll = () =>
    setFileIds(fileIds.length === files.length ? [] : files.map((f) => f.id))

  const handleShare = () => {
    if (!emails.length) return
    dispatch(shareFolderFiles({
      folderId: folder.id,
      payload: {
        file_ids:         fileIds,
        recipient_emails: emails,
        expiration_hours: Number(expiry),
        message,
        share_type:       fileIds.length === 1 ? 'single' : shareType,
        zip_name:         zipName || folder.name,
      },
    }))
  }

  return (
    <div className="modal-overlay">
      <div className="modal-panel w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">

        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: folder.color + '20' }}>
              <i className={`fas ${folder.icon} text-base`} style={{ color: folder.color }} />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900">Share from "{folder.name}"</p>
              <p className="text-[11px] text-gray-400">{files.length} file{files.length !== 1 ? 's' : ''} available</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-all">
            <i className="fas fa-xmark" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {successMsg && (
            <div className="flex items-start gap-2.5 px-4 py-3 bg-emerald-50 border border-emerald-100 rounded-xl text-sm text-emerald-700">
              <i className="fas fa-circle-check mt-0.5 flex-shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}
          {folderError && !successMsg && (
            <div className="flex items-start gap-2.5 px-4 py-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-700">
              <i className="fas fa-circle-exclamation mt-0.5 flex-shrink-0" />
              <span>{folderError}</span>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                Files to share
                <span className="text-gray-400 normal-case font-normal ml-1">(leave unchecked = all)</span>
              </label>
              {files.length > 0 && (
                <button onClick={toggleAll} className="text-[11px] text-brand-600 font-semibold hover:underline">
                  {fileIds.length === files.length ? 'Deselect all' : 'Select all'}
                </button>
              )}
            </div>
            <div className="max-h-40 overflow-y-auto rounded-xl border border-gray-200 divide-y divide-gray-100 bg-white">
              {files.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-6">No files in this folder.</p>
              ) : files.map((f) => (
                <label key={f.id} className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-gray-50 transition-colors ${fileIds.includes(f.id) ? 'bg-brand-50' : ''}`}>
                  <input type="checkbox" checked={fileIds.includes(f.id)} onChange={() => toggleFile(f.id)}
                    className="w-4 h-4 rounded accent-brand-600 flex-shrink-0" />
                  <i className={`fas ${getFileIcon(f.mime_type)} text-xs flex-shrink-0`} />
                  <span className="text-sm text-gray-700 truncate flex-1">{f.original_name}</span>
                  <span className="text-xs text-gray-400 flex-shrink-0">{f.file_size_display}</span>
                </label>
              ))}
            </div>
            <p className="text-[11px] text-brand-600 font-semibold mt-1.5">
              {fileIds.length === 0 ? 'All files will be shared' : `${fileIds.length} file${fileIds.length !== 1 ? 's' : ''} selected`}
            </p>
          </div>

          {fileIds.length !== 1 && (
            <div className="flex gap-2">
              {[
                { v: 'single', icon: 'fa-link',        label: 'Per-file links' },
                { v: 'zip',    icon: 'fa-file-zipper', label: 'ZIP bundle'     },
              ].map(({ v, icon, label }) => (
                <button key={v} onClick={() => setShareType(v)}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold border transition-all ${
                    shareType === v
                      ? 'bg-brand-600 text-white border-brand-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-brand-300'
                  }`}
                >
                  <i className={`fas ${icon}`} /> {label}
                </button>
              ))}
            </div>
          )}

          {shareType === 'zip' && fileIds.length !== 1 && (
            <div>
              <label className="block text-[11px] font-bold text-gray-500 mb-1.5 uppercase tracking-wider">ZIP Name</label>
              <div className="flex">
                <input type="text" value={zipName} onChange={(e) => setZipName(e.target.value)}
                  placeholder={folder.name}
                  className="flex-1 px-3 py-2 bg-gray-50 rounded-l-xl border border-r-0 border-gray-200 text-sm focus:ring-2 focus:ring-brand-200 focus:outline-none" />
                <span className="px-3 py-2 bg-gray-100 rounded-r-xl text-sm text-gray-500 border border-l-0 border-gray-200">.zip</span>
              </div>
            </div>
          )}

          <div>
            <label className="block text-[11px] font-bold text-gray-500 mb-1.5 uppercase tracking-wider">
              Recipients <span className="text-red-500">*</span>
            </label>
            <EmailChipInput value={emails} onChange={setEmails} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Expires After</label>
              <select value={expiry} onChange={(e) => setExpiry(e.target.value)}
                className="w-full px-3 py-2 bg-gray-50 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-brand-200 focus:outline-none">
                <option value="1">1 hour</option>
                <option value="24">1 day</option>
                <option value="72">3 days</option>
                <option value="168">1 week</option>
                <option value="720">30 days</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Message</label>
              <input type="text" value={message} onChange={(e) => setMessage(e.target.value)}
                placeholder="Optional note…"
                className="w-full px-3 py-2 bg-gray-50 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-brand-200 focus:outline-none" />
            </div>
          </div>

          {emails.length > 0 && (
            <div className="flex items-start gap-2.5 px-4 py-3 bg-brand-50 border border-brand-100 rounded-xl text-xs text-brand-700">
              <i className="fas fa-info-circle mt-0.5 flex-shrink-0" />
              <span>
                {shareType === 'zip' && fileIds.length !== 1
                  ? <><strong>{fileIds.length || files.length} files</strong> → <strong>{emails.length} private ZIP link{emails.length !== 1 ? 's' : ''}</strong> sent by email.</>
                  : <><strong>{emails.length} unique private link{emails.length !== 1 ? 's' : ''}</strong> sent by email per file.</>
                }
              </span>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
          <button onClick={onClose} className="px-4 py-2.5 bg-gray-100 text-gray-600 rounded-xl text-sm font-bold hover:bg-gray-200 transition-all">
            Close
          </button>
          <button onClick={handleShare} disabled={sharing || emails.length === 0}
            className="flex-1 py-2.5 bg-brand-600 text-white rounded-xl text-sm font-bold hover:bg-brand-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
            {sharing
              ? <><i className="fas fa-spinner fa-spin text-xs" />Sharing…</>
              : <><i className="fas fa-paper-plane text-xs" />Share</>}
          </button>
        </div>
      </div>
    </div>
  )
}


function FolderFormModal({ existingFolder, onClose, onSaved }) {
  const dispatch = useDispatch()
  const { loading, error } = useSelector((s) => s.folders)

  const [name,    setName]    = useState(existingFolder?.name    || '')
  const [desc,    setDesc]    = useState(existingFolder?.description || '')
  const [color,   setColor]   = useState(existingFolder?.color   || '#6366f1')
  const [icon,    setIcon]    = useState(existingFolder?.icon    || 'fa-folder')
  const [nameErr, setNameErr] = useState('')

  const isEdit = !!existingFolder

  const handleSubmit = async () => {
    if (!name.trim()) { setNameErr('Folder name is required.'); return }
    setNameErr('')

    let result
    if (isEdit) {
      result = await dispatch(updateFolder({
        folderId: existingFolder.id,
        payload: { name: name.trim(), description: desc, color, icon },
      }))
    } else {
      result = await dispatch(createFolder({ name: name.trim(), description: desc, color, icon }))
    }

    if (!result.error) {
      onSaved?.()
      onClose()
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-panel w-full max-w-md flex flex-col max-h-[90vh]">

        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <h3 className="text-base font-bold text-gray-900">
            {isEdit ? `Edit "${existingFolder.name}"` : 'New Folder'}
          </h3>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-all">
            <i className="fas fa-xmark" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {error && (
            <div className="flex items-start gap-2 px-4 py-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-700">
              <i className="fas fa-circle-exclamation mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-[11px] font-bold text-gray-500 mb-1.5 uppercase tracking-wider">
              Folder Name <span className="text-red-500">*</span>
            </label>
            <input
              autoFocus type="text" value={name}
              onChange={(e) => { setName(e.target.value); setNameErr('') }}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              placeholder="e.g. Project Assets"
              className={`w-full px-4 py-2.5 bg-gray-50 rounded-xl border text-sm focus:ring-2 focus:ring-brand-200 focus:outline-none ${nameErr ? 'border-red-300' : 'border-gray-200'}`}
            />
            {nameErr && <p className="text-xs text-red-500 mt-1">{nameErr}</p>}
          </div>

          <div>
            <label className="block text-[11px] font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Description</label>
            <textarea
              value={desc} onChange={(e) => setDesc(e.target.value)}
              placeholder="Optional description…" rows={2}
              className="w-full px-4 py-2.5 bg-gray-50 rounded-xl border border-gray-200 text-sm resize-none focus:ring-2 focus:ring-brand-200 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-4 px-4 py-3 bg-gray-50 rounded-xl border border-gray-200">
            <div className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 transition-all"
              style={{ background: color + '25' }}>
              <i className={`fas ${icon} text-xl transition-all`} style={{ color }} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-gray-800 truncate">{name || 'Folder Name'}</p>
              <p className="text-[11px] text-gray-400">{desc || 'No description'}</p>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-gray-500 mb-2 uppercase tracking-wider">Color</label>
            <div className="flex flex-wrap gap-2">
              {FOLDER_COLORS.map((c) => (
                <button key={c} onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-full transition-all ${color === c ? 'ring-2 ring-offset-2 ring-slate-400 scale-110' : 'hover:scale-105'}`}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-gray-500 mb-2 uppercase tracking-wider">Icon</label>
            <div className="flex flex-wrap gap-2">
              {FOLDER_ICONS.map((ic) => (
                <button key={ic} onClick={() => setIcon(ic)}
                  className={`w-9 h-9 flex items-center justify-center rounded-xl border transition-all ${
                    icon === ic ? 'border-brand-500 bg-brand-50 text-brand-600' : 'border-gray-200 bg-white text-gray-500 hover:border-slate-300'
                  }`}
                >
                  <i className={`fas ${ic} text-sm`} />
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 bg-gray-100 text-gray-600 rounded-xl text-sm font-bold hover:bg-gray-200 transition-all">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={loading || !name.trim()}
            className="flex-1 py-2.5 bg-brand-600 text-white rounded-xl text-sm font-bold hover:bg-brand-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
            {loading
              ? <><i className="fas fa-spinner fa-spin text-xs" />{isEdit ? 'Saving…' : 'Creating…'}</>
              : <><i className={`fas ${isEdit ? 'fa-check' : 'fa-plus'} text-xs`} />{isEdit ? 'Save Changes' : 'Create Folder'}</>
            }
          </button>
        </div>
      </div>
    </div>
  )
}


function DeleteFolderModal({ folder, onClose, onDeleted }) {
  const dispatch  = useDispatch()
  const [busy, setBusy] = useState(false)

  const handleDelete = async () => {
    setBusy(true)
    await dispatch(deleteFolder(folder.id))
    onDeleted?.()
    onClose()
  }

  return (
    <div className="modal-overlay">
      <div className="bg-white rounded-lg p-8 max-w-sm w-full text-center">
        <div className="w-16 h-16 bg-red-50 text-red-500 rounded-lg flex items-center justify-center text-2xl mx-auto mb-5">
          <i className="fas fa-trash-can" />
        </div>
        <h3 className="text-lg font-bold text-gray-900 mb-2">Delete "{folder.name}"?</h3>
        <p className="text-sm text-gray-500 mb-7">
          The folder will be removed. <strong>Files inside are not deleted</strong> — they stay in your storage.
        </p>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 bg-gray-100 text-gray-600 rounded-lg text-sm font-bold hover:bg-gray-200 transition-all">
            Cancel
          </button>
          <button onClick={handleDelete} disabled={busy}
            className="flex-1 py-3 bg-red-500 text-white rounded-lg text-sm font-bold hover:bg-red-600 transition-all disabled:opacity-60 flex items-center justify-center gap-2">
            {busy ? <><i className="fas fa-spinner fa-spin text-xs" />Deleting…</> : 'Delete Folder'}
          </button>
        </div>
      </div>
    </div>
  )
}


function FolderCard({ folder, onOpen, onEdit, onDelete }) {
  return (
    <div className="group relative card rounded-lg shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 overflow-hidden flex flex-col">
      <div className="h-1.5 w-full" style={{ background: folder.color }} />

      <div className="p-5 flex flex-col flex-1">
        <div className="flex items-start justify-between mb-4">
          <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ background: folder.color + '20' }}>
            <i className={`fas ${folder.icon || 'fa-folder'} text-xl`} style={{ color: folder.color }} />
          </div>
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(folder) }}
              className="w-8 h-8 flex items-center justify-center bg-gray-100 text-gray-500 hover:bg-brand-100 hover:text-brand-600 rounded-xl transition-all"
              title="Edit folder"
            >
              <i className="fas fa-pen text-xs" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(folder) }}
              className="w-8 h-8 flex items-center justify-center bg-gray-100 text-gray-500 hover:bg-red-100 hover:text-red-500 rounded-xl transition-all"
              title="Delete folder"
            >
              <i className="fas fa-trash text-xs" />
            </button>
          </div>
        </div>

        <div className="flex-1">
          <h3 className="text-sm font-bold text-gray-800 truncate mb-1">{folder.name}</h3>
          <p className="text-[11px] text-gray-400 truncate" style={{ minHeight: '16px' }}>
            {folder.description || '\u00A0'}
          </p>
        </div>

        <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-50">
          <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
            <i className="fas fa-file text-[10px]" />
            <span>{fmt(folder.file_count)} file{folder.file_count !== 1 ? 's' : ''}</span>
          </div>
          <button
            onClick={() => onOpen(folder)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 text-white rounded-xl text-xs font-bold hover:bg-brand-700 transition-all"
          >
            Open <i className="fas fa-chevron-right text-[9px]" />
          </button>
        </div>
      </div>
    </div>
  )
}


function FolderSkeleton() {
  return (
    <div className="bg-white rounded-lg border border-gray-100 overflow-hidden animate-pulse">
      <div className="h-1.5 bg-gray-100" />
      <div className="p-5">
        <div className="flex items-start justify-between mb-4">
          <div className="w-12 h-12 bg-gray-100 rounded-lg" />
        </div>
        <div className="h-3.5 bg-gray-100 rounded-full w-2/3 mb-2" />
        <div className="h-2.5 bg-gray-50 rounded-full w-1/2 mb-4" />
        <div className="flex items-center justify-between">
          <div className="h-2.5 bg-gray-50 rounded-full w-16" />
          <div className="h-7 bg-gray-100 rounded-xl w-16" />
        </div>
      </div>
    </div>
  )
}


function FolderDetailView({ folder, onBack, onShareOpen }) {
  const dispatch = useDispatch()
  const { openFolder, detailLoading } = useSelector((s) => s.folders)

  const [selected,      setSelected]      = useState([])
  const [removing,      setRemoving]      = useState(false)
  const [feedback,      setFeedback]      = useState(null) // { type, msg }
  const [addFilesOpen,  setAddFilesOpen]  = useState(false)

  useEffect(() => {
    dispatch(fetchFolderDetail(folder.id))
    return () => dispatch(clearOpenFolder())
  }, [dispatch, folder.id])

  const files = openFolder?.files || []

  const toggleFile = (id) =>
    setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])

  const toggleAll = () =>
    setSelected(selected.length === files.length ? [] : files.map((f) => f.id))

  const showFeedback = (type, msg) => {
    setFeedback({ type, msg })
    setTimeout(() => setFeedback(null), 4000)
  }

  const handleRemove = async () => {
    if (!selected.length) return
    setRemoving(true)
    const count = selected.length
    const result = await dispatch(removeFilesFromFolder({ folderId: folder.id, fileIds: selected }))
    setRemoving(false)
    if (!result.error) {
      setSelected([])
      showFeedback('success', `✓ ${count} file${count !== 1 ? 's' : ''} removed from this folder.`)
      dispatch(fetchFolderDetail(folder.id))
    } else {
      showFeedback('error', result.payload || 'Failed to remove files.')
    }
  }

  const handleFilesAdded = (count) => {
    showFeedback('success', `✓ ${count} file${count !== 1 ? 's' : ''} added to this folder.`)
    dispatch(fetchFolderDetail(folder.id))
    dispatch(fetchFolders())
  }

  const mergedFolder = openFolder ? { ...folder, ...openFolder } : folder
  // IDs already in this folder (to exclude from AddFilesModal)
  const currentFileIds = files.map((f) => String(f.id))

  if (detailLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-brand-600 font-semibold">
            <i className="fas fa-chevron-left text-xs" /> All Folders
          </button>
        </div>
        <div className="space-y-2">
          {[1, 2, 3].map((n) => (
            <div key={n} className="flex items-center gap-3 px-4 py-3 bg-white rounded-lg border border-gray-100 animate-pulse">
              <div className="w-8 h-8 bg-gray-100 rounded-lg flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 bg-gray-100 rounded-full w-2/5" />
                <div className="h-2 bg-gray-50 rounded-full w-1/5" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm flex-wrap">
        <button onClick={onBack} className="flex items-center gap-1.5 text-gray-500 hover:text-brand-600 font-semibold transition-colors">
          <i className="fas fa-folder text-xs" /> All Folders
        </button>
        <i className="fas fa-chevron-right text-[10px] text-slate-300" />
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-md flex items-center justify-center" style={{ background: folder.color + '25' }}>
            <i className={`fas ${folder.icon} text-xs`} style={{ color: folder.color }} />
          </div>
          <span className="font-bold text-gray-800">{folder.name}</span>
          <span className="text-gray-400 text-xs font-normal">— {files.length} file{files.length !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* Feedback banner */}
      {feedback && (
        <div className={`flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm border ${
          feedback.type === 'success'
            ? 'bg-emerald-50 border-emerald-100 text-emerald-700'
            : 'bg-red-50 border-red-100 text-red-700'
        }`}>
          <i className={`fas ${feedback.type === 'success' ? 'fa-circle-check' : 'fa-circle-exclamation'} flex-shrink-0`} />
          {feedback.msg}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          {selected.length > 0 && (
            <>
              <span className="px-2.5 py-1 bg-brand-100 text-brand-700 text-xs font-bold rounded-full">
                {selected.length} selected
              </span>
              <button onClick={() => setSelected([])} className="text-xs text-gray-400 hover:text-gray-600 font-semibold">
                Clear
              </button>
              <button
                onClick={handleRemove}
                disabled={removing}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 rounded-xl text-xs font-bold hover:bg-red-100 transition-all disabled:opacity-50"
              >
                <i className="fas fa-folder-minus text-[10px]" />
                {removing ? 'Removing…' : 'Remove from Folder'}
              </button>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* ── Add Files button ── */}
          <button
            onClick={() => setAddFilesOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold hover:bg-emerald-100 hover:border-emerald-300 transition-all"
          >
            <i className="fas fa-folder-plus text-[11px]" />
            Add Files
          </button>

          <button
            onClick={() => onShareOpen(mergedFolder)}
            className="flex items-center gap-1.5 px-4 py-2 bg-brand-600 text-white rounded-xl text-xs font-bold hover:bg-brand-700 transition-all"
          >
            <i className="fas fa-share-nodes text-[11px]" />
            Share{selected.length > 0 ? ` (${selected.length})` : ' Folder'}
          </button>
        </div>
      </div>

      {/* File list */}
      {files.length === 0 ? (
        <div className="card rounded-lg border border-dashed border-gray-200 py-16 text-center">
          <i className="fas fa-folder-open text-4xl text-slate-200 mb-4" />
          <p className="text-sm font-semibold text-gray-400">This folder is empty</p>
          <p className="text-xs text-slate-300 mt-1 mb-4">Add files from your storage using the button above.</p>
          <button
            onClick={() => setAddFilesOpen(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition-all"
          >
            <i className="fas fa-folder-plus text-xs" /> Add Files
          </button>
        </div>
      ) : (
        <div className="card rounded-lg overflow-hidden shadow-sm">
          <div className="flex items-center gap-3 px-5 py-3 bg-gray-50 border-b border-gray-100">
            <input type="checkbox"
              checked={selected.length === files.length && files.length > 0}
              onChange={toggleAll}
              className="w-4 h-4 rounded accent-brand-600"
            />
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
              {selected.length === files.length && files.length > 0 ? 'Deselect all' : 'Select all'}
            </span>
          </div>

          <div className="divide-y divide-slate-50">
            {files.map((f) => (
              <label key={f.id} className={`flex items-center gap-4 px-5 py-3.5 cursor-pointer transition-colors ${selected.includes(f.id) ? 'bg-brand-50' : 'hover:bg-gray-50'}`}>
                <input type="checkbox" checked={selected.includes(f.id)} onChange={() => toggleFile(f.id)}
                  className="w-4 h-4 rounded accent-brand-600 flex-shrink-0" />
                <div className="w-9 h-9 bg-gray-50 rounded-xl flex items-center justify-center flex-shrink-0">
                  <i className={`fas ${getFileIcon(f.mime_type)} text-sm`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">{f.original_name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[11px] text-gray-400">{f.file_size_display}</span>
                    {f.is_favorite && <i className="fas fa-star text-yellow-400 text-[10px]" />}

                  </div>
                </div>
                <span className="text-[11px] text-gray-400 flex-shrink-0 hidden sm:block">
                  {new Date(f.uploaded_at).toLocaleDateString()}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Add Files Modal */}
      {addFilesOpen && (
        <AddFilesModal
          folder={mergedFolder}
          currentFileIds={currentFileIds}
          onClose={() => setAddFilesOpen(false)}
          onAdded={handleFilesAdded}
        />
      )}
    </div>
  )
}


export default function Folders() {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const { folderId } = useParams()
  const { folders, loading, error } = useSelector((s) => s.folders)

  const [search,        setSearch]        = useState('')
  const [openFolder,    setOpenFolder]    = useState(null)  // folder being viewed in detail
  const [createModal,   setCreateModal]   = useState(false)
  const [editFolder,    setEditFolder]    = useState(null)
  const [deleteFolder_,  setDeleteFolder_]  = useState(null)
  const [shareFolder,   setShareFolder]   = useState(null)  // folder object with .files[]

  useEffect(() => {
    dispatch(fetchFolders())
  }, [dispatch])

  useEffect(() => {
    if (!folderId) {
      setOpenFolder(null)
      return
    }
    const summary = folders.find((f) => String(f.id) === String(folderId))
    if (summary) setOpenFolder(summary)
  }, [folderId, folders])

  const openFolderView = useCallback((folder) => {
    navigate(`/folders/${folder.id}`)
  }, [navigate])

  const closeFolderView = useCallback(() => {
    navigate('/folders')
  }, [navigate])

  const filtered = folders.filter((f) =>
    f.name.toLowerCase().includes(search.toLowerCase()) ||
    (f.description || '').toLowerCase().includes(search.toLowerCase())
  )

  const handleDeleteDone = useCallback(() => {
    if (openFolder?.id === deleteFolder_?.id) closeFolderView()
  }, [openFolder, deleteFolder_, closeFolderView])


  return (
    <div className="w-full">
      <div>

        <header className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-6">
          <div>
            <h2 className="page-title text-2xl sm:text-3xl">
              {openFolder ? 'Folder Contents' : 'Folders'}
            </h2>
            <p className="page-subtitle mt-1 flex items-center gap-2">
              <i className="fas fa-folder text-violet-600 dark:text-violet-400" aria-hidden />
              {openFolder
                ? `Viewing "${openFolder.name}"`
                : `${folders.length} folder${folders.length !== 1 ? 's' : ''}`
              }
            </p>
          </div>

          {!openFolder && (
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:flex-none">
                <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-sky-500 dark:text-sky-400 text-xs" aria-hidden />
                <input
                  type="text"
                  placeholder="Search folders…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="field w-full sm:w-52 pl-9 pr-3 py-2.5 text-sm"
                />
              </div>
              <button
                onClick={() => setCreateModal(true)}
                className="flex items-center gap-2 px-5 py-2.5 bg-brand-600 text-white rounded-lg font-bold text-sm  hover:bg-brand-700 transition-all"
              >
                <i className="fas fa-plus" /> New Folder
              </button>
            </div>
          )}
        </header>

        {error && !openFolder && (
          <div className="mb-5 flex items-start gap-3 px-5 py-4 bg-red-50 border border-red-100 rounded-lg text-sm text-red-700">
            <i className="fas fa-circle-exclamation mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {openFolder ? (
          <div className="card rounded-lg shadow-sm p-6">
            <FolderDetailView
              folder={openFolder}
              onBack={closeFolderView}
              onShareOpen={(f) => setShareFolder(f)}
            />
          </div>
        ) : loading && !folders.length ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {[1, 2, 3, 4, 5, 6].map((n) => <FolderSkeleton key={n} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="card rounded-lg border border-dashed border-gray-200 py-20 text-center shadow-sm">
            <div className="w-20 h-20 bg-brand-50 rounded-lg flex items-center justify-center text-3xl text-brand-300 mx-auto mb-5">
              <i className="fas fa-folder-open" />
            </div>
            {search ? (
              <>
                <p className="text-base font-bold text-gray-500">No folders match "{search}"</p>
                <button onClick={() => setSearch('')} className="mt-3 text-sm text-brand-500 hover:underline font-semibold">
                  Clear search
                </button>
              </>
            ) : (
              <>
                <p className="text-base font-bold text-gray-500">No folders yet</p>
                <p className="text-sm text-gray-400 mt-1">Organise your files by creating your first folder.</p>
                <button
                  onClick={() => setCreateModal(true)}
                  className="mt-5 px-6 py-2.5 bg-brand-600 text-white rounded-lg text-sm font-bold hover:bg-brand-700 transition-all "
                >
                  <i className="fas fa-plus mr-2" />Create First Folder
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            <button
              onClick={() => setCreateModal(true)}
              className="group card rounded-lg border border-dashed border-gray-200 hover:border-brand-300 hover:bg-brand-50/30 transition-all p-5 flex flex-col items-center justify-center gap-3 min-h-[160px] cursor-pointer"
            >
              <div className="w-12 h-12 rounded-lg bg-gray-100 group-hover:bg-brand-100 flex items-center justify-center transition-colors">
                <i className="fas fa-plus text-gray-400 group-hover:text-brand-500 text-lg transition-colors" />
              </div>
              <span className="text-sm font-bold text-gray-400 group-hover:text-brand-500 transition-colors">New Folder</span>
            </button>

            {filtered.map((f) => (
              <FolderCard
                key={f.id}
                folder={f}
                onOpen={openFolderView}
                onEdit={setEditFolder}
                onDelete={setDeleteFolder_}
              />
            ))}
          </div>
        )}
      </div>

      {createModal && (
        <FolderFormModal
          onClose={() => setCreateModal(false)}
          onSaved={() => dispatch(fetchFolders())}
        />
      )}

      {editFolder && (
        <FolderFormModal
          existingFolder={editFolder}
          onClose={() => setEditFolder(null)}
          onSaved={() => dispatch(fetchFolders())}
        />
      )}

      {deleteFolder_ && (
        <DeleteFolderModal
          folder={deleteFolder_}
          onClose={() => setDeleteFolder_(null)}
          onDeleted={handleDeleteDone}
        />
      )}

      {shareFolder && (
        <ShareModal
          folder={shareFolder}
          onClose={() => setShareFolder(null)}
        />
      )}
    </div>
  )
}