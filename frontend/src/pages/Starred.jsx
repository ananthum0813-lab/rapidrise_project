import { useEffect, useState } from 'react'

import {
  getFavorites,
  toggleFavorite,
  deleteFile,
  downloadFile,
} from '@/api/filesApi'
import { toast } from 'react-hot-toast'

export default function Starred() {
  const [starredFiles, setStarredFiles]             = useState([])
  const [loading, setLoading]                       = useState(true)
  const [pagination, setPagination]                 = useState({})
  const [selectedCheckboxes, setSelectedCheckboxes] = useState(new Set())
  const [deleteConfirm, setDeleteConfirm]           = useState(null)
  const [previewFile, setPreviewFile]               = useState(null)
  const [previewBlobUrl, setPreviewBlobUrl]         = useState(null)
  const [previewLoading, setPreviewLoading]         = useState(false)
  const [starLoading, setStarLoading]               = useState({})
  const [actionLoading, setActionLoading]           = useState(null)
  const [currentPage, setCurrentPage]               = useState(1)

  const fetchStarred = async (page = 1) => {
    try {
      setLoading(true)
      const response = await getFavorites(page)
      setStarredFiles(response.data.data.results || [])
      setPagination({
        current_page: response.data.data.current_page,
        total_pages:  response.data.data.total_pages,
        count:        response.data.data.count,
      })
      setCurrentPage(page)
    } catch (err) {
      console.error('Fetch starred error:', err)
      toast.error('Failed to fetch starred files. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchStarred() }, [])

  useEffect(() => {
    if (previewBlobUrl) {
      URL.revokeObjectURL(previewBlobUrl)
      setPreviewBlobUrl(null)
    }

    if (!previewFile) return

    const isMedia =
      previewFile.mime_type?.includes('image') ||
      previewFile.mime_type?.includes('video') ||
      previewFile.mime_type?.includes('audio') ||
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
  }, [previewFile]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => { if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl) }
  }, [previewBlobUrl])

  const handleDownload = async (file) => {
    const toastId = toast.loading(`Downloading ${file.original_name}...`)
    try {
      const { data } = await downloadFile(file.id)
      const blob = new Blob([data], {
        type: file.mime_type || data.type || 'application/octet-stream',
      })
      const url = window.URL.createObjectURL(blob)
      const a   = document.createElement('a')
      a.href     = url
      a.download = file.original_name
      a.click()
      window.URL.revokeObjectURL(url)
      toast.success('Download successful!', { id: toastId })
    } catch {
      toast.error('Download failed.', { id: toastId })
    }
  }

  const handleOpenPreview = () => {
    if (!previewBlobUrl) return
    window.open(previewBlobUrl, '_blank')
  }

  const handleUnstar = async (fileId) => {
    try {
      setStarLoading((prev) => ({ ...prev, [fileId]: true }))
      await toggleFavorite(fileId)
      toast.success('File removed from favourites', { id: 'unstar-success' })
      await fetchStarred(currentPage)
    } catch {
      toast.error('Failed to unstar file. Please try again.')
    } finally {
      setStarLoading((prev) => ({ ...prev, [fileId]: false }))
    }
  }

  const handleDelete = async (fileId) => {
    try {
      setActionLoading('delete')
      await deleteFile(fileId)
      setDeleteConfirm(null)
      toast.success('File moved to trash', { id: 'trash-success' })
      await fetchStarred(currentPage)
    } catch {
      toast.error('Failed to delete file. Please try again.')
    } finally {
      setActionLoading(null)
    }
  }

  const handleBatchUnstar = async () => {
    try {
      setActionLoading('unstar')
      const fileIds = Array.from(selectedCheckboxes)
      for (const fileId of fileIds) {
        await toggleFavorite(fileId)
      }
      toast.success(`${fileIds.length} files removed from favourites`, { id: 'batch-unstar-success' })
      setSelectedCheckboxes(new Set())
      await fetchStarred(currentPage)
    } catch {
      toast.error('Batch unstar failed. Please try again.')
    } finally {
      setActionLoading(null)
    }
  }

  const handleSelectAll = (checked) => {
    setSelectedCheckboxes(
      checked ? new Set(starredFiles.map((f) => f.id)) : new Set()
    )
  }

  const handleCheckboxChange = (fileId) => {
    const next = new Set(selectedCheckboxes)
    next.has(fileId) ? next.delete(fileId) : next.add(fileId)
    setSelectedCheckboxes(next)
  }

  const getFileIcon = (mime) => {
    if (!mime)                                                   return 'fa-file text-gray-400'
    if (mime.includes('pdf'))                                    return 'fa-file-pdf text-red-500'
    if (mime.includes('image'))                                  return 'fa-image text-blue-500'
    if (mime.includes('video'))                                  return 'fa-video text-purple-500'
    if (mime.includes('word') || mime.includes('document'))      return 'fa-file-word text-blue-600'
    if (mime.includes('spreadsheet') || mime.includes('sheet'))  return 'fa-file-excel text-green-600'
    if (mime.includes('zip') || mime.includes('archive'))        return 'fa-file-zipper text-orange-500'
    if (mime.includes('audio'))                                  return 'fa-file-audio text-pink-500'
    if (mime.includes('text'))                                   return 'fa-file-lines text-gray-500'
    return 'fa-file text-gray-500'
  }

  const getFileBg = (mime) => {
    if (!mime)                                                   return 'bg-gray-50'
    if (mime.includes('pdf'))                                    return 'bg-red-50'
    if (mime.includes('image'))                                  return 'bg-blue-50'
    if (mime.includes('video'))                                  return 'bg-purple-50'
    if (mime.includes('word') || mime.includes('document'))      return 'bg-blue-50'
    if (mime.includes('spreadsheet') || mime.includes('sheet'))  return 'bg-green-50'
    if (mime.includes('zip') || mime.includes('archive'))        return 'bg-orange-50'
    if (mime.includes('audio'))                                  return 'bg-pink-50'
    return 'bg-gray-100'
  }

  const renderPreview = (file) => {
    if (!file) return null
    const { mime_type } = file

    if (mime_type?.includes('image')) {
      return (
        <div className="mb-6 rounded-lg overflow-hidden bg-gray-50 border border-gray-100 flex items-center justify-center min-h-[120px]">
          {previewLoading ? (
            <div className="py-12 flex flex-col items-center gap-3 text-gray-400">
              <i className="fas fa-circle-notch fa-spin text-2xl text-brand-500"></i>
              <p className="text-xs">Loading preview…</p>
            </div>
          ) : previewBlobUrl ? (
            <img src={previewBlobUrl} alt={file.original_name} className="w-full max-h-72 object-contain" />
          ) : (
            <div className="py-12 flex flex-col items-center gap-2 text-gray-400">
              <i className="fas fa-image text-4xl text-blue-300"></i>
              <p className="text-sm">Image preview unavailable</p>
            </div>
          )}
        </div>
      )
    }
    if (mime_type?.includes('video')) {
      return (
        <div className="mb-6 rounded-lg overflow-hidden bg-black">
          {previewLoading ? (
            <div className="py-12 flex flex-col items-center gap-3">
              <i className="fas fa-circle-notch fa-spin text-2xl text-white"></i>
              <p className="text-xs text-gray-300">Loading video…</p>
            </div>
          ) : previewBlobUrl ? (
            <video controls className="w-full max-h-64" src={previewBlobUrl}>
              Your browser does not support video preview.
            </video>
          ) : (
            <div className="py-12 flex flex-col items-center gap-2 text-gray-400">
              <i className="fas fa-video text-4xl text-purple-300"></i>
              <p className="text-sm">Preview unavailable</p>
            </div>
          )}
        </div>
      )
    }
    if (mime_type?.includes('audio')) {
      return (
        <div className="mb-6 p-4 bg-brand-50 rounded-lg">
          {previewLoading ? (
            <div className="flex items-center justify-center gap-3 text-brand-500 py-2">
              <i className="fas fa-circle-notch fa-spin"></i>
              <span className="text-sm">Loading audio…</span>
            </div>
          ) : previewBlobUrl ? (
            <audio controls className="w-full" src={previewBlobUrl} />
          ) : (
            <p className="text-sm text-center text-gray-500">Audio preview unavailable</p>
          )}
        </div>
      )
    }
    if (mime_type?.includes('pdf')) {
      return (
        <div className="mb-6 rounded-lg overflow-hidden bg-gray-50 border border-gray-100 min-h-[500px] relative" style={{ overflow: 'hidden' }}>
          {previewLoading ? (
            <div className="py-12 flex flex-col items-center gap-3 text-gray-400">
              <i className="fas fa-circle-notch fa-spin text-2xl text-brand-500"></i>
              <p className="text-xs">Loading PDF…</p>
            </div>
          ) : previewBlobUrl ? (
            <div style={{ height: '500px', position: 'relative', overflow: 'hidden' }}>
              <iframe
                src={`${previewBlobUrl}#toolbar=0&navpanes=0&scrollbar=0&view=FitH&page=1`}
                title={file.original_name}
                style={{
                  height: '580px',
                  border: 'none',
                  display: 'block',
                  position: 'absolute',
                  top: '-46px',
                  left: 0,
                  width: '100%',
                }}
              />
            </div>
          ) : (
            <div className="py-12 flex flex-col items-center gap-2 text-gray-400">
              <i className="fas fa-file-pdf text-4xl text-red-300"></i>
              <p className="text-sm">PDF preview unavailable</p>
            </div>
          )}
        </div>
      )
    }
    return (
      <div className={`mb-6 ${getFileBg(mime_type)} rounded-lg p-10 text-center border border-gray-100`}>
        <i className={`fas ${getFileIcon(mime_type)} text-6xl mb-3`}></i>
        <p className="text-sm text-gray-600 capitalize mt-2">{mime_type?.split('/')[0] || 'File'} File</p>
        <p className="text-xs text-gray-500 mt-1">Download to view this file</p>
      </div>
    )
  }

  return (
    <div className="w-full">
      <div className="max-w-6xl mx-auto">

                <header className="mb-6 sm:mb-8">
          <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 flex items-center gap-3">
            <span className="w-9 h-9 sm:w-10 sm:h-10 bg-yellow-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <i className="fas fa-star text-yellow-500 text-sm sm:text-base"></i>
            </span>
            Starred Files
          </h2>
          <p className="text-gray-500 mt-2 text-sm ml-12 sm:ml-[52px]">
            {pagination.count || 0} favourite file{pagination.count !== 1 ? 's' : ''}
          </p>
        </header>

                {selectedCheckboxes.size > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 sm:p-4 mb-4 sm:mb-6 flex flex-col xs:flex-row items-start xs:items-center justify-between gap-3">
            <span className="text-sm font-bold text-yellow-700">
              {selectedCheckboxes.size} file{selectedCheckboxes.size !== 1 ? 's' : ''} selected
            </span>
            <button
              onClick={handleBatchUnstar}
              disabled={!!actionLoading}
              className="px-4 py-2 bg-yellow-500 text-white rounded-xl font-bold text-sm hover:bg-yellow-600 transition-all flex items-center gap-2 disabled:opacity-50 w-full xs:w-auto justify-center"
            >
              <i className={`fas ${actionLoading === 'unstar' ? 'fa-spinner fa-spin' : 'fa-star-half-stroke'}`}></i>
              Remove from Favourites
            </button>
          </div>
        )}

                {loading ? (
          <div className="text-center py-20">
            <i className="fas fa-spinner fa-spin text-4xl text-gray-300 mb-4"></i>
            <p className="text-gray-500">Loading starred files…</p>
          </div>
        ) : starredFiles.length === 0 ? (
          <div className="text-center py-16 sm:py-24 card rounded-lg shadow-sm px-4">
            <div className="w-16 h-16 sm:w-20 sm:h-20 bg-yellow-50 rounded-lg flex items-center justify-center mx-auto mb-4">
              <i className="fas fa-star text-3xl sm:text-4xl text-yellow-300"></i>
            </div>
            <p className="text-gray-700 font-bold text-base sm:text-lg">No starred files yet</p>
            <p className="text-gray-400 text-sm mt-2">Click the ⭐ on any file in My Storage to star it</p>
          </div>
        ) : (
          <div className="card rounded-lg shadow-sm overflow-hidden">

                        <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-separate border-spacing-y-1 p-4">
                <thead>
                  <tr className="text-[10px] uppercase tracking-widest text-gray-400">
                    <th className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedCheckboxes.size === starredFiles.length && starredFiles.length > 0}
                        onChange={(e) => handleSelectAll(e.target.checked)}
                        className="w-4 h-4 rounded accent-brand-600"
                      />
                    </th>
                    <th className="px-4 py-3 font-bold">File Name</th>
                    <th className="px-4 py-3 font-bold">Type</th>
                    <th className="px-4 py-3 font-bold">Size</th>
                    <th className="px-4 py-3 font-bold">Uploaded</th>
                    <th className="px-4 py-3 font-bold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {starredFiles.map((file) => (
                    <tr
                      key={file.id}
                      className={`transition-colors hover:bg-yellow-50/40 ${selectedCheckboxes.has(file.id) ? 'bg-yellow-50' : ''}`}
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
                          <div className={`w-10 h-10 ${getFileBg(file.mime_type)} rounded-xl flex items-center justify-center flex-shrink-0`}>
                            <i className={`fas ${getFileIcon(file.mime_type)} text-base`}></i>
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-gray-800 truncate max-w-[200px]">{file.original_name}</p>
                            <div className="flex items-center gap-1 mt-0.5">
                              <i className="fas fa-star text-yellow-400 text-[10px]"></i>
                              <span className="text-[10px] text-yellow-600 font-semibold">Starred</span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-lg font-medium">
                          {file.mime_type?.split('/')[1]?.toUpperCase() || 'FILE'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-600">{file.file_size_display}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-600">{new Date(file.uploaded_at).toLocaleDateString()}</span>
                      </td>
                      <td className="px-4 py-3 text-right rounded-r-2xl">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => setPreviewFile(file)}
                            className="p-2 text-blue-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Preview"
                          >
                            <i className="fas fa-eye text-sm"></i>
                          </button>
                          <button
                            onClick={() => handleDownload(file)}
                            className="p-2 text-green-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                            title="Download"
                          >
                            <i className="fas fa-download text-sm"></i>
                          </button>
                          <button
                            onClick={() => handleUnstar(file.id)}
                            disabled={!!starLoading[file.id]}
                            className="p-2 text-yellow-400 hover:text-yellow-600 hover:bg-yellow-50 rounded-lg transition-colors disabled:opacity-50"
                            title="Remove from favourites"
                          >
                            <i className={`fas ${starLoading[file.id] ? 'fa-spinner fa-spin' : 'fa-star'} text-sm`}></i>
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(file.id)}
                            className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Move to trash"
                          >
                            <i className="fas fa-trash-can text-sm"></i>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

                        <div className="md:hidden">
              <div className="flex items-center justify-between px-4 pt-4 pb-2 border-b border-gray-50">
                <label className="flex items-center gap-2 text-xs font-bold text-gray-500 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={selectedCheckboxes.size === starredFiles.length && starredFiles.length > 0}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    className="w-4 h-4 rounded accent-brand-600"
                  />
                  Select All
                </label>
                <span className="text-xs text-gray-400">{starredFiles.length} file{starredFiles.length !== 1 ? 's' : ''}</span>
              </div>

              <div className="p-3 space-y-3">
                {starredFiles.map((file) => (
                  <div
                    key={file.id}
                    className={`rounded-lg border transition-colors overflow-hidden ${
                      selectedCheckboxes.has(file.id) ? 'bg-yellow-50 border-yellow-300' : 'bg-white border-gray-100 shadow-sm'
                    }`}
                  >
                    <div className="flex items-start gap-3 p-4">
                      <input
                        type="checkbox"
                        checked={selectedCheckboxes.has(file.id)}
                        onChange={() => handleCheckboxChange(file.id)}
                        className="w-4 h-4 rounded accent-brand-600 mt-1 flex-shrink-0"
                      />
                      <div className={`w-11 h-11 ${getFileBg(file.mime_type)} rounded-xl flex items-center justify-center flex-shrink-0`}>
                        <i className={`fas ${getFileIcon(file.mime_type)} text-lg`}></i>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-gray-800 truncate leading-tight">{file.original_name}</p>
                        <div className="flex items-center gap-1 mt-0.5 mb-1">
                          <i className="fas fa-star text-yellow-400 text-[10px]"></i>
                          <span className="text-[10px] text-yellow-600 font-semibold">Starred</span>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[11px] text-gray-500 font-medium">{file.file_size_display}</span>
                          <span className="text-gray-300 text-[10px]">•</span>
                          <span className="text-[11px] text-gray-500">{new Date(file.uploaded_at).toLocaleDateString()}</span>
                          <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-md font-medium">
                            {file.mime_type?.split('/')[1]?.toUpperCase() || 'FILE'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-4 border-t border-gray-100">
                      <button onClick={() => setPreviewFile(file)}
                        className="flex flex-col items-center justify-center gap-1 py-3 text-blue-500 hover:bg-blue-50 transition-colors">
                        <i className="fas fa-eye text-sm"></i>
                        <span className="text-[10px] font-semibold">Preview</span>
                      </button>
                      <button onClick={() => handleDownload(file)}
                        className="flex flex-col items-center justify-center gap-1 py-3 text-green-500 hover:bg-green-50 transition-colors border-l border-gray-100">
                        <i className="fas fa-download text-sm"></i>
                        <span className="text-[10px] font-semibold">Download</span>
                      </button>
                      <button onClick={() => handleUnstar(file.id)} disabled={!!starLoading[file.id]}
                        className="flex flex-col items-center justify-center gap-1 py-3 text-yellow-500 hover:bg-yellow-50 transition-colors disabled:opacity-50 border-l border-gray-100">
                        <i className={`fas ${starLoading[file.id] ? 'fa-spinner fa-spin' : 'fa-star'} text-sm`}></i>
                        <span className="text-[10px] font-semibold">Unstar</span>
                      </button>
                      <button onClick={() => setDeleteConfirm(file.id)}
                        className="flex flex-col items-center justify-center gap-1 py-3 text-red-500 hover:bg-red-50 transition-colors border-l border-gray-100">
                        <i className="fas fa-trash-can text-sm"></i>
                        <span className="text-[10px] font-semibold">Delete</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

                {pagination.total_pages > 1 && (
          <div className="mt-6 sm:mt-8 flex justify-center items-center gap-3 flex-wrap">
            <button disabled={currentPage === 1} onClick={() => fetchStarred(currentPage - 1)}
              className="w-10 h-10 flex items-center justify-center rounded-xl bg-white border border-gray-200 text-gray-600 disabled:opacity-30 hover:border-brand-300 transition-all">
              <i className="fas fa-chevron-left text-xs"></i>
            </button>
            <span className="text-sm font-bold text-gray-600">Page {currentPage} of {pagination.total_pages}</span>
            <button disabled={currentPage === pagination.total_pages} onClick={() => fetchStarred(currentPage + 1)}
              className="w-10 h-10 flex items-center justify-center rounded-xl bg-white border border-gray-200 text-gray-600 disabled:opacity-30 hover:border-brand-300 transition-all">
              <i className="fas fa-chevron-right text-xs"></i>
            </button>
          </div>
        )}
      </div>

            {deleteConfirm && (
        <div className="modal-overlay items-end sm:items-center">
          <div className="bg-white rounded-t-lg sm:rounded-lg p-6 sm:p-8 max-w-sm w-full">
            <div className="w-14 h-14 sm:w-16 sm:h-16 bg-red-50 text-red-600 rounded-lg flex items-center justify-center text-xl sm:text-2xl mx-auto mb-5 sm:mb-6">
              <i className="fas fa-trash-can"></i>
            </div>
            <h3 className="text-base sm:text-lg font-bold text-center text-gray-900 mb-2">Delete File?</h3>
            <p className="text-sm text-center text-gray-600 mb-6 sm:mb-8">
              The file will be moved to trash and removed from favourites.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="py-3 font-bold text-gray-600 hover:text-gray-900 text-sm">
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                disabled={actionLoading === 'delete'}
                className="py-3 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
              >
                {actionLoading === 'delete' && <i className="fas fa-spinner fa-spin"></i>}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

            {previewFile && (
        <div className="modal-overlay items-end sm:items-center p-0 sm:p-4">
          <div className="bg-white rounded-t-lg sm:rounded-lg p-5 sm:p-6 lg:p-8 max-w-lg w-full max-h-[92vh] sm:max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-5 sm:mb-6">
              <h3 className="text-base sm:text-lg font-bold text-gray-900">File Preview</h3>
              <button onClick={() => setPreviewFile(null)} className="text-gray-400 hover:text-gray-600 text-xl sm:text-2xl p-1 -mt-1 -mr-1">
                <i className="fas fa-times"></i>
              </button>
            </div>

            {renderPreview(previewFile)}

            <div className="space-y-3 sm:space-y-4 mb-5 sm:mb-6">
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Filename</p>
                <p className="text-sm font-bold text-gray-800 break-all">{previewFile.original_name}</p>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Size</p>
                  <p className="text-sm font-bold text-gray-800">{previewFile.file_size_display}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Type</p>
                  <p className="text-sm font-bold text-gray-800 break-all">{previewFile.mime_type || 'Unknown'}</p>
                </div>
              </div>
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Uploaded</p>
                <p className="text-sm font-bold text-gray-800">{new Date(previewFile.uploaded_at).toLocaleString()}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => { handleDownload(previewFile); setPreviewFile(null) }}
                className="py-3 bg-brand-600 text-white rounded-lg font-bold hover:bg-brand-700 transition-all flex items-center justify-center gap-2 text-sm">
                <i className="fas fa-download"></i> Download
              </button>
              {previewFile.mime_type?.includes('pdf') ? (
                <button onClick={handleOpenPreview}
                  disabled={!previewBlobUrl}
                  className="py-3 bg-gray-100 text-gray-700 rounded-lg font-bold hover:bg-gray-200 transition-all flex items-center justify-center gap-2 text-sm">
                  <i className="fas fa-arrow-up-right-from-square"></i> Open
                </button>
              ) : (
                <button onClick={() => setPreviewFile(null)}
                  className="py-3 bg-gray-100 text-gray-700 rounded-lg font-bold hover:bg-gray-200 transition-all text-sm">
                  Close
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
