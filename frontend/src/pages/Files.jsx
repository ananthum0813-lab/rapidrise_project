/**
 * Files.jsx 
 *
 */

import { useEffect, useState, useRef } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { fetchFiles, upload, remove, fetchStorage, rename } from '@/store/filesSlice'
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
import {
  downloadFile,
  toggleFavorite,
  computeSHA256,
  checkDuplicate,
  deleteFile as apiDeleteFile,
} from '@/api/filesApi'
import Alert          from '@/components/ui/Alert'
import DuplicateModal from '@/components/DuplicateModal'
import { resolveFileName, stageFiles } from '@/utils/fileNaming'
import AddToFolderModal from '@/components/modals/AddToFolderModal'
import FileShareModal   from '@/components/modals/FileShareModal'
import { toast } from 'react-hot-toast'
import SetExpiryModal, {  // ← NEW
  getExpiryInfo,
  variantClasses,
  EXPIRY_OPTIONS,
} from '@/components/modals/SetExpiryModal'

const POLL_INTERVAL_MS = 30_000   // 30 s


const getExt   = (name) => { const p = name.split('.'); return p.length > 1 ? '.' + p[p.length - 1] : '' }
const stripExt = (name) => { const e = getExt(name); return e ? name.slice(0, -e.length) : name }
const fmt      = (n)    => (n ?? 0).toLocaleString()

const getFileIcon = (mime) => {
  if (!mime)                                                  return 'fa-file text-gray-400'
  if (mime.includes('pdf'))                                   return 'fa-file-pdf text-red-400'
  if (mime.includes('image'))                                 return 'fa-image text-blue-400'
  if (mime.includes('video'))                                 return 'fa-video text-purple-400'
  if (mime.includes('word') || mime.includes('document'))     return 'fa-file-word text-blue-600'
  if (mime.includes('spreadsheet') || mime.includes('sheet')) return 'fa-file-excel text-green-500'
  if (mime.includes('zip') || mime.includes('archive'))       return 'fa-file-zipper text-orange-400'
  if (mime.includes('audio'))                                 return 'fa-file-audio text-pink-400'
  if (mime.includes('text'))                                  return 'fa-file-lines text-gray-400'
  return 'fa-file text-gray-400'
}

const FOLDER_COLORS = [
  '#6366f1','#8b5cf6','#ec4899','#ef4444',
  '#f97316','#eab308','#22c55e','#14b8a6',
  '#3b82f6','#64748b',
]


function EmailChipInput({ value, onChange }) {
  const [raw, setRaw] = useState('')
  const parse = (text) => {
    const list = text.split(/[,;\s\n]+/).map((e) => e.trim())
      .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
    onChange([...new Set([...value, ...list])])
  }
  const onKeyDown = (e) => {
    if (['Enter', ',', ';', ' '].includes(e.key)) { e.preventDefault(); parse(raw); setRaw('') }
  }
  return (
    <div>
      <div className="relative">
        <input type="text" value={raw}
          onChange={(e) => setRaw(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => { if (raw) { parse(raw); setRaw('') } }}
          placeholder="name@example.com (Enter or comma)"
          className="w-full px-3 py-2 bg-gray-50 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-brand-200 focus:outline-none"
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


function FolderShareModal({ folder, preselectedFileIds, onClose }) {
  const dispatch = useDispatch()
  const { sharing, shareResult, error: folderError } = useSelector((s) => s.folders ?? {})

  const [shareType,  setShareType]  = useState(preselectedFileIds?.length === 1 ? 'single' : 'zip')
  const [fileIds,    setFileIds]    = useState(preselectedFileIds || [])
  const [emails,     setEmails]     = useState([])
  const [expiry,     setExpiry]     = useState(24)
  const [message,    setMessage]    = useState('')
  const [zipName,    setZipName]    = useState(folder.name)
  const [successMsg, setSuccessMsg] = useState('')
  const folderFiles = folder.files || []

  const effectiveShareType = fileIds.length === 1 ? 'single' : shareType

  useEffect(() => {
    if (shareResult) {
      const c = shareResult.count ?? 0
      setSuccessMsg(
        effectiveShareType === 'zip'
          ? `✓ ${shareResult.file_count} files bundled into ${c} ZIP link${c !== 1 ? 's' : ''} sent.`
          : `✓ ${c} unique link${c !== 1 ? 's' : ''} sent by email.`
      )
      dispatch(clearShareResult())
    }
  }, [shareResult, dispatch]) // eslint-disable-line

  const toggleFile = (id) =>
    setFileIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  const toggleAll = () =>
    setFileIds(fileIds.length === folderFiles.length ? [] : folderFiles.map((f) => f.id))

  const handleShare = () => {
    if (!emails.length) return
    dispatch(shareFolderFiles({
      folderId: folder.id,
      payload: {
        file_ids:         fileIds.length ? fileIds : [],
        recipient_emails: emails,
        expiration_hours: Number(expiry),
        message,
        share_type:       effectiveShareType,
        zip_name:         zipName || folder.name,
      },
    }))
  }

  return (
    <div className="modal-overlay">
      <div className="modal-panel w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: folder.color + '20' }}>
              <i className={`fas ${folder.icon || 'fa-folder'} text-sm`} style={{ color: folder.color }} />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900">Share from "{folder.name}"</p>
              <p className="text-[11px] text-gray-400">{folderFiles.length} file{folderFiles.length !== 1 ? 's' : ''} in folder</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-all">
            <i className="fas fa-xmark" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {successMsg && (
            <div className="flex items-start gap-2 px-3 py-2.5 bg-emerald-50 border border-emerald-100 rounded-xl text-sm text-emerald-700">
              <i className="fas fa-circle-check mt-0.5 flex-shrink-0" /><span>{successMsg}</span>
            </div>
          )}
          {folderError && !successMsg && (
            <div className="flex items-start gap-2 px-3 py-2.5 bg-red-50 border border-red-100 rounded-xl text-sm text-red-700">
              <i className="fas fa-circle-exclamation mt-0.5 flex-shrink-0" /><span>{folderError}</span>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-gray-600 uppercase tracking-wider">
                Files to share <span className="text-gray-400 normal-case font-normal">(leave unchecked = all)</span>
              </label>
              {folderFiles.length > 0 && (
                <button onClick={toggleAll} className="text-[11px] text-brand-600 font-semibold hover:underline">
                  {fileIds.length === folderFiles.length ? 'Deselect all' : 'Select all'}
                </button>
              )}
            </div>
            <div className="max-h-40 overflow-y-auto rounded-xl border border-gray-200 divide-y divide-gray-100 bg-white">
              {folderFiles.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-6">No files in this folder.</p>
              ) : folderFiles.map((f) => (
                <label key={f.id} className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50 ${fileIds.includes(f.id) ? 'bg-brand-50' : ''}`}>
                  <input type="checkbox" checked={fileIds.includes(f.id)} onChange={() => toggleFile(f.id)} className="w-4 h-4 rounded accent-brand-600 flex-shrink-0" />
                  <i className={`fas ${getFileIcon(f.mime_type)} text-xs flex-shrink-0`} />
                  <span className="text-sm text-gray-700 truncate flex-1">{f.original_name}</span>
                  <span className="text-xs text-gray-400 flex-shrink-0">{f.file_size_display}</span>
                </label>
              ))}
            </div>
            <p className="text-[11px] text-brand-600 font-semibold mt-1">
              {fileIds.length === 0 ? 'All files will be shared' : `${fileIds.length} file${fileIds.length !== 1 ? 's' : ''} selected`}
            </p>
          </div>

          {fileIds.length !== 1 && (
            <div className="flex gap-2">
              {[{ v: 'single', icon: 'fa-link', label: 'Per-file links' }, { v: 'zip', icon: 'fa-file-zipper', label: 'ZIP bundle' }].map(({ v, icon, label }) => (
                <button key={v} onClick={() => setShareType(v)}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold border transition-all ${shareType === v ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-200 hover:border-brand-300'}`}>
                  <i className={`fas ${icon}`} /> {label}
                </button>
              ))}
            </div>
          )}

          {effectiveShareType === 'zip' && (
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wider">ZIP Name</label>
              <div className="flex">
                <input type="text" value={zipName} onChange={(e) => setZipName(e.target.value)} placeholder={folder.name}
                  className="flex-1 px-3 py-2 bg-gray-50 rounded-l-xl border border-r-0 border-gray-200 text-sm focus:ring-2 focus:ring-brand-200 focus:outline-none" />
                <span className="px-3 py-2 bg-gray-100 rounded-r-xl text-sm text-gray-500 border border-l-0 border-gray-200">.zip</span>
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wider">
              Recipients <span className="text-red-500">*</span>
            </label>
            <EmailChipInput value={emails} onChange={setEmails} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wider">Expires After</label>
              <select value={expiry} onChange={(e) => setExpiry(e.target.value)} className="w-full px-3 py-2 bg-gray-50 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-brand-200 focus:outline-none">
                <option value="1">1 hour</option>
                <option value="24">1 day</option>
                <option value="72">3 days</option>
                <option value="168">1 week</option>
                <option value="720">30 days</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wider">Message</label>
              <input type="text" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Optional note…"
                className="w-full px-3 py-2 bg-gray-50 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-brand-200 focus:outline-none" />
            </div>
          </div>

          {emails.length > 0 && (
            <div className="flex items-start gap-2 px-3 py-2.5 bg-brand-50 border border-brand-100 rounded-xl text-xs text-brand-700">
              <i className="fas fa-info-circle mt-0.5 flex-shrink-0" />
              <span>
                {effectiveShareType === 'zip'
                  ? <><strong>{fileIds.length || folderFiles.length} files</strong> → <strong>{emails.length} private ZIP link{emails.length !== 1 ? 's' : ''}</strong></>
                  : <><strong>{emails.length} unique private link{emails.length !== 1 ? 's' : ''}</strong> per file.</>
                }
              </span>
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
          <button onClick={onClose} className="px-4 py-2.5 bg-gray-100 text-gray-600 rounded-xl text-sm font-bold hover:bg-gray-200 transition-all">Close</button>
          <button onClick={handleShare} disabled={sharing || emails.length === 0}
            className="flex-1 py-2.5 bg-brand-600 text-white rounded-xl text-sm font-bold hover:bg-brand-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
            {sharing ? <><i className="fas fa-spinner fa-spin text-xs" />Sharing…</> : <><i className="fas fa-paper-plane text-xs" />Share</>}
          </button>
        </div>
      </div>
    </div>
  )
}


function FolderDetailPanel({ folder, onBack, onShare }) {
  const dispatch = useDispatch()
  const { openFolder, detailLoading } = useSelector((s) => s.folders ?? {})
  const [selectedIds, setSelectedIds] = useState([])
  const [removing,    setRemoving]    = useState(false)
  const [successMsg,  setSuccessMsg]  = useState('')

  useEffect(() => {
    dispatch(fetchFolderDetail(folder.id))
    return () => dispatch(clearOpenFolder())
  }, [dispatch, folder.id])

  const files = openFolder?.files || []

  const toggleFile = (id) =>
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  const toggleAll = () =>
    setSelectedIds(selectedIds.length === files.length ? [] : files.map((f) => f.id))

  const handleRemove = async () => {
    if (!selectedIds.length) return
    setRemoving(true)
    await dispatch(removeFilesFromFolder({ folderId: folder.id, fileIds: selectedIds }))
    setSelectedIds([])
    setRemoving(false)
    setSuccessMsg(`✓ ${selectedIds.length} file(s) removed.`)
    setTimeout(() => setSuccessMsg(''), 4000)
    dispatch(fetchFolderDetail(folder.id))
  }

  if (detailLoading) return (
    <div className="flex items-center justify-center py-16 text-gray-400">
      <i className="fas fa-spinner fa-spin text-xl mr-2" />Loading folder…
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-brand-600 font-semibold transition-colors">
          <i className="fas fa-chevron-left text-xs" /> Folders
        </button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: folder.color + '20' }}>
            <i className={`fas ${folder.icon || 'fa-folder'} text-sm`} style={{ color: folder.color }} />
          </div>
          <p className="text-sm font-bold text-gray-900 truncate">{folder.name}</p>
          <span className="text-xs text-gray-400 flex-shrink-0">{files.length} file{files.length !== 1 ? 's' : ''}</span>
        </div>
        <button onClick={() => onShare(openFolder || folder, selectedIds)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 text-white rounded-lg text-xs font-bold hover:bg-brand-700 transition-all">
          <i className="fas fa-share-nodes text-[11px]" />
          Share{selectedIds.length > 0 ? ` (${selectedIds.length})` : ''}
        </button>
      </div>

      {successMsg && (
        <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-100 rounded-xl text-sm text-emerald-700">
          <i className="fas fa-circle-check flex-shrink-0" /> {successMsg}
        </div>
      )}

      {selectedIds.length > 0 && (
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-brand-50 rounded-xl border border-brand-100">
          <span className="text-xs font-bold text-brand-700">{selectedIds.length} selected</span>
          <div className="flex gap-2">
            <button onClick={() => setSelectedIds([])} className="text-xs text-brand-500 hover:text-brand-700 font-semibold">Clear</button>
            <button onClick={handleRemove} disabled={removing}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs font-bold hover:bg-red-100 transition-all disabled:opacity-50">
              <i className="fas fa-folder-minus text-[10px]" />
              {removing ? 'Removing…' : 'Remove from Folder'}
            </button>
          </div>
        </div>
      )}

      {files.length === 0 ? (
        <div className="py-12 text-center text-gray-400">
          <i className="fas fa-folder-open text-3xl mb-3 opacity-30" />
          <p className="text-sm">This folder is empty.</p>
          <p className="text-xs mt-1">Add files using the folder+ button on any file row.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-100 overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-2 bg-gray-50 border-b border-gray-100">
            <input type="checkbox"
              checked={selectedIds.length === files.length && files.length > 0}
              onChange={toggleAll}
              className="w-4 h-4 rounded accent-brand-600 flex-shrink-0"
            />
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
              {selectedIds.length === files.length && files.length > 0 ? 'Deselect all' : 'Select all'}
            </span>
          </div>
          <div className="divide-y divide-slate-50 bg-white">
            {files.map((f) => (
              <div key={f.id} onClick={() => toggleFile(f.id)}
                className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors ${selectedIds.includes(f.id) ? 'bg-brand-50' : ''}`}>
                <input type="checkbox" checked={selectedIds.includes(f.id)} onChange={() => toggleFile(f.id)}
                  onClick={(e) => e.stopPropagation()} className="w-4 h-4 rounded accent-brand-600 flex-shrink-0" />
                <div className="w-8 h-8 bg-gray-50 rounded-lg flex items-center justify-center flex-shrink-0">
                  <i className={`fas ${getFileIcon(f.mime_type)} text-sm`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">{f.original_name}</p>
                  <p className="text-[11px] text-gray-400">{f.file_size_display}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}


function FolderSidebar({ selectedFolderView, onSelectFolder, onBack, onShare }) {
  const dispatch = useDispatch()
  const { folders = [], loading = false, error = null } = useSelector((s) => s.folders ?? {})
  const [showCreate,    setShowCreate]    = useState(false)
  const [newName,       setNewName]       = useState('')
  const [newColor,      setNewColor]      = useState('#6366f1')
  const [newDesc,       setNewDesc]       = useState('')
  const [editFolder,    setEditFolder]    = useState(null)
  const [editName,      setEditName]      = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [creating,      setCreating]      = useState(false)

  useEffect(() => { dispatch(fetchFolders()) }, [dispatch])

  const handleCreate = async () => {
    if (!newName.trim()) return
    setCreating(true)
    await dispatch(createFolder({ name: newName.trim(), color: newColor, description: newDesc }))
    setNewName(''); setNewDesc(''); setNewColor('#6366f1')
    setShowCreate(false); setCreating(false)
  }

  const handleRename = async () => {
    if (!editName.trim() || !editFolder) return
    await dispatch(updateFolder({ folderId: editFolder.id, payload: { name: editName.trim(), color: editFolder.color, icon: editFolder.icon } }))
    setEditFolder(null)
  }

  const handleDelete = async () => {
    if (!deleteConfirm) return
    await dispatch(deleteFolder(deleteConfirm.id))
    if (selectedFolderView?.id === deleteConfirm.id) onBack()
    setDeleteConfirm(null)
  }

  if (selectedFolderView) {
    return <FolderDetailPanel folder={selectedFolderView} onBack={onBack} onShare={onShare} />
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Folders</h3>
        <button onClick={() => setShowCreate((v) => !v)}
          className="w-6 h-6 flex items-center justify-center bg-brand-100 text-brand-600 rounded-lg hover:bg-brand-200 transition-all" title="New folder">
          <i className="fas fa-plus text-[11px]" />
        </button>
      </div>

      {error && <p className="text-xs text-red-500 bg-red-50 px-2 py-1 rounded-lg">{error}</p>}

      {showCreate && (
        <div className="bg-gray-50 rounded-xl p-3 space-y-2 border border-gray-200">
          <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder="Folder name…" autoFocus
            className="w-full px-3 py-2 bg-white rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-brand-200 focus:outline-none" />
          <input type="text" value={newDesc} onChange={(e) => setNewDesc(e.target.value)}
            placeholder="Description (optional)…"
            className="w-full px-3 py-2 bg-white rounded-lg border border-gray-200 text-xs focus:ring-2 focus:ring-brand-200 focus:outline-none" />
          <div className="flex flex-wrap gap-1.5">
            {FOLDER_COLORS.map((c) => (
              <button key={c} onClick={() => setNewColor(c)}
                className={`w-5 h-5 rounded-full transition-all ${newColor === c ? 'ring-2 ring-offset-1 ring-brand-500 scale-110' : ''}`}
                style={{ background: c }} />
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowCreate(false)} className="flex-1 py-1.5 text-xs text-gray-500 hover:text-gray-700 font-semibold">Cancel</button>
            <button onClick={handleCreate} disabled={creating || !newName.trim()}
              className="flex-1 py-1.5 bg-brand-600 text-white rounded-lg text-xs font-bold hover:bg-brand-700 transition-all disabled:opacity-50">
              {creating ? 'Creating…' : 'Create'}
            </button>
          </div>
        </div>
      )}

      {loading && !folders.length ? (
        <div className="flex items-center justify-center py-8 text-gray-400">
          <i className="fas fa-spinner fa-spin mr-2 text-sm" /><span className="text-xs">Loading…</span>
        </div>
      ) : folders.length === 0 ? (
        <div className="py-8 text-center">
          <i className="fas fa-folder text-2xl text-slate-200 mb-2" />
          <p className="text-xs text-gray-400">No folders yet</p>
          <button onClick={() => setShowCreate(true)} className="text-xs text-brand-500 hover:underline mt-1">Create one</button>
        </div>
      ) : (
        <div className="space-y-1">
          {folders.map((f) => (
            <div key={f.id} className="group relative">
              {editFolder?.id === f.id ? (
                <div className="flex gap-1.5 items-center">
                  <input autoFocus type="text" value={editName} onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setEditFolder(null) }}
                    className="flex-1 px-2 py-1.5 text-xs bg-white rounded-lg border border-brand-300 focus:ring-2 focus:ring-brand-200 focus:outline-none" />
                  <button onClick={handleRename} className="p-1.5 bg-brand-600 text-white rounded-lg text-xs hover:bg-brand-700">
                    <i className="fas fa-check text-[10px]" />
                  </button>
                  <button onClick={() => setEditFolder(null)} className="p-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs hover:bg-gray-200">
                    <i className="fas fa-xmark text-[10px]" />
                  </button>
                </div>
              ) : (
                <button onClick={() => onSelectFolder(f)}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-gray-100 transition-colors text-left group">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: f.color + '20' }}>
                    <i className={`fas ${f.icon || 'fa-folder'} text-sm`} style={{ color: f.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-gray-700 truncate">{f.name}</p>
                    <p className="text-[10px] text-gray-400">{fmt(f.file_count)} file{f.file_count !== 1 ? 's' : ''}</p>
                  </div>
                  <div className="hidden group-hover:flex items-center gap-1 flex-shrink-0">
                    <button onClick={(e) => { e.stopPropagation(); setEditFolder(f); setEditName(f.name) }}
                      className="p-1 text-gray-400 hover:text-brand-500 rounded transition-colors" title="Rename">
                      <i className="fas fa-pen text-[10px]" />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); setDeleteConfirm(f) }}
                      className="p-1 text-gray-400 hover:text-red-500 rounded transition-colors" title="Delete">
                      <i className="fas fa-trash text-[10px]" />
                    </button>
                  </div>
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {deleteConfirm && (
        <div className="modal-overlay">
          <div className="modal-panel p-6 max-w-sm">
            <h3 className="text-base font-bold text-gray-900 mb-2">Delete "{deleteConfirm.name}"?</h3>
            <p className="text-sm text-gray-500 mb-5">Folder removed — <strong>files are not deleted</strong>.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-2.5 bg-gray-100 text-gray-600 rounded-xl text-sm font-bold hover:bg-gray-200 transition-all">Cancel</button>
              <button onClick={handleDelete} className="flex-1 py-2.5 bg-red-500 text-white rounded-xl text-sm font-bold hover:bg-red-600 transition-all">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


export default function Files() {
  const dispatch = useDispatch()
  const { files, pagination, loading, uploading, storage, error } = useSelector((s) => s.files)

  const [dragActive,        setDragActive]        = useState(false)
  const [search,            setSearch]            = useState('')
  const [ordering,          setOrdering]          = useState('-uploaded_at')
  const [selectedFiles,     setSelectedFiles]     = useState([])
  const [renamedCount,      setRenamedCount]      = useState(0)
  const [uploadSuccess,     setUploadSuccess]     = useState(null)
  const [duplicateQueue,    setDuplicateQueue]    = useState([])
  const [duplicateModal,    setDuplicateModal]    = useState(null)
  const [checkedFiles,      setCheckedFiles]      = useState([])
  const [duplicateChecking, setDuplicateChecking] = useState(false)

  const [deleteConfirm,  setDeleteConfirm]  = useState(null)
  const [previewFile,    setPreviewFile]    = useState(null)
  const [previewBlobUrl, setPreviewBlobUrl] = useState(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [renameFile,     setRenameFile]     = useState(null)
  const [newFileName,    setNewFileName]    = useState('')
  const [renameError,    setRenameError]    = useState(null)
  const [starLoading,    setStarLoading]    = useState({})
  const [localFavs,      setLocalFavs]      = useState({})

  const [batchSelected,      setBatchSelected]      = useState([])
  const [batchDeleteConfirm, setBatchDeleteConfirm] = useState(false)
  const [batchDeleting,      setBatchDeleting]      = useState(false)

  const [showFolderPanel,    setShowFolderPanel]    = useState(false)
  const [selectedFolderView, setSelectedFolderView] = useState(null)
  const [addToFolderFiles,   setAddToFolderFiles]   = useState(null)
  const [shareModal,         setShareModal]          = useState(null)
  const [shareFile,          setShareFile]           = useState(null)

  const [expiryOption, setExpiryOption] = useState('never')  // for the upload batch
  const [expiryFile,   setExpiryFile]   = useState(null)     // per-file expiry modal target

  const fileInputRef = useRef()
  const filesRef     = useRef(files)
  useEffect(() => { filesRef.current = files }, [files])

  const searchRef   = useRef(search)
  const orderingRef = useRef(ordering)
  useEffect(() => { searchRef.current = search },     [search])
  useEffect(() => { orderingRef.current = ordering }, [ordering])

  useEffect(() => {
    dispatch(fetchFiles())
    dispatch(fetchStorage())
    dispatch(fetchFolders())
  }, [dispatch])

  // needing to refresh the page.
  useEffect(() => {
    const intervalId = setInterval(() => {
      dispatch(fetchFiles({ page: pagination.current_page ?? 1, search: searchRef.current, ordering: orderingRef.current }))
      dispatch(fetchStorage())
    }, POLL_INTERVAL_MS)

    return () => clearInterval(intervalId)   // clean up on unmount
  }, [dispatch, pagination.current_page])

  useEffect(() => {
    const map = {}
    files.forEach((f) => { map[f.id] = f.is_favorite })
    setLocalFavs(map)
  }, [files])

  const currentPage = Math.min(pagination.current_page ?? 1, pagination.total_pages ?? 1)

  const goToPage = (page) => {
    const safe = Math.max(1, Math.min(page, pagination.total_pages ?? 1))
    dispatch(fetchFiles({ page: safe, search, ordering }))
    setBatchSelected([])
  }

  useEffect(() => {
    if (previewBlobUrl) { URL.revokeObjectURL(previewBlobUrl); setPreviewBlobUrl(null) }
    if (!previewFile) return
    const isMedia = previewFile.mime_type?.includes('image') ||
      previewFile.mime_type?.includes('video') || previewFile.mime_type?.includes('audio') ||
      previewFile.mime_type?.includes('pdf')
    if (!isMedia) return
    let cancelled = false
    setPreviewLoading(true)
    downloadFile(previewFile.id)
      .then(({ data }) => {
        if (!cancelled) {
          const blob = new Blob([data], {
            type: previewFile.mime_type || data.type || 'application/octet-stream',
          })
          setPreviewBlobUrl(URL.createObjectURL(blob))
        }
      })
      .catch(() => { if (!cancelled) setPreviewBlobUrl(null) })
      .finally(() => { if (!cancelled) setPreviewLoading(false) })
    return () => { cancelled = true }
  }, [previewFile]) // eslint-disable-line
  useEffect(() => () => { if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl) }, [previewBlobUrl])

  useEffect(() => {
    if (!uploadSuccess) return
    const t = setTimeout(() => setUploadSuccess(null), 4000)
    return () => clearTimeout(t)
  }, [uploadSuccess])

  const runDuplicateChecks = async (rawFiles) => {
    if (!rawFiles.length) return
    setDuplicateChecking(true)
    const cleared = [], dupes = []
    for (const f of rawFiles) {
      try {
        const sha256   = await computeSHA256(f)
        const { data } = await checkDuplicate(sha256)
        if (data.data?.is_duplicate) dupes.push({ file: f, existingFile: data.data.existing_file })
        else cleared.push(f)
      } catch { cleared.push(f) }
    }
    setDuplicateChecking(false)
    if (dupes.length > 0) { setCheckedFiles(cleared); setDuplicateQueue(dupes); setDuplicateModal(dupes[0]) }
    else _stageAll(cleared)
  }

  const resolveDuplicate = (action, file) => {
    const [current, ...remaining] = duplicateQueue
    let extra = null
    if (action === 'rename') extra = resolveFileName(file, new Set(filesRef.current.map((f) => f.original_name)))
    else if (action === 'replace') { if (current?.existingFile?.id) apiDeleteFile(current.existingFile.id).catch(() => {}); extra = file }
    const nextChecked = extra ? [...checkedFiles, extra] : [...checkedFiles]
    if (remaining.length > 0) { setDuplicateQueue(remaining); setDuplicateModal(remaining[0]); setCheckedFiles(nextChecked) }
    else { setDuplicateQueue([]); setDuplicateModal(null); setCheckedFiles([]); _stageAll(nextChecked) }
  }

  const _stageAll = (rawFiles) => {
    if (!rawFiles.length) return
    const { resolved, renamedCount } = stageFiles(rawFiles, filesRef.current)
    setSelectedFiles(resolved); setRenamedCount(renamedCount)
  }

  const openFilePicker = (e) => { if (e) e.stopPropagation(); fileInputRef.current?.click() }
  const handleDrag = (e) => { e.preventDefault(); e.stopPropagation(); setDragActive(e.type !== 'dragleave') }
  const handleDrop = (e) => { e.preventDefault(); e.stopPropagation(); setDragActive(false); runDuplicateChecks(Array.from(e.dataTransfer.files)) }
  const handleFileSelect = (e) => { runDuplicateChecks(Array.from(e.target.files || [])); e.target.value = '' }

  const handleUpload = async () => {
    if (!selectedFiles.length) return
    const count  = selectedFiles.length
    const result = await dispatch(upload({ files: selectedFiles, expiryOption }))
    if (!result.error) {
      setUploadSuccess(count === 1 ? `"${selectedFiles[0].name}" uploaded!` : `${count} files uploaded!`)
      await dispatch(fetchFiles({ search, ordering }))
      dispatch(fetchStorage())
    }
    setSelectedFiles([]); setRenamedCount(0)
  }

  const handleDownload = async (file) => {
    const toastId = toast.loading(`Downloading ${file.original_name}...`)
    try {
      const { data } = await downloadFile(file.id)
      const blob = new Blob([data], {
        type: file.mime_type || data.type || 'application/octet-stream',
      })
      const url = window.URL.createObjectURL(blob)
      const a   = document.createElement('a')
      a.href = url; a.download = file.original_name; a.click()
      window.URL.revokeObjectURL(url)
      toast.success('Download successful!', { id: toastId })
    } catch { toast.error('Download failed.', { id: toastId }) }
  }

  const handleOpenPreview = () => {
    if (!previewBlobUrl) return
    window.open(previewBlobUrl, '_blank')
  }

  const handleDelete = async (fileId) => {
    await dispatch(remove(fileId))
    setDeleteConfirm(null)
    dispatch(fetchStorage())
    setBatchSelected((prev) => prev.filter((id) => id !== fileId))
  }

  const isAllSelected  = files.length > 0 && batchSelected.length === files.length
  const toggleBatch    = (id) => setBatchSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  const toggleAllBatch = () => setBatchSelected(isAllSelected ? [] : files.map((f) => f.id))

  const handleBatchDelete = async () => {
    setBatchDeleting(true)
    for (const id of batchSelected) await dispatch(remove(id))
    setBatchSelected([]); setBatchDeleteConfirm(false); setBatchDeleting(false)
    dispatch(fetchStorage())
    dispatch(fetchFiles({ page: currentPage, search, ordering }))
  }

  const handleToggleFavorite = async (file) => {
    const wasFav = localFavs[file.id] ?? file.is_favorite
    setLocalFavs((prev) => ({ ...prev, [file.id]: !prev[file.id] }))
    setStarLoading((prev) => ({ ...prev, [file.id]: true }))
    try {
      await toggleFavorite(file.id)
      await dispatch(fetchFiles({ page: currentPage, search, ordering }))
      toast.success(wasFav ? 'File removed from starred' : 'File starred')
    } catch {
      setLocalFavs((prev) => ({ ...prev, [file.id]: file.is_favorite }))
      toast.error('Failed to update favourite.')
    } finally {
      setStarLoading((prev) => ({ ...prev, [file.id]: false }))
    }
  }

  const handleRename = async () => {
    if (!newFileName.trim()) { setRenameError('Filename cannot be empty.'); return }
    const ext     = getExt(renameFile.original_name)
    const fullNew = newFileName.trim() + ext
    if (files.some((f) => f.original_name.toLowerCase() === fullNew.toLowerCase() && f.id !== renameFile.id)) {
      setRenameError(`"${fullNew}" already exists.`); return
    }
    const result = await dispatch(rename({ fileId: renameFile.id, newName: newFileName }))
    if (!result.error) { setRenameFile(null); setNewFileName(''); setRenameError(null) }
    else setRenameError(result.payload || 'Rename failed.')
  }

  const handleExpiryUpdated = () => {
    dispatch(fetchFiles({ page: currentPage, search, ordering }))
  }

  const actualUsedPercentage = storage && storage.total_bytes > 0
    ? Math.round((storage.used_bytes / storage.total_bytes) * 100)
    : 0
  const usedPercentage = Math.min(100, Math.max(0, actualUsedPercentage))
  const storageOverQuota = storage?.total_bytes > 0 && storage.used_bytes > storage.total_bytes

  return (
    <div className="w-full">
      <input ref={fileInputRef} type="file" multiple onChange={handleFileSelect} className="hidden" aria-hidden="true" />

      <div>

                <header className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-6">
          <div>
            <h2 className="page-title">My Storage</h2>
            <p className="text-gray-500 mt-1 flex items-center gap-2 text-sm">
              <i className="fas fa-folder-open text-brand-500" />
              {storage?.file_count ?? 0} files stored
            </p>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button type="button" onClick={() => setShowFolderPanel((v) => !v)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors border ${showFolderPanel ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50'}`}>
              <i className="fas fa-folder text-base" />
              <span className="hidden sm:inline">Folders</span>
            </button>
            <button onClick={openFilePicker}
              className="btn-primary flex-1 sm:flex-none sm:w-auto">
              <i className="fas fa-plus" /> New Upload
            </button>
          </div>
        </header>

        {error && <Alert type="error" message={error} className="mb-5 rounded-lg" />}

        {storageOverQuota && (
          <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-start gap-3">
            <i className="fas fa-triangle-exclamation text-red-500 mt-0.5" />
            <div>Storage limit exceeded. Delete files or empty trash to resume uploading.</div>
          </div>
        )}
        {duplicateChecking && (
          <div className="mb-5 flex items-center gap-3 px-5 py-4 bg-blue-50 border border-blue-200 rounded-lg shadow-sm">
            <i className="fas fa-spinner fa-spin text-blue-500" />
            <div>
              <p className="text-sm font-bold text-blue-800">Checking for duplicates…</p>
              <p className="text-xs text-blue-500">Computing file fingerprints</p>
            </div>
          </div>
        )}

        {uploadSuccess && (
          <div className="mb-5 flex items-center gap-3 px-5 py-4 bg-green-50 border border-green-200 rounded-lg shadow-sm">
            <div className="w-8 h-8 bg-green-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <i className="fas fa-circle-check text-green-600" />
            </div>
            <p className="text-sm font-bold text-green-800 flex-1">{uploadSuccess}</p>
            <button onClick={() => setUploadSuccess(null)} className="text-green-400 hover:text-green-600">
              <i className="fas fa-times text-sm" />
            </button>
          </div>
        )}

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-6">
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-50 flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center mb-4">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Storage</span>
                <i className="fas fa-database text-orange-400" />
              </div>
              <h3 className="text-2xl font-bold text-gray-800">{usedPercentage}% Full</h3>
              <p className="text-xs text-gray-400 mt-1">{storage?.used_mb} MB of {storage?.total_gb} GB used</p>
            </div>
            <div className="mt-5">
              <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-brand-600 rounded-full transition-all duration-1000" style={{ width: `${usedPercentage}%` }} />
              </div>
            </div>
          </div>
          <div role="button" tabIndex={0}
            onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}
            onClick={openFilePicker} onKeyDown={(e) => e.key === 'Enter' && openFilePicker()}
            className={`lg:col-span-2 rounded-lg p-6 border border-dashed transition-all cursor-pointer flex items-center justify-center gap-6 select-none ${dragActive ? 'border-brand-500 bg-brand-50/50' : 'border-gray-200 bg-white hover:border-brand-300 hover:bg-brand-50/20'}`}>
            <div className="w-16 h-16 rounded-lg bg-brand-50 text-brand-500 flex items-center justify-center text-2xl pointer-events-none">
              <i className={`fas ${duplicateChecking || uploading ? 'fa-spinner fa-spin' : 'fa-cloud-arrow-up'}`} />
            </div>
            <div className="pointer-events-none">
              <p className="font-bold text-gray-800">Drop files here to upload</p>
              <p className="text-sm text-gray-400">Duplicates detected &amp; handled automatically</p>
            </div>
          </div>
        </div>

                {selectedFiles.length > 0 && (
          <div className="bg-brand-50 border border-brand-200 dark:bg-gray-900 dark:border-gray-800 rounded-lg p-5 mb-6 text-brand-950 dark:text-white">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                            <div className="flex items-center gap-4 min-w-0">
                <div className="w-12 h-12 bg-brand-200/50 dark:bg-white/10 rounded-lg flex items-center justify-center flex-shrink-0">
                  <i className="fas fa-file-circle-plus text-xl text-brand-700 dark:text-white" />
                </div>
                <div className="min-w-0">
                  <p className="font-bold">{selectedFiles.length} file{selectedFiles.length !== 1 ? 's' : ''} ready</p>
                  <p className="text-xs text-brand-700/80 dark:text-brand-200 truncate">{selectedFiles.map((f) => f.name).join(', ').slice(0, 60)}…</p>
                  {renamedCount > 0 && (
                    <p className="text-xs text-amber-600 dark:text-amber-300 font-semibold mt-0.5 flex items-center gap-1">
                      <i className="fas fa-triangle-exclamation" />{renamedCount} renamed to avoid conflicts
                    </p>
                  )}
                </div>
              </div>

                            <div className="flex gap-2 w-full sm:w-auto flex-shrink-0">
                <button onClick={() => { setSelectedFiles([]); setRenamedCount(0) }} className="px-4 py-2 text-sm font-bold text-brand-700 hover:text-brand-900 dark:text-brand-200 dark:hover:text-white">Cancel</button>
                <button onClick={handleUpload} disabled={uploading}
                  className="px-6 py-2 bg-brand-600 text-white rounded-xl font-bold text-sm hover:bg-brand-700 transition-all flex items-center gap-2 disabled:opacity-60">
                  {uploading ? <><i className="fas fa-spinner fa-spin" />Uploading…</> : <><i className="fas fa-upload" />Upload</>}
                </button>
              </div>
            </div>

                        <div className="mt-4 pt-4 border-t border-brand-200/60 dark:border-white/10 flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="flex items-center gap-2 flex-shrink-0">
                <i className="fas fa-clock text-brand-500 dark:text-brand-300 text-sm" />
                <span className="text-xs font-bold text-brand-700 dark:text-brand-200 uppercase tracking-wider">Auto-delete</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {EXPIRY_OPTIONS.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setExpiryOption(value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                      expiryOption === value
                        ? 'bg-brand-600 text-white border-brand-600 dark:bg-white dark:text-gray-900 dark:border-white'
                        : 'bg-white/50 text-brand-700 border-brand-200 hover:bg-white dark:bg-white/10 dark:text-brand-200 dark:border-white/20 dark:hover:bg-white/20'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {expiryOption !== 'never' && (
                <span className="text-[11px] text-amber-600 dark:text-amber-300 font-semibold flex items-center gap-1 ml-auto">
                  <i className="fas fa-triangle-exclamation text-[10px]" />
                  Files will auto-delete after {EXPIRY_OPTIONS.find((o) => o.value === expiryOption)?.label.toLowerCase()}
                </span>
              )}
            </div>
          </div>
        )}

                <div className={`grid gap-5 ${showFolderPanel ? 'lg:grid-cols-[1fr_280px]' : 'grid-cols-1'}`}>

                    <div className="table-shell overflow-hidden">
                        <div className="flex flex-col gap-3 border-b border-gray-200 p-4 sm:flex-row sm:items-center sm:justify-between">
              <h4 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                <i className="fas fa-list text-brand-500" /> All Files
                {batchSelected.length > 0 && (
                  <span className="ml-2 px-2.5 py-0.5 bg-brand-100 text-brand-700 text-xs font-bold rounded-full">
                    {batchSelected.length} selected
                  </span>
                )}
              </h4>
              <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
                {batchSelected.length > 0 && (
                  <>
                    <button type="button"
                      onClick={(e) => { e.stopPropagation(); setAddToFolderFiles([...batchSelected]) }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-50 text-brand-700 rounded-xl text-xs font-bold hover:bg-brand-100 transition-all">
                      <i className="fas fa-folder-plus text-[11px]" /> Add to folder
                    </button>
                    <button onClick={() => setBatchDeleteConfirm(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 rounded-xl text-xs font-bold hover:bg-red-100 transition-all">
                      <i className="fas fa-trash text-[11px]" /> Delete ({batchSelected.length})
                    </button>
                    <button onClick={() => setBatchSelected([])} className="text-xs text-gray-400 hover:text-gray-600 px-2">Clear</button>
                  </>
                )}
                <select value={ordering}
                  onChange={(e) => { setOrdering(e.target.value); dispatch(fetchFiles({ page: 1, search, ordering: e.target.value })) }}
                  className="px-3 py-2 bg-gray-50 border-none rounded-xl text-xs font-bold text-gray-500 focus:ring-2 focus:ring-brand-100 cursor-pointer">
                  <option value="-uploaded_at">Newest</option>
                  <option value="uploaded_at">Oldest</option>
                  <option value="original_name">A–Z</option>
                  <option value="-original_name">Z–A</option>
                  <option value="-file_size">Largest</option>
                  <option value="file_size">Smallest</option>
                </select>
                <div className="relative">
                  <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-300 text-xs" />
                  <input type="text" placeholder="Search…" value={search}
                    onChange={(e) => { setSearch(e.target.value); dispatch(fetchFiles({ page: 1, search: e.target.value, ordering })); setBatchSelected([]) }}
                    className="field w-full sm:w-48 pl-9 py-2" />
                </div>
              </div>
            </div>

            <div className="p-2">
              {loading && !files.length ? (
                <div className="empty-state">
                  <div className="empty-state-icon"><i className="fas fa-circle-notch fa-spin" /></div>
                  <p className="text-sm text-gray-500">Fetching your files…</p>
                </div>
              ) : files.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-icon"><i className="fas fa-folder-open" /></div>
                  <p className="text-sm font-medium text-gray-900">No files found</p>
                  <p className="mt-1 text-sm text-gray-500">Upload a file or adjust your search.</p>
                  <button type="button" onClick={openFilePicker} className="btn-primary mt-4">Upload first file</button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="table-head border-b border-gray-200">
                      <tr>
                        <th className="table-th w-10">
                          <input type="checkbox" checked={isAllSelected} onChange={toggleAllBatch}
                            className="h-4 w-4 rounded border-gray-300 accent-brand-600" title="Select all" />
                        </th>
                        <th className="table-th">File Name</th>
                        <th className="table-th hidden md:table-cell">Size</th>
                        <th className="table-th hidden lg:table-cell">Expiry</th><th className="table-th hidden sm:table-cell">Uploaded</th>
                        <th className="table-th text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {files.map((file) => {
                        const isFav      = localFavs[file.id] ?? file.is_favorite
                        const isBatched  = batchSelected.includes(file.id)
                        const expiryInfo = getExpiryInfo(file.expires_at)

                        return (
                          <tr key={file.id}
                            className={`table-row ${isBatched ? 'bg-indigo-900/40 dark:bg-indigo-900/40' : ''}`}>

                            <td className="table-td w-10">
                              <input type="checkbox" checked={isBatched}
                                onChange={() => toggleBatch(file.id)}
                                onClick={(e) => e.stopPropagation()}
                                className="w-4 h-4 rounded accent-brand-600" />
                            </td>

                            <td className="table-td">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-brand-50 rounded-xl flex items-center justify-center flex-shrink-0">
                                  <i className={`fas ${getFileIcon(file.mime_type)} text-base`} />
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <p className="text-sm font-bold text-gray-800 truncate max-w-[120px] sm:max-w-xs">{file.original_name}</p>
                                    {isFav && <i className="fas fa-star text-yellow-400 text-[10px] flex-shrink-0" />}
                                    {expiryInfo?.variant === 'expired' && (
                                      <span className="lg:hidden inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-red-100 text-red-600 text-[9px] font-bold rounded-full flex-shrink-0">
                                        <i className="fas fa-clock text-[8px]" /> Expired
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[10px] text-gray-400 uppercase md:hidden">{file.file_size_display}</p>
                                  {expiryInfo && expiryInfo.variant !== 'expired' && (
                                    <p className={`lg:hidden text-[10px] font-semibold flex items-center gap-1 ${variantClasses[expiryInfo.variant]}`}>
                                      <i className="fas fa-clock text-[9px]" />{expiryInfo.label}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </td>

                            <td className="table-td hidden md:table-cell">
                              <span className="text-sm text-gray-500">{file.file_size_display}</span>
                            </td>

                            <td className="table-td hidden lg:table-cell">
                              {expiryInfo ? (
                                <span
                                  className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-lg ${
                                    expiryInfo.variant === 'expired'
                                      ? 'bg-red-50 text-red-600'
                                      : expiryInfo.variant === 'critical'
                                      ? 'bg-orange-50 text-orange-600'
                                      : expiryInfo.variant === 'warning'
                                      ? 'bg-amber-50 text-amber-600'
                                      : 'bg-gray-50 text-gray-500'
                                  }`}
                                >
                                  <i className={`fas fa-clock text-[9px] ${expiryInfo.variant === 'expired' ? 'text-red-400' : ''}`} />
                                  {expiryInfo.label}
                                </span>
                              ) : (
                                <span className="text-xs text-slate-300 font-medium">Never</span>
                              )}
                            </td>

                            <td className="table-td hidden sm:table-cell">
                              <span className="text-sm text-gray-500">{new Date(file.uploaded_at).toLocaleDateString()}</span>
                            </td>

                                                        <td className="table-td text-right">
                              <div className="flex justify-end items-center gap-0.5">

                                                                <button onClick={(e) => { e.stopPropagation(); setPreviewFile(file) }}
                                  className="p-2 text-gray-400 hover:text-brand-600 transition-colors" title="Preview">
                                  <i className="fas fa-eye text-sm" />
                                </button>

                                                                <button onClick={(e) => { e.stopPropagation(); handleDownload(file) }}
                                  className="p-2 text-gray-400 hover:text-brand-600 transition-colors" title="Download">
                                  <i className="fas fa-download text-sm" />
                                </button>

                                                                <button onClick={(e) => { e.stopPropagation(); handleToggleFavorite(file) }}
                                  disabled={!!starLoading[file.id]}
                                  className={`p-2 transition-colors disabled:opacity-50 ${isFav ? 'text-yellow-400 hover:text-yellow-500' : 'text-gray-400 hover:text-yellow-400'}`}
                                  title={isFav ? 'Unstar' : 'Star'}>
                                  <i className={`fas ${starLoading[file.id] ? 'fa-spinner fa-spin' : 'fa-star'} text-sm`} />
                                </button>

                                                                <button onClick={(e) => { e.stopPropagation(); setRenameFile(file); setNewFileName(stripExt(file.original_name)); setRenameError(null) }}
                                  className="p-2 text-gray-400 hover:text-amber-500 transition-colors" title="Rename">
                                  <i className="fas fa-pen-to-square text-sm" />
                                </button>

                                                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); setShareFile(file) }}
                                  className="p-2 text-gray-400 hover:text-sky-500 transition-colors"
                                  title="Share via email"
                                >
                                  <i className="fas fa-share-nodes text-sm" />
                                </button>

                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); setExpiryFile(file) }}
                                  className={`p-2 transition-colors ${
                                    expiryInfo
                                      ? expiryInfo.variant === 'expired'
                                        ? 'text-red-400 hover:text-red-500'
                                        : expiryInfo.variant === 'critical' || expiryInfo.variant === 'warning'
                                        ? 'text-amber-400 hover:text-amber-500'
                                        : 'text-gray-400 hover:text-brand-500'
                                      : 'text-gray-400 hover:text-brand-500'
                                  }`}
                                  title={expiryInfo ? 'Edit expiry' : 'Set auto-delete'}
                                >
                                  <i className="fas fa-clock text-sm" />
                                </button>

                                                                <button type="button"
                                  onClick={(e) => { e.stopPropagation(); setAddToFolderFiles([file.id]) }}
                                  className="p-2 text-gray-400 hover:text-brand-500 transition-colors" title="Add to folder">
                                  <i className="fas fa-folder-plus text-sm" />
                                </button>

                                                                <button onClick={(e) => { e.stopPropagation(); setDeleteConfirm(file.id) }}
                                  className="p-2 text-gray-400 hover:text-red-500 transition-colors" title="Move to trash">
                                  <i className="fas fa-trash-can text-sm" />
                                </button>

                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

                    {showFolderPanel && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-50 p-4 h-fit">
              <FolderSidebar
                selectedFolderView={selectedFolderView}
                onSelectFolder={(f) => setSelectedFolderView(f)}
                onBack={() => setSelectedFolderView(null)}
                onShare={(folder, fileIds) => setShareModal({ folder, fileIds: fileIds || [] })}
              />
            </div>
          )}
        </div>

                {(pagination.total_pages ?? 1) > 1 && (() => {
          const totalPages = pagination.total_pages
          const canPrev = currentPage > 1, canNext = currentPage < totalPages
          const nums = []; for (let i = 1; i <= totalPages; i++) { if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) nums.push(i) }
          const items = []; nums.forEach((n, idx) => { if (idx > 0 && n - nums[idx - 1] > 1) items.push('e' + n); items.push(n) })
          return (
            <div className="mt-6 flex justify-center items-center gap-2 flex-wrap">
              <button disabled={!canPrev} onClick={() => goToPage(currentPage - 1)}
                className="w-10 h-10 flex items-center justify-center rounded-xl bg-white border border-gray-100 text-gray-500 disabled:opacity-30 hover:border-brand-300 transition-all">
                <i className="fas fa-chevron-left text-xs" />
              </button>
              {items.map((item) => typeof item === 'string' ? (
                <span key={item} className="w-10 h-10 flex items-center justify-center text-gray-400 text-sm">…</span>
              ) : (
                <button key={item} onClick={() => goToPage(item)}
                  className={`w-10 h-10 flex items-center justify-center rounded-xl text-sm font-bold border transition-all ${item === currentPage ? 'bg-brand-600 text-white border-brand-600 shadow-md' : 'bg-white text-gray-600 border-gray-100 hover:border-brand-300'}`}>
                  {item}
                </button>
              ))}
              <button disabled={!canNext} onClick={() => goToPage(currentPage + 1)}
                className="w-10 h-10 flex items-center justify-center rounded-xl bg-white border border-gray-100 text-gray-500 disabled:opacity-30 hover:border-brand-300 transition-all">
                <i className="fas fa-chevron-right text-xs" />
              </button>
              <span className="w-full text-center text-xs text-gray-400 mt-1">Page {currentPage} of {totalPages}</span>
            </div>
          )
        })()}
      </div>

      {duplicateModal && (
        <DuplicateModal
          duplicateFile={duplicateModal.existingFile}
          newFileName={duplicateModal.file.name}
          onRename={() => resolveDuplicate('rename', duplicateModal.file)}
          onReplace={() => resolveDuplicate('replace', duplicateModal.file)}
          onCancel={() => resolveDuplicate('cancel', duplicateModal.file)}
        />
      )}

      {deleteConfirm && (
        <div className="modal-overlay">
          <div className="bg-white rounded-lg p-8 max-w-sm w-full">
            <div className="w-16 h-16 bg-red-50 text-red-500 rounded-lg flex items-center justify-center text-2xl mx-auto mb-6">
              <i className="fas fa-trash-can" />
            </div>
            <h3 className="text-xl font-bold text-center text-gray-900 mb-2">Move to Trash?</h3>
            <p className="text-sm text-center text-gray-500 mb-8">You can restore it within 30 days.</p>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="py-3 font-bold text-gray-400 hover:text-gray-600">Cancel</button>
              <button onClick={() => handleDelete(deleteConfirm)}
                className="py-3 bg-red-500 text-white rounded-lg font-bold hover:bg-red-600 transition-all shadow-lg shadow-red-100">
                Move to Trash
              </button>
            </div>
          </div>
        </div>
      )}

      {batchDeleteConfirm && (
        <div className="modal-overlay">
          <div className="bg-white rounded-lg p-8 max-w-sm w-full">
            <div className="w-16 h-16 bg-red-50 text-red-500 rounded-lg flex items-center justify-center text-2xl mx-auto mb-6">
              <i className="fas fa-trash-can" />
            </div>
            <h3 className="text-xl font-bold text-center text-gray-900 mb-2">Move {batchSelected.length} files to Trash?</h3>
            <p className="text-sm text-center text-gray-500 mb-8">You can restore them within 30 days.</p>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setBatchDeleteConfirm(false)} className="py-3 font-bold text-gray-400 hover:text-gray-600">Cancel</button>
              <button onClick={handleBatchDelete} disabled={batchDeleting}
                className="py-3 bg-red-500 text-white rounded-lg font-bold hover:bg-red-600 transition-all shadow-lg shadow-red-100 disabled:opacity-60 flex items-center justify-center gap-2">
                {batchDeleting ? <><i className="fas fa-spinner fa-spin text-sm" />Deleting…</> : 'Move to Trash'}
              </button>
            </div>
          </div>
        </div>
      )}

      {renameFile && (
        <div className="modal-overlay">
          <div className="bg-white rounded-lg p-8 max-w-md w-full">
            <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
              <i className="fas fa-pen-to-square text-brand-500" /> Rename File
            </h3>
            <div className="space-y-4">
              <div className="p-4 bg-brand-50 rounded-lg">
                <p className="text-[10px] font-bold text-brand-500 uppercase mb-1">Current Name</p>
                <p className="text-sm font-medium text-gray-900 truncate">{renameFile.original_name}</p>
              </div>
              {renameError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2">
                  <i className="fas fa-circle-exclamation text-red-500 mt-0.5 flex-shrink-0" />
                  <p className="text-xs font-bold text-red-600">{renameError}</p>
                </div>
              )}
              <div className="relative">
                <input type="text" value={newFileName}
                  onChange={(e) => { setNewFileName(e.target.value); setRenameError(null) }}
                  onKeyDown={(e) => e.key === 'Enter' && handleRename()}
                  className="w-full px-5 py-4 bg-gray-50 border-none rounded-lg font-bold text-gray-800 focus:ring-2 focus:ring-brand-100"
                  placeholder="New filename…" autoFocus />
                <span className="absolute right-5 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-sm">{getExt(renameFile.original_name)}</span>
              </div>
              <p className="text-xs text-gray-500">Extension is protected and cannot be changed.</p>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-8">
              <button onClick={() => { setRenameFile(null); setRenameError(null) }} className="py-3 font-bold text-gray-400 hover:text-gray-600">Cancel</button>
              <button onClick={handleRename} disabled={!newFileName.trim()}
                className="py-3 bg-brand-600 text-white rounded-lg font-bold hover:bg-brand-700 transition-all disabled:opacity-50">
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {previewFile && (
        <div className="modal-overlay">
          <div className="bg-white rounded-lg p-8 w-full max-h-[90vh] overflow-y-auto max-w-lg">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-bold text-gray-900 text-lg">Preview</h3>
              <button onClick={() => setPreviewFile(null)} className="text-gray-400 hover:text-gray-600 text-xl"><i className="fas fa-times" /></button>
            </div>
            {previewFile.mime_type?.includes('image') ? (
              <div className="mb-6 rounded-lg overflow-hidden bg-gray-50 border border-gray-100 flex items-center justify-center min-h-[120px]">
                {previewLoading
                  ? <div className="py-12 flex flex-col items-center gap-3 text-gray-400"><i className="fas fa-circle-notch fa-spin text-2xl text-brand-500" /><p className="text-xs">Loading…</p></div>
                  : previewBlobUrl
                    ? <img src={previewBlobUrl} alt={previewFile.original_name} className="w-full max-h-72 object-contain" />
                    : <div className="py-12 flex flex-col items-center gap-2 text-gray-400"><i className="fas fa-image text-4xl text-blue-300" /><p className="text-sm">Preview unavailable</p></div>}
              </div>
            ) : previewFile.mime_type?.includes('video') ? (
              <div className="mb-6 rounded-lg overflow-hidden bg-black">
                {previewLoading
                  ? <div className="py-12 flex items-center justify-center"><i className="fas fa-circle-notch fa-spin text-2xl text-white" /></div>
                  : previewBlobUrl ? <video controls className="w-full max-h-64" src={previewBlobUrl} /> : null}
              </div>
            ) : previewFile.mime_type?.includes('audio') ? (
              <div className="mb-6 p-6 bg-brand-50 rounded-lg">
                {previewLoading
                  ? <div className="flex items-center justify-center gap-3 text-brand-500 py-2"><i className="fas fa-circle-notch fa-spin" /></div>
                  : previewBlobUrl ? <audio controls className="w-full" src={previewBlobUrl} /> : null}
              </div>
            ) : previewFile.mime_type?.includes('pdf') ? (
              <div className="mb-6 rounded-lg overflow-hidden bg-gray-50 border border-gray-100"
                style={{ height: '520px', overflow: 'hidden', position: 'relative' }}>
                {previewLoading ? (
                  <div className="h-full flex flex-col items-center justify-center gap-3 text-gray-400">
                    <i className="fas fa-circle-notch fa-spin text-2xl text-brand-500" />
                    <p className="text-xs">Loading PDF…</p>
                  </div>
                ) : previewBlobUrl ? (
                  <iframe
                    src={`${previewBlobUrl}#toolbar=0&navpanes=0&scrollbar=0&view=FitH&page=1`}
                    title={previewFile.original_name}
                    style={{
                      border: 'none',
                      display: 'block',
                      width: '100%',
                      height: '580px',
                      position: 'absolute',
                      top: '-46px',
                      left: 0,
                    }}
                  />
                ) : (
                  <div className="h-full flex flex-col items-center justify-center gap-2 text-gray-400">
                    <i className="fas fa-file-pdf text-4xl text-red-300" />
                    <p className="text-sm">PDF preview unavailable</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="mb-6 bg-gray-50 rounded-lg p-12 text-center border border-gray-100">
                <i className={`fas ${getFileIcon(previewFile.mime_type)} text-6xl mb-3`} />
                <p className="text-xs text-gray-400 mt-1">Download to open this file</p>
              </div>
            )}
            <div className="space-y-3 mb-6">
              <div><p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Filename</p><p className="text-sm font-bold text-gray-800 break-all">{previewFile.original_name}</p></div>
              <div className="grid grid-cols-2 gap-4">
                <div><p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Size</p><p className="text-sm font-bold text-gray-800">{previewFile.file_size_display}</p></div>
                <div><p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Type</p><p className="text-sm font-bold text-gray-800 break-all">{previewFile.mime_type || 'Unknown'}</p></div>
              </div>
                            {previewFile.expires_at && (() => {
                const info = getExpiryInfo(previewFile.expires_at)
                return (
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Auto-delete</p>
                    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-lg ${
                      info?.variant === 'expired'  ? 'bg-red-50 text-red-600' :
                      info?.variant === 'critical' ? 'bg-orange-50 text-orange-600' :
                      info?.variant === 'warning'  ? 'bg-amber-50 text-amber-600' :
                                                     'bg-gray-50 text-gray-500'}`}>
                      <i className="fas fa-clock text-[9px]" />
                      {info?.label}
                      {' · '}
                      {new Date(previewFile.expires_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  </div>
                )
              })()}
            </div>
            <div className={`grid gap-3 ${previewFile.mime_type?.includes('pdf') ? 'grid-cols-3' : 'grid-cols-2'}`}>
              <button onClick={() => { handleDownload(previewFile); setPreviewFile(null) }}
                className="py-3 bg-brand-600 text-white rounded-lg font-bold hover:bg-brand-700 flex items-center justify-center gap-2">
                <i className="fas fa-download" /> Download
              </button>
              {previewFile.mime_type?.includes('pdf') && (
                <button onClick={handleOpenPreview}
                  disabled={!previewBlobUrl}
                  className="py-3 bg-gray-100 text-gray-700 rounded-lg font-bold hover:bg-gray-200 transition-all flex items-center justify-center gap-2">
                  <i className="fas fa-arrow-up-right-from-square" /> Open
                </button>
              )}
              <button onClick={() => { handleToggleFavorite(previewFile); setPreviewFile(null) }}
                disabled={!!starLoading[previewFile.id]}
                className={`py-3 rounded-lg font-bold transition-all flex items-center justify-center gap-2 ${(localFavs[previewFile.id] ?? previewFile.is_favorite) ? 'bg-yellow-50 text-yellow-600 hover:bg-yellow-100' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                <i className="fas fa-star" />
                {(localFavs[previewFile.id] ?? previewFile.is_favorite) ? 'Unstar' : 'Star'}
              </button>
            </div>
          </div>
        </div>
      )}

            {addToFolderFiles && (
        <AddToFolderModal
          fileIds={addToFolderFiles}
          onClose={() => setAddToFolderFiles(null)}
          onAdded={() => { setAddToFolderFiles(null); setBatchSelected([]) }}
        />
      )}

            {shareModal && (
        <FolderShareModal
          folder={shareModal.folder}
          preselectedFileIds={shareModal.fileIds}
          onClose={() => setShareModal(null)}
        />
      )}

            {shareFile && (
        <FileShareModal
          file={shareFile}
          onClose={() => setShareFile(null)}
        />
      )}

            {expiryFile && (
        <SetExpiryModal
          file={expiryFile}
          onClose={() => setExpiryFile(null)}
          onUpdated={handleExpiryUpdated}
        />
      )}
    </div>
  )
}