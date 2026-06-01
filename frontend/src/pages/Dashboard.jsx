import { useEffect, useState, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { fetchFiles, fetchStorage, upload } from '@/store/filesSlice'
import { computeSHA256, checkDuplicate } from '@/api/filesApi'
import { resolveFileName, stageFiles } from '@/utils/fileNaming'
import { fetchShares, fetchZipShares, fetchGlobalAnalytics } from '@/store/sharingSlice'
import { downloadFile, getFiles, getStorageDashboard, getFilesWithPageSize } from '@/api/filesApi'
import { toast } from 'react-hot-toast'

const timeAgo = (date) => {
  if (!date) return 'Unknown'
  const seconds = Math.floor((new Date() - new Date(date)) / 1000)
  if (seconds < 60) return 'Just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

const getFileIcon = (mimeType) => {
  if (!mimeType) return 'fa-file text-gray-500'
  if (mimeType.includes('pdf')) return 'fa-file-pdf text-red-500'
  if (mimeType.includes('image')) return 'fa-image text-blue-500'
  if (mimeType.includes('video')) return 'fa-video text-purple-500'
  if (mimeType.includes('document') || mimeType.includes('word')) return 'fa-file-word text-blue-600'
  if (mimeType.includes('spreadsheet') || mimeType.includes('sheet')) return 'fa-file-excel text-green-600'
  if (mimeType.includes('zip') || mimeType.includes('archive')) return 'fa-file-zipper text-orange-500'
  return 'fa-file text-gray-500'
}

const getFileColor = (mimeType) => {
  if (!mimeType) return 'slate'
  if (mimeType.includes('pdf')) return 'red'
  if (mimeType.includes('image')) return 'blue'
  if (mimeType.includes('video')) return 'purple'
  if (mimeType.includes('document') || mimeType.includes('word')) return 'blue'
  if (mimeType.includes('spreadsheet') || mimeType.includes('sheet')) return 'green'
  if (mimeType.includes('zip') || mimeType.includes('archive')) return 'orange'
  return 'slate'
}

const CAT_META = {
  Images:    { colour: '#6366f1', icon: 'fa-image' },
  Videos:    { colour: '#8b5cf6', icon: 'fa-film' },
  PDFs:      { colour: '#ef4444', icon: 'fa-file-pdf' },
  Documents: { colour: '#2563eb', icon: 'fa-file-word' },
  Archives:  { colour: '#f59e0b', icon: 'fa-file-zipper' },
  Others:    { colour: '#94a3b8', icon: 'fa-file' },
}

function buildActivityData(files) {
  const days = []
  const now  = new Date()
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(now.getDate() - i)
    days.push({
      label: d.toLocaleDateString('en-US', { weekday: 'short' }),
      date:  d.toDateString(),
      count: 0,
    })
  }
  files.forEach((f) => {
    if (!f.uploaded_at) return
    const slot = days.find((d) => d.date === new Date(f.uploaded_at).toDateString())
    if (slot) slot.count++
  })
  return days
}

function calcWeekTrend(files) {
  const now      = new Date()
  const msPerDay = 86400000
  let thisWeek = 0, lastWeek = 0
  files.forEach((f) => {
    if (!f.uploaded_at) return
    const diffDays = (now - new Date(f.uploaded_at)) / msPerDay
    if (diffDays < 7)        thisWeek++
    else if (diffDays < 14)  lastWeek++
  })
  const trend = thisWeek > lastWeek ? 'up' : thisWeek < lastWeek ? 'down' : 'same'
  return { thisWeek, lastWeek, trend }
}

function ActivityChart({ files }) {
  const data   = buildActivityData(files)
  const max    = Math.max(...data.map((d) => d.count), 1)
  const chartH = 68
  const barW   = 28
  const gap    = 10
  const totalW = data.length * (barW + gap) - gap

  return (
    <svg
      viewBox={`0 0 ${totalW} ${chartH + 22}`}
      className="w-full overflow-visible"
      style={{ maxHeight: 96 }}
    >
      <defs>
        <linearGradient id="dbBarGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#60a5fa" />
          <stop offset="100%" stopColor="#1e40af" />
        </linearGradient>
      </defs>
      {data.map((d, i) => {
        const barH = max === 0 ? 2 : Math.max(3, (d.count / max) * chartH)
        const x    = i * (barW + gap)
        const y    = chartH - barH
        const empty = d.count === 0
        return (
          <g key={d.date}>
            <rect
              x={x} y={y} width={barW} height={barH} rx={6}
              className={empty ? 'activity-chart-bar--empty' : 'activity-chart-bar'}
            />
            {d.count > 0 && (
              <text
                x={x + barW / 2} y={y - 4}
                textAnchor="middle" fontSize="8" fontWeight="700"
                className="activity-chart-value"
              >
                {d.count}
              </text>
            )}
            <text
              x={x + barW / 2} y={chartH + 15}
              textAnchor="middle" fontSize="8.5" fontWeight="600"
              className="activity-chart-label"
            >
              {d.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

function useFileBlobUrl(file) {
  const [blobUrl, setBlobUrl]     = useState(null)
  const [blobLoading, setLoading] = useState(false)

  useEffect(() => {
    setBlobUrl(null)
    if (!file) return
    const isMedia =
      file.mime_type?.includes('image') || file.mime_type?.includes('video') ||
      file.mime_type?.includes('audio') || file.mime_type?.includes('pdf')
    if (!isMedia) return
    let cancelled = false
    setLoading(true)
    downloadFile(file.id)
      .then(({ data }) => {
        if (!cancelled) {
          const blob = new Blob([data], { type: file.mime_type || data.type || 'application/octet-stream' })
          setBlobUrl(URL.createObjectURL(blob))
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [file?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => { if (blobUrl) URL.revokeObjectURL(blobUrl) }
  }, [blobUrl])

  return { blobUrl, blobLoading }
}

function FileDetailModal({ file, shares, onClose, onDownload }) {
  const { blobUrl, blobLoading } = useFileBlobUrl(file)
  const handleOpen = () => { if (blobUrl) window.open(blobUrl, '_blank') }

  return (
    <div className="modal-overlay">
      <div className="bg-white rounded-lg p-8 max-w-md w-full animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-start mb-6">
          <h3 className="text-lg font-bold text-gray-900">File Details</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition text-xl">
            <i className="fas fa-xmark"></i>
          </button>
        </div>

        {file.mime_type?.includes('image') && (
          <div className="mb-6 rounded-lg overflow-hidden bg-brand-50 border border-brand-100 flex items-center justify-center min-h-[120px]">
            {blobLoading ? (
              <div className="py-10 flex flex-col items-center gap-2 text-gray-400">
                <i className="fas fa-circle-notch fa-spin text-2xl text-brand-500"></i>
                <p className="text-xs">Loading preview…</p>
              </div>
            ) : blobUrl ? (
              <img src={blobUrl} alt={file.original_name} className="w-full max-h-56 object-contain rounded-lg" />
            ) : (
              <div className="py-10 flex flex-col items-center gap-2 text-gray-400">
                <i className="fas fa-image text-4xl text-blue-300"></i>
                <p className="text-xs">Preview unavailable</p>
              </div>
            )}
          </div>
        )}

        {file.mime_type?.includes('video') && (
          <div className="mb-6 rounded-lg overflow-hidden bg-black">
            {blobLoading ? (
              <div className="py-10 flex flex-col items-center gap-2">
                <i className="fas fa-circle-notch fa-spin text-2xl text-white"></i>
                <p className="text-xs text-gray-300">Loading video…</p>
              </div>
            ) : blobUrl ? (
              <video controls className="w-full max-h-52" src={blobUrl}>Your browser does not support video preview.</video>
            ) : null}
          </div>
        )}

        {file.mime_type?.includes('audio') && (
          <div className="mb-6 p-4 bg-brand-50 rounded-lg">
            {blobLoading ? (
              <div className="flex items-center justify-center gap-2 py-2 text-brand-500">
                <i className="fas fa-circle-notch fa-spin"></i>
                <span className="text-sm">Loading audio…</span>
              </div>
            ) : blobUrl ? (
              <audio controls className="w-full" src={blobUrl} />
            ) : null}
          </div>
        )}

        {file.mime_type?.includes('pdf') && (
          <div className="mb-6 rounded-lg overflow-hidden bg-gray-50 border border-gray-100 min-h-[500px] relative" style={{ overflow: 'hidden' }}>
            {blobLoading ? (
              <div className="py-10 flex flex-col items-center gap-3 text-gray-400">
                <i className="fas fa-circle-notch fa-spin text-2xl text-brand-500"></i>
                <p className="text-xs">Loading PDF…</p>
              </div>
            ) : blobUrl ? (
              <div style={{ height: '500px', position: 'relative', overflow: 'hidden' }}>
                <iframe
                  src={`${blobUrl}#toolbar=0&navpanes=0&scrollbar=0&view=FitH&page=1`}
                  title={file.original_name}
                  style={{ height: '580px', border: 'none', display: 'block', position: 'absolute', top: '-46px', left: 0, width: '100%' }}
                />
              </div>
            ) : (
              <div className="py-12 flex flex-col items-center gap-2 text-gray-400">
                <i className="fas fa-file-pdf text-4xl text-red-300"></i>
                <p className="text-sm">PDF preview unavailable</p>
              </div>
            )}
          </div>
        )}

        {!file.mime_type?.includes('image') && !file.mime_type?.includes('video') &&
         !file.mime_type?.includes('audio') && !file.mime_type?.includes('pdf') && (
          <div className="mb-6 p-6 bg-brand-50 rounded-lg text-center">
            <div className={`text-5xl text-${getFileColor(file.mime_type)}-600 mb-3`}>
              <i className={`fas ${getFileIcon(file.mime_type)}`}></i>
            </div>
            <p className="font-bold text-gray-900 break-all text-sm">{file.original_name}</p>
          </div>
        )}

        {(file.mime_type?.includes('image') || file.mime_type?.includes('video') ||
          file.mime_type?.includes('audio') || file.mime_type?.includes('pdf')) && (
          <p className="font-bold text-gray-900 break-all text-sm text-center mb-4">{file.original_name}</p>
        )}

        <div className="space-y-4 mb-6">
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">File Size</p>
            <p className="text-sm font-bold text-gray-800">{file.file_size_display}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">File Type</p>
            <p className="text-sm font-bold text-gray-800 uppercase">{file.mime_type || 'Unknown'}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Uploaded</p>
            <p className="text-sm font-bold text-gray-800">{new Date(file.uploaded_at).toLocaleString()}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Status</p>
            <p className="text-sm font-bold text-gray-800">
              {shares.some((s) => s.file_id === file.id && s.status === 'active') ? '🔗 Shared' : '🔒 Private'}
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <button
            onClick={() => { onDownload(file); onClose() }}
            className="w-full py-4 bg-brand-600 text-white rounded-lg font-bold hover:bg-brand-700 transition-all flex items-center justify-center gap-2 text-sm"
          >
            <i className="fas fa-download"></i> Download File
          </button>
          {file.mime_type?.includes('pdf') && (
            <button
              onClick={handleOpen}
              disabled={!blobUrl}
              className="w-full py-4 bg-gray-100 text-gray-700 rounded-lg font-bold hover:bg-gray-200 transition-all shadow-sm flex items-center justify-center gap-2 text-sm"
            >
              <i className="fas fa-arrow-up-right-from-square"></i> Open PDF
            </button>
          )}
          <button
            onClick={onClose}
            className="w-full py-3 text-gray-500 font-bold hover:text-gray-700 transition-colors text-sm"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const dispatch = useDispatch()
  const { user } = useSelector((s) => s.auth)
  const { files, storage } = useSelector((s) => s.files)
  const { shares, zipShares, globalAnalytics } = useSelector((s) => s.sharing)

  const [searchQuery, setSearchQuery]               = useState('')
  const [showSearchDropdown, setShowSearchDropdown] = useState(false)
  const [selectedFile, setSelectedFile]             = useState(null)
  const [highlightedIndex, setHighlightedIndex]     = useState(-1)
  const [selectedRecentFile, setSelectedRecentFile] = useState(null)

  const [searchResults, setSearchResults] = useState([])
  const [searchLoading, setSearchLoading] = useState(false)
  const debounceTimer  = useRef(null)
  const searchRef      = useRef(null)
  const searchInputRef = useRef(null)

  const [storageDash, setStorageDash]           = useState(null)
  const [activityFiles, setActivityFiles]       = useState([])
  const [activityLoading, setActivityLoading]   = useState(false)

  const [dropDragActive,     setDropDragActive]     = useState(false)
  const [dropSelectedFiles,  setDropSelectedFiles]  = useState([])
  const [dropUploading,      setDropUploading]      = useState(false)
  const [dropUploadSuccess,  setDropUploadSuccess]  = useState(null)
  const [dropDupeChecking,   setDropDupeChecking]   = useState(false)
  const dropFileInputRef = useRef(null)

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) setShowSearchDropdown(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const runSearch = useCallback(async (query) => {
    if (!query.trim()) { setSearchResults([]); setSearchLoading(false); return }
    setSearchLoading(true)
    try {
      const { data } = await getFiles(1, query.trim(), '-uploaded_at')
      setSearchResults(data?.data?.results?.slice(0, 8) ?? [])
    } catch { setSearchResults([]) }
    finally { setSearchLoading(false) }
  }, [])

  const handleSearchChange = (query) => {
    setSearchQuery(query)
    setHighlightedIndex(-1)
    if (!query.trim()) {
      setShowSearchDropdown(false); setSearchResults([])
      clearTimeout(debounceTimer.current); return
    }
    setShowSearchDropdown(true); setSearchLoading(true)
    clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => runSearch(query), 350)
  }

  useEffect(() => () => clearTimeout(debounceTimer.current), [])

  const handleSearchKeydown = (e) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setHighlightedIndex((p) => (p < searchResults.length - 1 ? p + 1 : p))
        break
      case 'ArrowUp':
        e.preventDefault()
        setHighlightedIndex((p) => (p > 0 ? p - 1 : -1))
        break
      case 'Enter':
        e.preventDefault()
        if (highlightedIndex >= 0 && searchResults[highlightedIndex]) {
          setSelectedFile(searchResults[highlightedIndex])
          setShowSearchDropdown(false); setSearchQuery(''); setSearchResults([])
        }
        break
      case 'Escape':
        e.preventDefault(); setShowSearchDropdown(false); break
      default: break
    }
  }

  const loadStorageDash = useCallback(async () => {
    try {
      const { data } = await getStorageDashboard()
      setStorageDash(data.data)
    } catch (err) {
      console.error(err)
    }
  }, [])

  const loadActivityFiles = useCallback(async () => {
    setActivityLoading(true)
    try {
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - 14)
      cutoff.setHours(0, 0, 0, 0)

      let page      = 1
      let collected = []

      for (;;) {
        const { data }   = await getFilesWithPageSize(page, '', '-uploaded_at', 100)
        const results    = data?.data?.results    || []
        const totalPages = data?.data?.total_pages ?? 1

        if (results.length === 0) break
        collected = [...collected, ...results]

        const oldest     = results[results.length - 1]
        const oldestDate = oldest?.uploaded_at ? new Date(oldest.uploaded_at) : null

        if (page >= totalPages || (oldestDate && oldestDate < cutoff)) break
        page++
      }

      setActivityFiles(collected)
    } catch {
      setActivityFiles([])
    } finally {
      setActivityLoading(false)
    }
  }, [])

  useEffect(() => {
    dispatch(fetchFiles({ page: 1 }))
    dispatch(fetchStorage())
    dispatch(fetchShares({ page: 1 }))
    dispatch(fetchZipShares({ page: 1 }))
    dispatch(fetchGlobalAnalytics())
    loadStorageDash()
    loadActivityFiles()
  }, [dispatch, loadStorageDash, loadActivityFiles])

  const handleDownload = async (file) => {
    const toastId = toast.loading(`Downloading ${file.original_name}...`)
    try {
      const { data } = await downloadFile(file.id)
      const url = window.URL.createObjectURL(data)
      const a   = document.createElement('a')
      a.href = url; a.download = file.original_name; a.click()
      window.URL.revokeObjectURL(url)
      toast.success('Download successful!', { id: toastId })
    } catch { toast.error('Download failed.', { id: toastId }) }
  }

  const filesRef = useRef(files)
  useEffect(() => { filesRef.current = files }, [files])

  const dropRunDupeChecks = useCallback(async (rawFiles) => {
    if (!rawFiles.length) return
    setDropDupeChecking(true)
    const cleared = []
    for (const f of rawFiles) {
      try {
        const sha256   = await computeSHA256(f)
        const { data } = await checkDuplicate(sha256)
        if (data.data?.is_duplicate) {
          const renamed = resolveFileName(f, new Set(filesRef.current.map((x) => x.original_name)))
          cleared.push(renamed)
        } else {
          cleared.push(f)
        }
      } catch { cleared.push(f) }
    }
    setDropDupeChecking(false)
    if (!cleared.length) return
    const { resolved } = stageFiles(cleared, filesRef.current)
    setDropSelectedFiles(resolved)
  }, [])

  const handleDropDrag = (e) => { e.preventDefault(); e.stopPropagation(); setDropDragActive(e.type !== 'dragleave') }
  const handleDropDrop = (e) => { e.preventDefault(); e.stopPropagation(); setDropDragActive(false); dropRunDupeChecks(Array.from(e.dataTransfer.files)) }
  const handleDropFileSelect = (e) => { dropRunDupeChecks(Array.from(e.target.files || [])); e.target.value = '' }

  const handleDropUpload = async () => {
    if (!dropSelectedFiles.length) return
    setDropUploading(true)
    const count  = dropSelectedFiles.length
    const result = await dispatch(upload({ files: dropSelectedFiles, expiryOption: 'never' }))
    setDropUploading(false)
    if (!result.error) {
      setDropUploadSuccess(count === 1 ? `"${dropSelectedFiles[0].name}" uploaded!` : `${count} files uploaded!`)
      setDropSelectedFiles([])
      dispatch(fetchFiles({ page: 1 }))
      dispatch(fetchStorage())
      loadStorageDash()
      setTimeout(() => setDropUploadSuccess(null), 4000)
    }
  }

  const actualUsedPercentage = storage && storage.total_bytes > 0
    ? Math.round((storage.used_bytes / storage.total_bytes) * 100)
    : 0
  const storageFull = storage?.total_bytes > 0 && storage.used_bytes >= storage.total_bytes
  const usedPercentage = Math.min(100, Math.max(0, actualUsedPercentage))
  const overQuota = storage?.total_bytes > 0 && storage.used_bytes > storage.total_bytes
  const recentFiles    = files.slice(0, 5)

  const activeShares = (() => {
    if (globalAnalytics?.totals?.active_count != null) return globalAnalytics.totals.active_count
    return shares.filter((s) => s.status === 'active').length +
           zipShares.filter((z) => z.status === 'active').length
  })()

  const fileTypeBreakdown = (storageDash?.type_usage || []).map((row) => ({
    label:  row.category,
    count:  row.count,
    bytes:  row.bytes,
    colour: CAT_META[row.category]?.colour || '#94a3b8',
    icon:   CAT_META[row.category]?.icon   || 'fa-file',
  }))
  const totalFileCount = fileTypeBreakdown.reduce((sum, t) => sum + t.count, 0)

  const chartFiles  = activityFiles.length > 0 ? activityFiles : files
  const hasAnyFiles = (storage?.file_count ?? 0) > 0
  const showChart   = hasAnyFiles

  const weekTrend = calcWeekTrend(chartFiles)

  // todayUploads: count from chartFiles where uploaded_at is today
  const todayUploads = chartFiles.filter((f) => {
    if (!f.uploaded_at) return false
    return new Date(f.uploaded_at).toDateString() === new Date().toDateString()
  }).length

  const topType = fileTypeBreakdown.length > 0
    ? fileTypeBreakdown.reduce((a, b) => (b.count > a.count ? b : a))
    : null

  const totalBytes   = fileTypeBreakdown.reduce((s, t) => s + (t.bytes || 0), 0)
  const avgFileBytes = totalFileCount > 0 ? Math.round(totalBytes / totalFileCount) : 0
  const fmtBytes = (b) => {
    if (!b) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB']
    let v = b, i = 0
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
    return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
  }

  // mostActiveDay: only count files uploaded within the last 7 days
  const now7 = new Date()
  const msPerDay = 86400000
  const dayCounts = chartFiles.reduce((acc, f) => {
    if (!f.uploaded_at) return acc
    const diffDays = (now7 - new Date(f.uploaded_at)) / msPerDay
    if (diffDays >= 7) return acc
    const day = new Date(f.uploaded_at).toLocaleDateString('en-US', { weekday: 'short' })
    acc[day] = (acc[day] || 0) + 1
    return acc
  }, {})
  const mostActiveDay = Object.keys(dayCounts).length > 0
    ? Object.entries(dayCounts).sort((a, b) => b[1] - a[1])[0][0]
    : null

  const sharedFileIds = new Set(shares.filter((s) => s.status === 'active').map((s) => s.file_id))
  const sharedRatio   = (storage?.file_count ?? 0) > 0
    ? Math.round((sharedFileIds.size / storage.file_count) * 100)
    : 0

  const freeBytes = storage ? (storage.total_bytes - storage.used_bytes) : 0
  const freeMB    = Math.max(0, Math.round(freeBytes / (1024 * 1024)))

  const avatarUrl = `https://ui-avatars.com/api/?name=${user?.first_name || 'User'}&background=5b57ea&color=f0f4f8`

  return (
    <div className="dashboard-shell">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className="brand-chip flex h-10 w-10 shrink-0">
            <i className="fas fa-table-cells-large text-white text-base" aria-hidden />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="page-title leading-tight">
                {user?.first_name ? `${user.first_name}'s Workspace` : 'My Workspace'}
              </h1>
            </div>
            <p className="text-xs text-gray-400 mt-0.5 truncate">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
              {todayUploads > 0 && (
                <span className="ml-2 text-brand-500 font-medium">
                  · {todayUploads} upload{todayUploads !== 1 ? 's' : ''} today
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-row items-center gap-3 shrink-0">
          <div className="relative flex-1 sm:flex-none sm:w-72" ref={searchRef}>
            <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search files"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              onKeyDown={handleSearchKeydown}
              onFocus={() => searchQuery.trim().length > 0 && setShowSearchDropdown(true)}
              className="field w-full pl-12 pr-4 shadow-none"
            />
            {showSearchDropdown && (
              <div className="absolute top-full left-0 right-0 mt-2 widget-card-elevated rounded-xl shadow-dropdown z-50 max-h-96 overflow-y-auto p-0">
                {searchLoading ? (
                  <div className="p-4 text-center text-gray-400 text-sm">
                    <i className="fas fa-spinner fa-spin mr-2"></i>Searching…
                  </div>
                ) : searchResults.length > 0 ? (
                  <>
                    <div className="p-3 border-b border-gray-100 bg-gray-50">
                      <p className="text-xs font-semibold text-gray-500">
                        {searchResults.length} file{searchResults.length !== 1 ? 's' : ''} found
                      </p>
                    </div>
                    <div className="divide-y divide-gray-100">
                      {searchResults.map((file, index) => {
                        const isShared = shares.some((s) => s.file_id === file.id && s.status === 'active')
                        return (
                          <div
                            key={file.id}
                            onClick={() => {
                              setSelectedFile(file); setShowSearchDropdown(false)
                              setSearchQuery(''); setSearchResults([])
                            }}
                            onMouseEnter={() => setHighlightedIndex(index)}
                            className={`p-4 cursor-pointer transition-colors ${highlightedIndex === index ? 'bg-brand-50' : 'hover:bg-gray-50'}`}
                          >
                            <div className="flex items-center gap-3">
                              <div className={`w-10 h-10 rounded-lg bg-${getFileColor(file.mime_type)}-50 text-${getFileColor(file.mime_type)}-600 flex items-center justify-center text-sm flex-shrink-0`}>
                                <i className={`fas ${getFileIcon(file.mime_type)}`}></i>
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-gray-900 truncate">{file.original_name}</p>
                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                  <span className="text-xs text-gray-500">{file.file_size_display}</span>
                                  <span className="text-xs text-gray-400">•</span>
                                  <span className="text-xs text-gray-500">{timeAgo(file.uploaded_at)}</span>
                                  {isShared && (
                                    <>
                                      <span className="text-xs text-gray-400">•</span>
                                      <span className="text-xs text-blue-600 flex items-center gap-1">
                                        <i className="fas fa-share-alt text-[10px]"></i> Shared
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>
                              <i className="fas fa-chevron-right text-slate-300 text-xs flex-shrink-0"></i>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    <div className="p-3 border-t border-gray-100 bg-gray-50">
                      <Link
                        to={`/files?search=${encodeURIComponent(searchQuery)}`}
                        className="text-xs font-semibold text-brand-600 hover:text-brand-700 flex items-center gap-1"
                        onClick={() => setShowSearchDropdown(false)}
                      >
                        See all results in Files <i className="fas fa-arrow-right"></i>
                      </Link>
                    </div>
                  </>
                ) : (
                  <div className="p-8 text-center">
                    <i className="fas fa-search text-slate-300 text-2xl mb-2"></i>
                    <p className="text-sm text-gray-500">No files match "{searchQuery}"</p>
                    <p className="text-xs text-gray-400 mt-1">Try a different search term</p>
                  </div>
                )}
              </div>
            )}
          </div>
          <Link to="/settings" className="shrink-0">
            <img src={avatarUrl} alt="avatar" className="h-11 w-11 rounded-full ring-2 ring-white shadow-md cursor-pointer hover:opacity-80 transition" />
          </Link>
        </div>
      </div>

      {/* Top stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="widget-card dashboard-stat-card bg-white p-5">
          <div className="flex items-start justify-between gap-3 min-w-0">
            <p className="dashboard-label min-w-0 flex-1">Total Files</p>
            <div className="stat-card-icon icon-tint-sky">
              <i className="fas fa-file-lines" aria-hidden />
            </div>
          </div>
          <p className="dashboard-metric mt-4 text-2xl dark:text-gray-100">{storageDash?.file_count ?? storage?.file_count ?? 0}</p>
          <p className="dashboard-subtext mt-1">in your account</p>
          <div className="dashboard-stat-card__footer">
            {topType && topType.count > 0 && (
              <span className={`insight-label${topType.label?.toLowerCase().includes('pdf') ? ' insight-label-pdf' : ''}`}>
                <i className={`fas ${topType.icon}`} aria-hidden />
                <span>Top type: {topType.label}</span>
              </span>
            )}
            <Link to="/files" className="card-action-btn">
              View all files <i className="fas fa-arrow-right shrink-0 text-[10px]" aria-hidden />
            </Link>
          </div>
        </div>

        <div className="widget-card dashboard-stat-card bg-white p-5">
          <div className="flex items-start justify-between gap-3 min-w-0">
            <p className="dashboard-label min-w-0 flex-1">Active Shares</p>
            <div className="stat-card-icon icon-tint-violet">
              <i className="fas fa-share-from-square" aria-hidden />
            </div>
          </div>
          <p className="dashboard-metric mt-4 text-2xl dark:text-gray-100">{activeShares}</p>
          <p className="dashboard-subtext mt-1">singles &amp; ZIP shares</p>
          <div className="dashboard-stat-card__footer">
            <Link to="/sharing" className="card-action-btn">
              Manage shares <i className="fas fa-arrow-right shrink-0 text-[10px]" aria-hidden />
            </Link>
          </div>
        </div>

        <div className="widget-card dashboard-stat-card bg-white p-5">
          <div className="flex items-start justify-between gap-3 min-w-0">
            <p className="dashboard-label min-w-0 flex-1">Storage Used</p>
            <div className="stat-card-icon icon-tint-amber">
              <i className="fas fa-hard-drive" aria-hidden />
            </div>
          </div>
          <p className="dashboard-metric mt-4 text-2xl dark:text-gray-100">{storage?.used_mb ?? 0} MB</p>
          <p className="dashboard-subtext mt-1">Used of {storage?.total_gb ?? 1} GB</p>
          <div className="dashboard-stat-card__footer">
            <Link to="/storage" className="card-action-btn">
              Manage storage <i className="fas fa-arrow-right shrink-0 text-[10px]" aria-hidden />
            </Link>
          </div>
        </div>

        <div className="widget-card dashboard-stat-card bg-white p-5">
          <div className="flex items-start justify-between gap-3 min-w-0">
            <p className="dashboard-label min-w-0 flex-1">Usage</p>
            <div className="stat-card-icon icon-tint-indigo">
              <i className="fas fa-chart-column" aria-hidden />
            </div>
          </div>
          <p className="dashboard-metric mt-4 text-2xl dark:text-gray-100">{usedPercentage}%</p>
          <p className="dashboard-subtext mt-1">storage used</p>
          <div className="dashboard-stat-card__footer">
            <span className="stat-status-badge">
              <i className="fas fa-circle-check text-xs" aria-hidden />
              <span>Active</span>
            </span>
            <Link to="/storage" className="card-action-btn">
              View details <i className="fas fa-arrow-right shrink-0 text-[10px]" aria-hidden />
            </Link>
          </div>
        </div>
      </div>

      {/* Main grid */}
      <div className="dashboard-grid-main">

        {/* Storage Overview */}
        <div className="widget-card-elevated bg-white p-5 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h2 className="dashboard-section-title section-title">Storage Overview</h2>
            <i className="fas fa-hdd text-sm text-violet-600 dark:text-violet-400" aria-hidden />
          </div>

          <div className="flex items-center justify-center">
            <div className="relative h-32 w-32">
              <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100">
                <defs>
                  <linearGradient id="storageDonutGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#6366F1" />
                    <stop offset="100%" stopColor="#8B5CF6" />
                  </linearGradient>
                </defs>
                <circle cx="50" cy="50" r="42" strokeWidth="6" className="fill-none storage-donut-track" />
                <circle
                  cx="50" cy="50" r="42" strokeWidth="6" strokeLinecap="round"
                  className="fill-none storage-donut-used transition-all duration-700"
                  strokeDasharray={`${(usedPercentage / 100) * 264} 264`}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="dashboard-metric text-2xl">{usedPercentage}%</span>
                <span className="dashboard-subtext text-[10px]">Used</span>
              </div>
            </div>
          </div>
          {overQuota && (
            <div className="mt-4 rounded-xl bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400 flex items-center gap-2">
              <i className="fas fa-triangle-exclamation text-red-500" />
              Storage limit exceeded. Delete files or empty trash to resume uploading.
            </div>
          )}

          <div className="mt-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full storage-legend-dot dark:bg-[#3b82f6]"></div>
                <span className="dashboard-subtext">Used Space</span>
              </div>
              <span className="dashboard-metric text-xs">{storage?.used_mb} MB</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-slate-200 dark:bg-[#243047]"></div>
                <span className="dashboard-subtext">Free Space</span>
              </div>
              <span className="dashboard-metric text-xs">{freeMB} MB</span>
            </div>
          </div>

          {fileTypeBreakdown.length > 0 && (
            <div className="mt-4 pt-3 border-t border-gray-100">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">File Types</p>
              <div className="space-y-2">
                {fileTypeBreakdown.map((type) => {
                  const pct = totalFileCount > 0 ? Math.round((type.count / totalFileCount) * 100) : 0
                  return (
                    <div key={type.label}>
                      <div className="flex items-center justify-between text-xs mb-0.5">
                        <span className="flex items-center gap-1.5 font-medium text-gray-600">
                          <i className={`fas ${type.icon} text-[10px]`} style={{ color: type.colour }}></i>
                          {type.label}
                        </span>
                        <span className="text-gray-400">{type.count} file{type.count !== 1 ? 's' : ''}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${pct}%`, background: type.colour }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {!storageDash && fileTypeBreakdown.length === 0 && (
            <div className="mt-4 pt-3 border-t border-gray-100 space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">File Types</p>
              {[1, 2, 3].map((n) => (
                <div key={n} className="animate-pulse">
                  <div className="flex justify-between mb-1">
                    <div className="h-3 w-16 bg-gray-100 rounded"></div>
                    <div className="h-3 w-10 bg-gray-100 rounded"></div>
                  </div>
                  <div className="h-1.5 rounded-full bg-gray-100"></div>
                </div>
              ))}
            </div>
          )}

          <div className="flex-1" />

          <div className="mt-4 pt-3 border-t border-gray-100">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Summary</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-gray-50 px-3 py-2.5">
                <p className="text-[10px] text-gray-400 font-medium leading-none mb-1">Total Files</p>
                <p className="text-sm font-bold text-gray-800">{storageDash?.file_count ?? storage?.file_count ?? 0}</p>
              </div>
              <div className="rounded-xl bg-gray-50 px-3 py-2.5">
                <p className="text-[10px] text-gray-400 font-medium leading-none mb-1">Used</p>
                <p className="text-sm font-bold text-gray-800">{storage?.used_mb ?? 0} MB</p>
              </div>
              <div className="rounded-xl bg-gray-50 px-3 py-2.5">
                <p className="text-[10px] text-gray-400 font-medium leading-none mb-1">Free</p>
                <p className="text-sm font-bold text-gray-800">{freeMB} MB</p>
              </div>
              <div className="rounded-xl bg-gray-50 px-3 py-2.5">
                <p className="text-[10px] text-gray-400 font-medium leading-none mb-1">Capacity</p>
                <p className="text-sm font-bold text-gray-800">{storage?.total_gb ?? 1} GB</p>
              </div>
            </div>
            <Link
              to="/storage"
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-gray-100 bg-gray-50 py-2.5 text-[11px] font-semibold text-brand-600 hover:bg-brand-50 hover:border-brand-100 transition-colors"
            >
              <i className="fas fa-hard-drive text-[10px]" />
              Manage Storage
            </Link>

            <div className={`mt-2 flex items-start gap-2 rounded-xl px-3 py-2.5 ${
              storageFull ? 'bg-red-50' : usedPercentage >= 80 ? 'bg-red-50' : usedPercentage >= 50 ? 'bg-amber-50' : 'bg-emerald-50'
            }`}>
              <i className={`fas ${storageFull || usedPercentage >= 80 ? 'fa-triangle-exclamation text-red-500' : 'fa-circle-check text-emerald-500'} text-xs mt-0.5 shrink-0`} />
              <p className="text-[11px] text-gray-600 leading-relaxed">
                {storageFull
                  ? 'Storage full — delete files to free space.'
                  : actualUsedPercentage > 95
                    ? 'Storage above 95% — delete files to free space.'
                    : usedPercentage >= 80
                      ? 'Storage almost full — delete files to free space.'
                      : usedPercentage >= 50
                        ? 'Over halfway used. Consider cleaning up.'
                        : `Healthy — ${100 - usedPercentage}% still available.`}
                {(storageDash?.trash_count ?? 0) > 0 && (
                  <> <Link to="/trash" className="text-brand-600 font-semibold hover:underline">{storageDash.trash_count} in trash.</Link></>
                )}
              </p>
            </div>
          </div>
        </div>

        {/* Centre column: Activity + Recent Files */}
        <div className="flex flex-col gap-6">

          {/* Upload Activity */}
          <div className="widget-card-elevated bg-white p-6">
            <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
              <h2 className="dashboard-section-title section-title">Upload Activity</h2>
              <div className="flex items-center gap-2 flex-wrap">
                {hasAnyFiles && !activityLoading && (
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold border ${
                    weekTrend.trend === 'up'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                      : weekTrend.trend === 'down'
                        ? 'bg-red-50 text-red-600 border-red-100'
                        : 'bg-gray-50 text-gray-500 border-gray-100'
                  }`}>
                    <i className={`fas fa-arrow-${weekTrend.trend === 'up' ? 'up' : weekTrend.trend === 'down' ? 'down' : 'right'} text-[8px]`}></i>
                    {weekTrend.thisWeek} this week
                  </span>
                )}
                <span className="text-xs text-gray-400 font-medium bg-gray-50 rounded-lg px-2 py-1 border border-gray-100">
                  Last 7 days
                </span>
              </div>
            </div>

            {activityLoading ? (
              <div className="py-6 text-center text-gray-400">
                <i className="fas fa-circle-notch fa-spin text-xl text-brand-300 mb-2 block"></i>
                <p className="text-xs">Loading activity…</p>
              </div>
            ) : showChart ? (
              <>
                <ActivityChart files={chartFiles} />
                {weekTrend.thisWeek === 0 && (
                  <p className="text-center text-xs text-gray-400 mt-2">
                    No uploads in the last 7 days
                  </p>
                )}
              </>
            ) : (
              <div className="py-6 text-center text-gray-400">
                <i className="fas fa-chart-bar text-3xl text-slate-200 mb-2 block"></i>
                <p className="text-xs">No upload data yet</p>
              </div>
            )}

            <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
              <span className="text-xs text-gray-400">
                {storage?.file_count ?? 0} total file{(storage?.file_count ?? 0) !== 1 ? 's' : ''} in workspace
              </span>
              <Link to="/files" className="text-xs font-semibold text-brand-600 hover:text-brand-700">
                View All →
              </Link>
            </div>
          </div>

          {/* Recent Files */}
          <div className="widget-card-elevated bg-white p-6 flex-1 flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <h2 className="dashboard-section-title section-title">Recent Files</h2>
              <Link
                to="/files"
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-600 hover:text-brand-700 transition-colors"
              >
                Browse all <i className="fas fa-arrow-right text-[9px]"></i>
              </Link>
            </div>
            <div className="space-y-1 flex-1">
              {recentFiles.length > 0 ? (
                recentFiles.map((file) => {
                  const isShared = shares.some((s) => s.file_id === file.id && s.status === 'active')
                  return (
                    <div
                      key={file.id}
                      onClick={() => setSelectedRecentFile(file)}
                      className="group flex items-center gap-3 rounded-xl border border-transparent p-2.5 transition hover:border-gray-200 hover:bg-gray-50 dark:hover:border-midnight-500 dark:hover:bg-midnight-700/50 cursor-pointer"
                    >
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-${getFileColor(file.mime_type)}-50 text-${getFileColor(file.mime_type)}-600`}>
                        <i className={`fas ${getFileIcon(file.mime_type)} text-sm`}></i>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-gray-900">{file.original_name}</p>
                        <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                          {file.file_size_display}
                          {isShared && (
                            <><span>•</span><i className="fas fa-share-alt text-[10px]"></i><span>Shared</span></>
                          )}
                        </p>
                      </div>
                      <button className="h-7 w-7 flex items-center justify-center rounded-lg text-gray-400 opacity-0 group-hover:opacity-100 hover:bg-gray-200 transition text-xs">
                        <i className="fas fa-eye"></i>
                      </button>
                    </div>
                  )
                })
              ) : (
                <div className="rounded-xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-500">
                  <i className="fas fa-inbox text-2xl text-slate-300 mb-2 block"></i>
                  No recent files found
                </div>
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
              <span className="text-xs text-gray-400">
                Showing {recentFiles.length} of {storage?.file_count ?? 0} files
              </span>
            </div>
          </div>
        </div>

        {/* Right column: Quick Upload + Quick Actions */}
        <div className="flex flex-col gap-6">

          {/* Quick Upload */}
          <div className="widget-card-elevated bg-white p-5 flex-1 flex flex-col">
            <div className="flex items-center gap-2 mb-3">
              <div className="stat-card-icon icon-tint-sky !h-8 !w-8 text-xs">
                <i className="fas fa-cloud-arrow-up" aria-hidden />
              </div>
              <h2 className="dashboard-section-title section-title text-sm">Quick Upload</h2>
            </div>

            <input
              ref={dropFileInputRef}
              type="file"
              multiple
              onChange={handleDropFileSelect}
              className="hidden"
              aria-hidden="true"
            />

            {dropUploadSuccess && (
              <div className="mb-3 flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-100 rounded-xl text-xs text-emerald-700 font-semibold">
                <i className="fas fa-circle-check flex-shrink-0" />
                {dropUploadSuccess}
              </div>
            )}

            <div
              role="button"
              tabIndex={0}
              onDragEnter={handleDropDrag}
              onDragLeave={handleDropDrag}
              onDragOver={handleDropDrag}
              onDrop={handleDropDrop}
              onClick={() => dropFileInputRef.current?.click()}
              onKeyDown={(e) => e.key === 'Enter' && dropFileInputRef.current?.click()}
              className={`flex-1 flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed cursor-pointer transition-all select-none min-h-[120px] ${
                dropDragActive
                  ? 'border-brand-500 bg-brand-50/60'
                  : 'border-gray-200 hover:border-brand-300 hover:bg-brand-50/20'
              }`}
            >
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl pointer-events-none transition-colors ${
                dropDragActive ? 'bg-brand-100 text-brand-600' : 'bg-gray-50 text-gray-400'
              }`}>
                <i className={`fas ${dropDupeChecking || dropUploading ? 'fa-spinner fa-spin' : 'fa-cloud-arrow-up'}`} />
              </div>
              <div className="text-center pointer-events-none">
                <p className="text-xs font-bold text-gray-700">
                  {dropDupeChecking ? 'Checking duplicates…' : dropUploading ? 'Uploading…' : 'Drop files here'}
                </p>
                <p className="text-[10px] text-gray-400 mt-0.5">or click to browse</p>
              </div>
            </div>

            {dropSelectedFiles.length > 0 && !dropUploading && (
              <div className="mt-3 space-y-2">
                <div className="max-h-24 overflow-y-auto space-y-1">
                  {dropSelectedFiles.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 px-2 py-1.5 bg-gray-50 rounded-lg">
                      <i className="fas fa-file text-gray-400 text-[10px] flex-shrink-0" />
                      <span className="text-[11px] text-gray-700 truncate flex-1">{f.name}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); setDropSelectedFiles((prev) => prev.filter((_, idx) => idx !== i)) }}
                        className="text-gray-300 hover:text-red-400 transition-colors flex-shrink-0"
                      >
                        <i className="fas fa-xmark text-[10px]" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setDropSelectedFiles([])}
                    className="px-3 py-2 text-[11px] font-bold text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    Clear
                  </button>
                  <button
                    onClick={handleDropUpload}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-brand-600 text-white rounded-xl text-[11px] font-bold hover:bg-brand-700 transition-all"
                  >
                    <i className="fas fa-upload text-[10px]" />
                    Upload {dropSelectedFiles.length} file{dropSelectedFiles.length !== 1 ? 's' : ''}
                  </button>
                </div>
              </div>
            )}

            <div className="mt-3 pt-3 border-t border-gray-100">
              <Link
                to="/files"
                className="flex w-full items-center justify-center gap-1.5 text-[11px] font-semibold text-brand-600 hover:text-brand-700 transition-colors"
              >
                <i className="fas fa-folder-open text-[10px]" />
                Go to Files for full upload options
              </Link>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="widget-card-featured bg-white p-5 flex-1 flex flex-col">
            <div className="relative flex flex-col flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-[#8b9cb8] mb-0.5">Navigation</p>
              <h2 className="dashboard-section-title section-title mb-4">Quick Actions</h2>
              <div className="space-y-2">
                {[
                  { to: '/files',    icon: 'fa-folder-open',       label: 'Upload Files',   tint: 'sky' },
                  { to: '/sharing',  icon: 'fa-share-from-square', label: 'Share Files',    tint: 'violet' },
                  { to: '/storage',  icon: 'fa-hard-drive',        label: 'Manage Storage', tint: 'amber' },
                  { to: '/settings', icon: 'fa-gear',              label: 'Settings',       tint: 'indigo' },
                ].map(({ to, icon, label, tint }) => (
                  <Link key={to} to={to} className="widget-action-row group">
                    <span className="flex items-center gap-2.5 text-sm font-medium text-slate-700 dark:text-gray-200">
                      <span className={`quick-action-icon icon-tint-${tint}`}>
                        <i className={`fas ${icon}`} aria-hidden />
                      </span>
                      {label}
                    </span>
                    <i className="fas fa-arrow-right dashboard-icon-muted text-xs transition-colors group-hover:text-blue-600 dark:group-hover:text-blue-400"></i>
                  </Link>
                ))}
              </div>

              <div className="flex-1" />

              <div className="mt-4 pt-4 border-t border-gray-100 dark:border-midnight-500">
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="font-medium text-gray-500 dark:text-gray-400">Storage</span>
                  <span className="text-gray-500 dark:text-[#8b9cb8]">{usedPercentage}% used</span>
                </div>
                <div className="h-1.5 rounded-full bg-gray-100 dark:bg-midnight-600 overflow-hidden">
                  <div
                    className="h-full rounded-full chart-progress-fill dark:bg-[#3b82f6] transition-all duration-700"
                    style={{ width: `${usedPercentage}%` }}
                  />
                </div>
                <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1.5">
                  {storage?.used_mb ?? 0} MB of {storage?.total_gb ?? 1} GB used
                </p>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Bottom mini-stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-4 items-stretch">

        <div className="widget-card-elevated bg-white flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-3 sm:py-4 min-h-[80px] overflow-hidden">
          <div className="stat-card-icon icon-tint-indigo !h-8 !w-8 sm:!h-9 sm:!w-9 text-xs sm:text-sm shrink-0">
            <i className="fas fa-weight-hanging" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-gray-400 leading-none mb-0.5 truncate">Avg Size</p>
            <p className="text-xs sm:text-sm font-bold text-gray-900 truncate">{fmtBytes(avgFileBytes)}</p>
            <p className="text-[9px] sm:text-[10px] text-gray-400 mt-0.5">per file</p>
          </div>
        </div>

        <div className="widget-card-elevated bg-white flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-3 sm:py-4 min-h-[80px] overflow-hidden">
          <div className="stat-card-icon icon-tint-violet !h-8 !w-8 sm:!h-9 sm:!w-9 text-xs sm:text-sm shrink-0">
            <i className="fas fa-share-from-square" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-gray-400 leading-none mb-0.5 truncate">Shared</p>
            <p className="text-xs sm:text-sm font-bold text-gray-900">{sharedRatio}%</p>
            <p className="text-[9px] sm:text-[10px] text-gray-400 mt-0.5 truncate">of your files</p>
          </div>
        </div>

        <div className="widget-card-elevated bg-white flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-3 sm:py-4 min-h-[80px] overflow-hidden">
          <div className="stat-card-icon icon-tint-cyan !h-8 !w-8 sm:!h-9 sm:!w-9 text-xs sm:text-sm shrink-0">
            <i className="fas fa-calendar-day" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-gray-400 leading-none mb-0.5 truncate">Top Day</p>
            <p className="text-xs sm:text-sm font-bold text-gray-900">{mostActiveDay ?? '—'}</p>
            <p className="text-[9px] sm:text-[10px] text-gray-400 mt-0.5 truncate">most uploads</p>
          </div>
        </div>

        <div className="widget-card-elevated bg-white flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-3 sm:py-4 min-h-[80px] overflow-hidden">
          <div className={`stat-card-icon !h-8 !w-8 sm:!h-9 sm:!w-9 text-xs sm:text-sm shrink-0 ${
            weekTrend.trend === 'up' ? 'icon-tint-emerald'
            : weekTrend.trend === 'down' ? 'icon-tint-rose'
            : 'icon-tint-slate'
          }`}>
            <i className={`fas ${
              weekTrend.trend === 'up' ? 'fa-arrow-trend-up'
              : weekTrend.trend === 'down' ? 'fa-arrow-trend-down'
              : 'fa-minus'
            }`} aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-gray-400 leading-none mb-0.5 truncate">This Week</p>
            <p className="text-xs sm:text-sm font-bold text-gray-900 truncate">{weekTrend.thisWeek} uploads</p>
            <p className="text-[9px] sm:text-[10px] mt-0.5 font-medium truncate" style={{
              color: weekTrend.trend === 'up' ? '#10b981' : weekTrend.trend === 'down' ? '#ef4444' : '#94a3b8'
            }}>
              {weekTrend.lastWeek > 0
                ? `vs ${weekTrend.lastWeek} last week`
                : 'no data last week'}
            </p>
          </div>
        </div>

      </div>

      {/* Modals */}
      {selectedFile && (
        <FileDetailModal
          file={selectedFile}
          shares={shares}
          onClose={() => setSelectedFile(null)}
          onDownload={handleDownload}
        />
      )}
      {selectedRecentFile && (
        <FileDetailModal
          file={selectedRecentFile}
          shares={shares}
          onClose={() => setSelectedRecentFile(null)}
          onDownload={handleDownload}
        />
      )}
    </div>
  )
}