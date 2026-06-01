import { useEffect, useState, useRef, useCallback } from 'react'

import {
  getTrash,
  restoreFile,
  permanentlyDelete,
  emptyTrash,
  batchRestore,
} from '@/api/filesApi'
import { toast } from 'react-hot-toast'

const POLL_INTERVAL_MS = 30_000   // 30 s → catches the purge within one extra cycle

export default function Trash() {
  const [trashedFiles, setTrashedFiles]             = useState([])
  const [loading, setLoading]                       = useState(true)
  const [pagination, setPagination]                 = useState({})
  const [selectedCheckboxes, setSelectedCheckboxes] = useState(new Set())
  const [deleteConfirm, setDeleteConfirm]           = useState(null)
  const [showBatchDelete, setShowBatchDelete]        = useState(false)
  const [showEmptyTrash, setShowEmptyTrash]         = useState(false)
  const [restoreLoading, setRestoreLoading]         = useState({})
  const [actionLoading, setActionLoading]           = useState(null)
  const [currentPage, setCurrentPage]               = useState(1)

  const currentPageRef = useRef(1)

  const fetchTrash = useCallback(async function fetchTrashInner(page = 1, { silent = false } = {}) {
    try {
      if (!silent) setLoading(true)
      const response = await getTrash(page)
      const data     = response.data.data

      setTrashedFiles(data.results || [])
      setPagination({
        current_page: data.current_page,
        total_pages:  data.total_pages,
        count:        data.count,
      })
      setCurrentPage(page)
      currentPageRef.current = page

      if ((data.results || []).length === 0 && page > 1) {
        fetchTrashInner(page - 1, { silent })
      }
    } catch (err) {
      console.error('Fetch trash error:', err)
      if (!silent) toast.error('Failed to fetch trash. Please try again.')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTrash()
  }, [fetchTrash])

  useEffect(() => {
    const intervalId = setInterval(() => {
      if (actionLoading) return
      fetchTrash(currentPageRef.current, { silent: true })
    }, POLL_INTERVAL_MS)

    return () => clearInterval(intervalId)   // clean up on unmount
  }, [fetchTrash, actionLoading])

  const getDaysRemaining = (deletedAt) => {
    if (!deletedAt) return 30
    const diffDays = Math.ceil(Math.abs(new Date() - new Date(deletedAt)) / (1000 * 60 * 60 * 24))
    return Math.max(0, 30 - diffDays)
  }

  const handleRestoreFile = async (fileId) => {
    try {
      setRestoreLoading((prev) => ({ ...prev, [fileId]: true }))
      await restoreFile(fileId)
      await fetchTrash(currentPageRef.current)
    } catch {
      toast.error('Failed to restore file. Please try again.')
    } finally {
      setRestoreLoading((prev) => ({ ...prev, [fileId]: false }))
    }
  }

  const handlePermanentlyDelete = async (fileId) => {
    try {
      setActionLoading('delete')
      await permanentlyDelete(fileId)
      setDeleteConfirm(null)
      toast.success('File permanently deleted', { id: 'delete-success' })
      await fetchTrash(currentPageRef.current)
    } catch {
      toast.error('Failed to permanently delete file. Please try again.')
    } finally {
      setActionLoading(null)
    }
  }

  const handleBatchRestore = async () => {
    try {
      setActionLoading('restore')
      const fileIds = Array.from(selectedCheckboxes)
      await batchRestore(fileIds)
      setSelectedCheckboxes(new Set())
      await fetchTrash(currentPageRef.current)
    } catch {
      toast.error('Batch restore failed. Please try again.')
    } finally {
      setActionLoading(null)
    }
  }

  const handleBatchDelete = async () => {
    try {
      setActionLoading('batch-delete')
      const fileIds = Array.from(selectedCheckboxes)
      for (const fileId of fileIds) {
        await permanentlyDelete(fileId)
      }
      setSelectedCheckboxes(new Set())
      setShowBatchDelete(false)
      toast.success(`${fileIds.length} files permanently deleted`, { id: 'batch-delete-success' })
      await fetchTrash(currentPageRef.current)
    } catch {
      toast.error('Batch delete failed. Please try again.')
    } finally {
      setActionLoading(null)
    }
  }

  const handleEmptyTrash = async () => {
    try {
      setActionLoading('empty')
      await emptyTrash()
      setShowEmptyTrash(false)
      toast.success('Trash emptied permanently', { id: 'empty-trash-success' })
      await fetchTrash(1)
    } catch {
      toast.error('Failed to empty trash. Please try again.')
    } finally {
      setActionLoading(null)
    }
  }

  const handleSelectAll = (checked) => {
    setSelectedCheckboxes(
      checked ? new Set(trashedFiles.map((f) => f.id)) : new Set()
    )
  }

  const handleCheckboxChange = (fileId) => {
    const next = new Set(selectedCheckboxes)
    next.has(fileId) ? next.delete(fileId) : next.add(fileId)
    setSelectedCheckboxes(next)
  }

  const getFileIcon = (mime) => {
    if (!mime)                                                   return 'fa-file text-gray-400'
    if (mime.includes('pdf'))                                    return 'fa-file-pdf text-red-400'
    if (mime.includes('image'))                                  return 'fa-image text-blue-400'
    if (mime.includes('video'))                                  return 'fa-video text-purple-400'
    if (mime.includes('word') || mime.includes('document'))      return 'fa-file-word text-blue-500'
    if (mime.includes('spreadsheet') || mime.includes('sheet'))  return 'fa-file-excel text-green-500'
    if (mime.includes('zip') || mime.includes('archive'))        return 'fa-file-zipper text-orange-400'
    if (mime.includes('audio'))                                  return 'fa-file-audio text-pink-400'
    if (mime.includes('text'))                                   return 'fa-file-lines text-gray-400'
    return 'fa-file text-gray-400'
  }

  return (
    <div className="w-full">
      <div className="max-w-6xl mx-auto">

                <header className="mb-8">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 flex items-center gap-3">
                <span className="w-10 h-10 bg-red-50 rounded-lg flex items-center justify-center">
                  <i className="fas fa-trash text-red-400"></i>
                </span>
                Trash
              </h2>
              <p className="text-gray-500 mt-2 text-sm ml-[52px]">
                {pagination.count || 0} file{pagination.count !== 1 ? 's' : ''} • Permanently deleted after 30 days
              </p>
            </div>
            {trashedFiles.length > 0 && (
              <button
                onClick={() => setShowEmptyTrash(true)}
                className="px-5 py-3 bg-red-500 text-white rounded-lg font-bold text-sm hover:bg-red-600 transition-all flex items-center gap-2 w-full sm:w-auto justify-center"
              >
                <i className="fas fa-trash-alt"></i> Empty Trash
              </button>
            )}
          </div>
        </header>

                {selectedCheckboxes.size > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <span className="text-sm font-bold text-blue-700">
              {selectedCheckboxes.size} file{selectedCheckboxes.size !== 1 ? 's' : ''} selected
            </span>
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              <button
                onClick={handleBatchRestore}
                disabled={!!actionLoading}
                className="px-4 py-2 bg-green-500 text-white rounded-xl font-bold text-sm hover:bg-green-600 transition-all flex items-center justify-center gap-2 disabled:opacity-50 flex-1 sm:flex-none"
              >
                <i className={`fas ${actionLoading === 'restore' ? 'fa-spinner fa-spin' : 'fa-rotate-left'}`}></i>
                Restore Selected
              </button>
              <button
                onClick={() => setShowBatchDelete(true)}
                disabled={!!actionLoading}
                className="px-4 py-2 bg-red-500 text-white rounded-xl font-bold text-sm hover:bg-red-600 transition-all flex items-center justify-center gap-2 disabled:opacity-50 flex-1 sm:flex-none"
              >
                <i className="fas fa-trash-can"></i>
                Delete Permanently
              </button>
            </div>
          </div>
        )}

                {loading ? (
          <div className="text-center py-20">
            <i className="fas fa-spinner fa-spin text-4xl text-gray-300 mb-4"></i>
            <p className="text-gray-500">Loading trash…</p>
          </div>
        ) : trashedFiles.length === 0 ? (
          <div className="text-center py-24 card rounded-lg shadow-sm">
            <div className="w-20 h-20 bg-gray-50 rounded-lg flex items-center justify-center mx-auto mb-4">
              <i className="fas fa-trash-alt text-4xl text-gray-300"></i>
            </div>
            <p className="text-gray-700 font-bold text-lg">Trash is empty</p>
            <p className="text-gray-400 text-sm mt-2">Deleted files will appear here for 30 days</p>
          </div>
        ) : (
          <div className="card rounded-lg shadow-sm overflow-hidden">

                        <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-left border-separate border-spacing-y-1 p-4">
                <thead>
                  <tr className="text-[10px] uppercase tracking-widest text-gray-400">
                    <th className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedCheckboxes.size === trashedFiles.length && trashedFiles.length > 0}
                        onChange={(e) => handleSelectAll(e.target.checked)}
                        className="w-4 h-4 rounded accent-brand-600"
                      />
                    </th>
                    <th className="px-4 py-3 font-bold">File Name</th>
                    <th className="px-4 py-3 font-bold">Size</th>
                    <th className="px-4 py-3 font-bold">Deleted</th>
                    <th className="px-4 py-3 font-bold">Expires In</th>
                    <th className="px-4 py-3 font-bold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {trashedFiles.map((file) => {
                    const daysLeft    = getDaysRemaining(file.deleted_at)
                    const urgentColor = daysLeft <= 3 ? 'text-red-600' : daysLeft <= 7 ? 'text-orange-500' : 'text-amber-600'
                    const barColor    = daysLeft <= 3 ? 'bg-red-500'   : daysLeft <= 7 ? 'bg-orange-500'   : 'bg-amber-400'
                    return (
                      <tr
                        key={file.id}
                        className={`transition-colors hover:bg-red-50/30 ${selectedCheckboxes.has(file.id) ? 'bg-blue-50' : ''}`}
                      >
                        <td className="px-4 py-3 rounded-l-2xl">
                          <input
                            type="checkbox"
                            checked={selectedCheckboxes.has(file.id)}
                            onChange={() => handleCheckboxChange(file.id)}
                            className="w-4 h-4 rounded accent-brand-600"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center flex-shrink-0 opacity-60">
                              <i className={`fas ${getFileIcon(file.mime_type)} text-base`}></i>
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-gray-500 truncate max-w-[180px]">{file.original_name}</p>
                              <p className="text-xs text-gray-400">{file.file_size_display}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-gray-500">{file.file_size_display}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-gray-500">
                            {file.deleted_at ? new Date(file.deleted_at).toLocaleDateString() : '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {daysLeft > 0 ? (
                            <div className="flex items-center gap-2">
                              <span className={`text-sm font-bold ${urgentColor}`}>{daysLeft}d</span>
                              <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div className={`h-full ${barColor} transition-all`} style={{ width: `${(daysLeft / 30) * 100}%` }} />
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-1 rounded-lg">Expiring</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right rounded-r-2xl">
                          <div className="flex justify-end gap-1">
                            <button
                              onClick={() => handleRestoreFile(file.id)}
                              disabled={!!restoreLoading[file.id]}
                              className="p-2 text-green-500 hover:text-green-700 hover:bg-green-50 rounded-lg transition-colors disabled:opacity-50"
                              title="Restore"
                            >
                              <i className={`fas ${restoreLoading[file.id] ? 'fa-spinner fa-spin' : 'fa-rotate-left'} text-sm`}></i>
                            </button>
                            <button
                              onClick={() => setDeleteConfirm(file.id)}
                              className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Delete permanently"
                            >
                              <i className="fas fa-trash-can text-sm"></i>
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

                        <div className="sm:hidden p-4 space-y-3">
              {trashedFiles.map((file) => {
                const daysLeft    = getDaysRemaining(file.deleted_at)
                const urgentColor = daysLeft <= 3 ? 'text-red-600' : daysLeft <= 7 ? 'text-orange-500' : 'text-amber-600'
                const barColor    = daysLeft <= 3 ? 'bg-red-500'   : daysLeft <= 7 ? 'bg-orange-500'   : 'bg-amber-400'
                return (
                  <div
                    key={file.id}
                    className={`p-4 rounded-lg border transition-colors ${selectedCheckboxes.has(file.id) ? 'bg-blue-50 border-blue-200' : 'border-gray-200'}`}
                  >
                    <div className="flex items-start gap-3 mb-3">
                      <input type="checkbox" checked={selectedCheckboxes.has(file.id)} onChange={() => handleCheckboxChange(file.id)} className="w-4 h-4 rounded accent-brand-600 mt-1" />
                      <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center flex-shrink-0 opacity-60">
                        <i className={`fas ${getFileIcon(file.mime_type)}`}></i>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-gray-500 truncate">{file.original_name}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {file.file_size_display}{file.deleted_at && ` • Deleted ${new Date(file.deleted_at).toLocaleDateString()}`}
                        </p>
                      </div>
                    </div>
                    <div className="ml-7 mb-3">
                      {daysLeft > 0 ? (
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-gray-500">Auto-deletes in</span>
                            <span className={`text-xs font-bold ${urgentColor}`}>{daysLeft} day{daysLeft !== 1 ? 's' : ''}</span>
                          </div>
                          <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className={`h-full ${barColor}`} style={{ width: `${(daysLeft / 30) * 100}%` }} />
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs font-bold text-red-600">⚠️ Expiring soon</span>
                      )}
                    </div>
                    <div className="ml-7 flex gap-2">
                      <button onClick={() => handleRestoreFile(file.id)} disabled={!!restoreLoading[file.id]} className="flex-1 px-3 py-2 bg-green-50 text-green-700 rounded-xl font-bold text-xs hover:bg-green-100 transition-colors disabled:opacity-50 flex items-center justify-center gap-1">
                        <i className={`fas ${restoreLoading[file.id] ? 'fa-spinner fa-spin' : 'fa-rotate-left'}`}></i> Restore
                      </button>
                      <button onClick={() => setDeleteConfirm(file.id)} className="flex-1 px-3 py-2 bg-red-50 text-red-700 rounded-xl font-bold text-xs hover:bg-red-100 transition-colors flex items-center justify-center gap-1">
                        <i className="fas fa-trash-can"></i> Delete
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

                {pagination.total_pages > 1 && (
          <div className="mt-8 flex justify-center items-center gap-3 flex-wrap">
            <button disabled={currentPage === 1} onClick={() => fetchTrash(currentPage - 1)} className="w-10 h-10 flex items-center justify-center rounded-xl bg-white border border-gray-200 text-gray-600 disabled:opacity-30 hover:border-brand-300 transition-all">
              <i className="fas fa-chevron-left text-xs"></i>
            </button>
            <span className="text-sm font-bold text-gray-600">Page {currentPage} of {pagination.total_pages}</span>
            <button disabled={currentPage === pagination.total_pages} onClick={() => fetchTrash(currentPage + 1)} className="w-10 h-10 flex items-center justify-center rounded-xl bg-white border border-gray-200 text-gray-600 disabled:opacity-30 hover:border-brand-300 transition-all">
              <i className="fas fa-chevron-right text-xs"></i>
            </button>
          </div>
        )}
      </div>

      {deleteConfirm && (
        <div className="modal-overlay">
          <div className="bg-white rounded-lg p-6 sm:p-8 max-w-sm w-full">
            <div className="w-16 h-16 bg-red-50 text-red-600 rounded-lg flex items-center justify-center text-2xl mx-auto mb-6">
              <i className="fas fa-exclamation-triangle"></i>
            </div>
            <h3 className="text-lg font-bold text-center text-gray-900 mb-2">Delete Permanently?</h3>
            <p className="text-sm text-center text-gray-600 mb-8">This cannot be undone. The file will be gone forever.</p>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="py-3 font-bold text-gray-600 hover:text-gray-900">Cancel</button>
              <button
                onClick={() => handlePermanentlyDelete(deleteConfirm)}
                disabled={actionLoading === 'delete'}
                className="py-3 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {actionLoading === 'delete' && <i className="fas fa-spinner fa-spin"></i>}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {showBatchDelete && (
        <div className="modal-overlay">
          <div className="bg-white rounded-lg p-6 sm:p-8 max-w-sm w-full">
            <div className="w-16 h-16 bg-red-50 text-red-600 rounded-lg flex items-center justify-center text-2xl mx-auto mb-6">
              <i className="fas fa-trash-can"></i>
            </div>
            <h3 className="text-lg font-bold text-center text-gray-900 mb-2">Delete {selectedCheckboxes.size} File{selectedCheckboxes.size !== 1 ? 's' : ''}?</h3>
            <p className="text-sm text-center text-gray-600 mb-8">These files will be permanently deleted and cannot be recovered.</p>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setShowBatchDelete(false)} className="py-3 font-bold text-gray-600 hover:text-gray-900">Cancel</button>
              <button
                onClick={handleBatchDelete}
                disabled={actionLoading === 'batch-delete'}
                className="py-3 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {actionLoading === 'batch-delete' && <i className="fas fa-spinner fa-spin"></i>}
                Delete All
              </button>
            </div>
          </div>
        </div>
      )}

      {showEmptyTrash && (
        <div className="modal-overlay">
          <div className="bg-white rounded-lg p-6 sm:p-8 max-w-sm w-full">
            <div className="w-16 h-16 bg-red-50 text-red-600 rounded-lg flex items-center justify-center text-2xl mx-auto mb-6">
              <i className="fas fa-trash-alt"></i>
            </div>
            <h3 className="text-lg font-bold text-center text-gray-900 mb-2">Empty Trash?</h3>
            <p className="text-sm text-center text-gray-600 mb-8">
              All {pagination.count} file{pagination.count !== 1 ? 's' : ''} will be permanently deleted. This cannot be undone.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setShowEmptyTrash(false)} className="py-3 font-bold text-gray-600 hover:text-gray-900">Cancel</button>
              <button
                onClick={handleEmptyTrash}
                disabled={actionLoading === 'empty'}
                className="py-3 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {actionLoading === 'empty' && <i className="fas fa-spinner fa-spin"></i>}
                Empty Trash
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
