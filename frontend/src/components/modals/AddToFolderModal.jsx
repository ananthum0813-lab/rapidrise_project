/**
 * AddToFolderModal.jsx
 */
import { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { fetchFolders, createFolder, addFilesToFolder } from '@/store/foldersSlice'

const FOLDER_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
  '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#3b82f6', '#64748b',
]

const fmt = (n) => (n ?? 0).toLocaleString()

export default function AddToFolderModal({ fileIds, onClose, onAdded }) {
  const dispatch = useDispatch()

  // Safe selector — guards against store not yet having folders slice
  const foldersState = useSelector((s) => s.folders ?? { folders: [], loading: false })
  const { folders = [], loading = false } = foldersState

  const [states,     setStates]     = useState({})
  const [showCreate, setShowCreate] = useState(false)
  const [newName,    setNewName]    = useState('')
  const [newColor,   setNewColor]   = useState('#6366f1')
  const [creating,   setCreating]   = useState(false)
  const [createErr,  setCreateErr]  = useState('')

  useEffect(() => {
    dispatch(fetchFolders())
  }, [dispatch])

  const handleAdd = async (e, folder) => {
    e.stopPropagation()
    if (states[folder.id]?.status === 'done') return

    setStates((prev) => ({ ...prev, [folder.id]: { status: 'saving', msg: '' } }))

    const result = await dispatch(addFilesToFolder({ folderId: folder.id, fileIds }))

    if (addFilesToFolder.fulfilled.match(result)) {
      setStates((prev) => ({ ...prev, [folder.id]: { status: 'done', msg: '' } }))
      dispatch(fetchFolders())
    } else {
      setStates((prev) => ({
        ...prev,
        [folder.id]: {
          status: 'error',
          msg: result.payload || 'Failed to add files. Please try again.',
        },
      }))
    }
  }

  const handleCreate = async (e) => {
    e.stopPropagation()
    if (!newName.trim()) { setCreateErr('Name is required.'); return }
    setCreating(true)
    setCreateErr('')
    const result = await dispatch(createFolder({ name: newName.trim(), color: newColor }))
    setCreating(false)
    if (createFolder.fulfilled.match(result)) {
      setNewName('')
      setNewColor('#6366f1')
      setShowCreate(false)
      dispatch(fetchFolders())
    } else {
      setCreateErr(result.payload || 'Could not create folder.')
    }
  }

  const doneCount = Object.values(states).filter((s) => s?.status === 'done').length
  const stopProp  = (e) => e.stopPropagation()

  const handleDone = () => {
    if (doneCount > 0 && onAdded) onAdded()
    onClose()
  }

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
    >
      <div
        className="modal-panel w-full max-w-sm flex flex-col overflow-hidden max-h-[90vh]"
        onClick={stopProp}
      >
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <p className="text-sm font-bold text-gray-900">
              Add {fileIds.length} file{fileIds.length !== 1 ? 's' : ''} to folder
            </p>
            {doneCount > 0 && (
              <p className="text-[11px] text-emerald-600 font-semibold mt-0.5">
                ✓ Added to {doneCount} folder{doneCount !== 1 ? 's' : ''}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-all"
          >
            <i className="fas fa-xmark" />
          </button>
        </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {showCreate ? (
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 space-y-3 mb-2">
              <p className="text-xs font-bold text-gray-600">New Folder</p>
              <input
                autoFocus
                type="text"
                value={newName}
                onChange={(e) => { setNewName(e.target.value); setCreateErr('') }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(e) }}
                placeholder="Folder name…"
                className={`w-full px-3 py-2 bg-white rounded-xl border text-sm focus:ring-2 focus:ring-brand-200 focus:outline-none ${createErr ? 'border-red-300' : 'border-gray-200'}`}
              />
              {createErr && <p className="text-xs text-red-500">{createErr}</p>}

              <div className="flex flex-wrap gap-1.5">
                {FOLDER_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setNewColor(c) }}
                    className={`w-5 h-5 rounded-full transition-all ${newColor === c ? 'ring-2 ring-offset-1 ring-slate-400 scale-110' : ''}`}
                    style={{ background: c }}
                  />
                ))}
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setShowCreate(false); setNewName(''); setCreateErr('') }}
                  className="flex-1 py-1.5 text-xs text-gray-500 hover:text-gray-700 font-semibold bg-white border border-gray-200 rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={creating || !newName.trim()}
                  className="flex-1 py-1.5 bg-brand-600 text-white rounded-xl text-xs font-bold hover:bg-brand-700 transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {creating
                    ? <><i className="fas fa-spinner fa-spin text-[10px]" />Creating…</>
                    : 'Create'}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setShowCreate(true) }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-dashed border-gray-200 hover:border-brand-300 hover:bg-brand-50/40 text-gray-400 hover:text-brand-500 transition-all text-sm font-semibold mb-1"
            >
              <i className="fas fa-folder-plus text-sm" />
              Create new folder
            </button>
          )}

          {loading && !folders.length ? (
            <div className="flex items-center justify-center py-8 text-gray-400">
              <i className="fas fa-spinner fa-spin mr-2" />
              <span className="text-sm">Loading folders…</span>
            </div>
          ) : folders.length === 0 && !showCreate ? (
            <p className="text-sm text-gray-400 text-center py-6">
              No folders yet — create one above.
            </p>
          ) : (
            folders.map((f) => {
              const state = states[f.id] || { status: 'idle' }
              return (
                <div key={f.id} className="space-y-1">
                  <div className="flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-gray-50 transition-colors">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background: f.color + '20' }}
                      >
                        <i
                          className={`fas ${f.icon || 'fa-folder'} text-sm`}
                          style={{ color: f.color }}
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-700 truncate">{f.name}</p>
                        <p className="text-[10px] text-gray-400">
                          {fmt(f.file_count)} file{f.file_count !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => handleAdd(e, f)}
                      disabled={state.status === 'saving' || state.status === 'done'}
                      className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                        state.status === 'done'
                          ? 'bg-emerald-50 text-emerald-700 cursor-default'
                          : state.status === 'error'
                          ? 'bg-red-50 text-red-600 hover:bg-red-100'
                          : state.status === 'saving'
                          ? 'bg-gray-100 text-gray-400 cursor-wait'
                          : 'bg-brand-50 text-brand-700 hover:bg-brand-100'
                      }`}
                    >
                      {state.status === 'saving' && <><i className="fas fa-spinner fa-spin text-[10px]" />Adding…</>}
                      {state.status === 'done'   && <><i className="fas fa-check text-[10px]" />Added</>}
                      {state.status === 'error'  && <><i className="fas fa-rotate-right text-[10px]" />Retry</>}
                      {state.status === 'idle'   && <><i className="fas fa-folder-plus text-[10px]" />Add</>}
                    </button>
                  </div>

                  {state.status === 'error' && state.msg && (
                    <p className="text-[11px] text-red-500 font-medium px-4 pb-1 flex items-center gap-1">
                      <i className="fas fa-circle-exclamation text-[10px]" />
                      {state.msg}
                    </p>
                  )}
                </div>
              )
            })
          )}
        </div>

                <div className="px-4 py-3 border-t border-gray-100 flex-shrink-0">
          <button
            type="button"
            onClick={handleDone}
            className="w-full py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-bold hover:bg-gray-200 transition-all"
          >
            {doneCount > 0 ? 'Done' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  )
}