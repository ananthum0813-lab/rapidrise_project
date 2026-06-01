/**
 * PublicZipSharePage.jsx
 * -----------------------------------------------------------------------------
 * Route: /zip-share/:token   (no auth required)
 */

import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getPublicZipShareInfo, downloadPublicZipShare } from '@/api/sharingApi'
import { toast } from 'react-hot-toast'


function fmtDate(iso) {
  if (!iso) return '�'
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric', month: 'long', day: 'numeric',
  })
}

function fmtDateTime(iso) {
  if (!iso) return '�'
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function mimeIcon(mime) {
  if (!mime)                                                   return 'fa-file text-gray-400'
  if (mime.includes('pdf'))                                    return 'fa-file-pdf text-red-500'
  if (mime.includes('image'))                                  return 'fa-file-image text-blue-500'
  if (mime.includes('video'))                                  return 'fa-file-video text-purple-500'
  if (mime.includes('audio'))                                  return 'fa-file-audio text-pink-500'
  if (mime.includes('word') || mime.includes('document'))      return 'fa-file-word text-blue-600'
  if (mime.includes('spreadsheet') || mime.includes('excel') ||
      mime.includes('sheet'))                                  return 'fa-file-excel text-green-600'
  if (mime.includes('presentation') || mime.includes('powerpoint')) return 'fa-file-powerpoint text-orange-500'
  if (mime.includes('zip') || mime.includes('archive') ||
      mime.includes('compressed'))                             return 'fa-file-zipper text-amber-500'
  if (mime.includes('text') || mime.includes('csv'))           return 'fa-file-lines text-gray-500'
  return 'fa-file text-gray-400'
}


function ErrorScreen({ type, message }) {
  const config = {
    invalid:  { emoji: '??', title: 'Invalid Link',  sub: 'This zip share link is invalid or malformed.',             color: 'text-gray-600',   bg: 'from-gray-50 to-slate-50 dark:from-gray-900 dark:to-slate-900'    },
    expired:  { emoji: '?', title: 'Link Expired',   sub: 'This zip share link has expired and is no longer active.', color: 'text-amber-600', bg: 'from-amber-50 to-yellow-50 dark:from-amber-950 dark:to-yellow-950' },
    revoked:  { emoji: '??', title: 'Access Revoked', sub: 'The owner has disabled access to this zip share.',         color: 'text-gray-600',   bg: 'from-gray-50 to-slate-50 dark:from-gray-900 dark:to-slate-900'    },
    error:    { emoji: '??', title: 'Unable to Process Request',  sub: message || 'An unexpected error occurred. Please try again.',   color: 'text-red-600',    bg: 'from-red-50 to-rose-50 dark:from-red-950 dark:to-rose-950'     },
  }[type] || { emoji: '??', title: 'Error',          sub: 'Something unexpected happened.',                           color: 'text-red-600',    bg: 'from-red-50 to-rose-50 dark:from-red-950 dark:to-rose-950'     }

  return (
    <div className={`min-h-screen bg-gradient-to-br ${config.bg} flex items-center justify-center p-4 sm:p-6`}>
      <div className="bg-white/80 dark:bg-midnight-800/80 backdrop-blur-xl rounded-2xl sm:rounded-3xl shadow-2xl p-8 sm:p-12 max-w-md w-full text-center border border-white/20 dark:border-midnight-600/50">
        <div className="text-6xl sm:text-7xl mb-6 drop-shadow-sm">{config.emoji}</div>
        <h2 className={`text-2xl sm:text-3xl font-black mb-3 ${config.color}`}>{config.title}</h2>
        <p className="text-gray-600 dark:text-gray-400 text-sm sm:text-base leading-relaxed mb-8">{config.sub}</p>
        <button
          onClick={() => window.location.href = '/'}
          className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-gray-900 hover:bg-gray-800 dark:bg-white dark:hover:bg-gray-100 text-white dark:text-gray-900 rounded-xl font-bold text-sm transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 w-full sm:w-auto"
        >
          <i className="fas fa-home"></i> Go to Homepage
        </button>
      </div>
    </div>
  )
}


function LoadingScreen() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
      <div className="text-center space-y-3">
        <div className="w-14 h-14 rounded-lg bg-violet-100 dark:bg-violet-900 flex items-center justify-center mx-auto">
          <i className="fas fa-file-zipper text-2xl text-violet-500 dark:text-violet-400 animate-pulse"></i>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Validating share link…</p>
      </div>
    </div>
  )
}


function FileListItem({ file }) {
  return (
    <div className="flex items-center gap-3 py-2.5 px-1 border-b border-gray-100 dark:border-gray-700 last:border-0">
      <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
        <i className={`fas ${mimeIcon(file.mime_type)} text-sm`}></i>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{file.original_name}</p>
        {file.mime_type && (
          <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
            {file.mime_type.split('/')[1]?.toUpperCase() || file.mime_type}
          </p>
        )}
      </div>
      {file.file_size_display && (
        <span className="text-xs text-gray-400 dark:text-gray-500 font-medium flex-shrink-0">{file.file_size_display}</span>
      )}
    </div>
  )
}

export default function PublicZipSharePage() {
  const { token } = useParams()

  const [loading,     setLoading]     = useState(true)
  const [info,        setInfo]        = useState(null)
  const [error,       setError]       = useState(null)    // { type, message }
  const [downloading, setDownloading] = useState(false)
  const [downloaded,  setDownloaded]  = useState(false)
  const [dlError,     setDlError]     = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { data } = await getPublicZipShareInfo(token)
        if (!cancelled) setInfo(data.data)
      } catch (err) {
        if (cancelled) return
        const httpStatus = err.response?.status
        const msg        = err.response?.data?.detail
          || err.response?.data?.message
          || 'Something went wrong.'
        const lower = msg.toLowerCase()

        if (httpStatus === 404) {
          if (lower.includes('expir'))       setError({ type: 'expired', message: msg })
          else if (lower.includes('revok'))  setError({ type: 'revoked', message: msg })
          else                               setError({ type: 'invalid', message: msg })
        } else {
          setError({ type: 'error', message: msg })
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [token])

  const handleDownload = async () => {
    if (downloading) return
    setDownloading(true)
    setDlError('')
    const toastId = toast.loading(`Downloading ${info?.zip_name || 'shared_files.zip'}...`)
    try {
      const { data } = await downloadPublicZipShare(token)
      const url  = window.URL.createObjectURL(new Blob([data], { type: 'application/zip' }))
      const link = document.createElement('a')
      link.href     = url
      link.download = info?.zip_name || 'shared_files.zip'
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
      setDownloaded(true)
      toast.success('Download successful!', { id: toastId })
    } catch (err) {
      const msg = err.response?.data?.detail
        || err.response?.data?.message
        || 'Download failed. The link may have expired.'
      setDlError(msg)
      toast.error('Download failed.', { id: toastId })
    } finally {
      setDownloading(false)
    }
  }

  if (loading) return <LoadingScreen />
  if (error)   return <ErrorScreen type={error.type} message={error.message} />

  const files      = info.files_info || []
  const fileCount  = info.file_count || files.length
  const isExpired  = info.expires_at && new Date(info.expires_at) < new Date()

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-brand-50 to-slate-50 dark:from-gray-950 dark:via-gray-900 dark:to-slate-900 flex items-start justify-center p-4 pt-8 sm:pt-16">
      <div className="max-w-lg w-full space-y-4">

                <div className="bg-white dark:bg-gray-900 rounded-lg shadow-dropdown border border-gray-100 dark:border-gray-700 p-8 text-center">
                    <div className="w-20 h-20 bg-gradient-to-br from-violet-100 to-brand-100 dark:from-violet-900 dark:to-violet-800 rounded-lg flex items-center justify-center mx-auto mb-5 shadow-inner">
            <i className="fas fa-file-zipper text-4xl text-violet-600 dark:text-violet-400"></i>
          </div>

                    <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 break-all leading-tight">
            {info.zip_name || 'shared_files.zip'}
          </h1>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1.5">
            {fileCount} file{fileCount !== 1 ? 's' : ''} bundled as a ZIP archive
          </p>

                    {info.message && (
            <div className="mt-5 px-4 py-3 bg-violet-50 dark:bg-violet-950 border-l-4 border-violet-400 rounded-r-2xl text-left">
              <p className="text-[10px] font-bold text-violet-500 dark:text-violet-400 uppercase tracking-wider mb-1">Message from sender</p>
              <p className="text-sm text-violet-900 dark:text-violet-200 leading-relaxed">"{info.message}"</p>
            </div>
          )}
        </div>

                <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700 p-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-50 dark:bg-gray-800 rounded-xl px-4 py-3">
              <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Files</p>
              <p className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-0.5">{fileCount}</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-xl px-4 py-3">
              <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Shared</p>
              <p className="text-sm font-bold text-gray-900 dark:text-gray-100 mt-0.5">{fmtDate(info.shared_at)}</p>
            </div>
            <div className={`col-span-2 rounded-xl px-4 py-3 ${isExpired ? 'bg-red-50 dark:bg-red-950' : 'bg-gray-50 dark:bg-gray-800'}`}>
              <p className={`text-[10px] font-bold uppercase tracking-wider ${isExpired ? 'text-red-400' : 'text-gray-400 dark:text-gray-500'}`}>
                {isExpired ? 'Expired' : 'Expires'}
              </p>
              <p className={`text-sm font-bold mt-0.5 ${isExpired ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-gray-100'}`}>
                {fmtDateTime(info.expires_at)}
              </p>
            </div>
          </div>
        </div>

                {files.length > 0 && (
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <i className="fas fa-list text-violet-500 dark:text-violet-400 text-sm"></i>
                <span className="text-sm font-bold text-gray-900 dark:text-gray-100">Files in this bundle</span>
              </div>
              <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">{files.length} item{files.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="px-5 py-2 max-h-64 overflow-y-auto">
              {files.map((f) => (
                <FileListItem key={f.id} file={f} />
              ))}
            </div>
          </div>
        )}

                <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700 p-5 space-y-4">

                    {dlError && (
            <div className="flex items-start gap-3 px-4 py-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-700 dark:text-red-400">
              <i className="fas fa-circle-exclamation mt-0.5 flex-shrink-0"></i>
              <span>{dlError}</span>
            </div>
          )}

                    {downloaded && !dlError && (
            <div className="flex items-center gap-3 px-4 py-3 bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 rounded-xl text-sm text-emerald-700 dark:text-emerald-400">
              <i className="fas fa-circle-check flex-shrink-0"></i>
              <span>ZIP downloaded successfully!</span>
            </div>
          )}

                    <button
            onClick={handleDownload}
            disabled={downloading || isExpired}
            className={`w-full py-4 rounded-lg font-bold text-sm transition-all flex items-center justify-center gap-2.5 shadow-lg ${
              isExpired
                ? 'bg-slate-200 dark:bg-slate-700 text-gray-400 dark:text-gray-500 cursor-not-allowed shadow-none'
                : downloading
                  ? 'bg-violet-400 dark:bg-violet-700 text-white cursor-wait shadow-violet-200 dark:shadow-violet-900'
                  : downloaded
                    ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-200 dark:shadow-emerald-900'
                    : 'bg-violet-600 text-white hover:bg-violet-700 active:scale-[0.98] shadow-violet-200 dark:shadow-violet-900'
            }`}
          >
            {isExpired ? (
              <><i className="fas fa-clock"></i>Link Expired</>
            ) : downloading ? (
              <><i className="fas fa-spinner fa-spin"></i>Preparing download�</>
            ) : downloaded ? (
              <><i className="fas fa-circle-check"></i>Downloaded � Click to download again</>
            ) : (
              <><i className="fas fa-download"></i>Download ZIP ({fileCount} file{fileCount !== 1 ? 's' : ''})</>
            )}
          </button>

          {!isExpired && (
            <div className="flex items-start gap-3">
              <i className="fas fa-shield-halved text-emerald-400 mt-0.5 flex-shrink-0 text-sm"></i>
              <p className="text-xs text-gray-400 dark:text-gray-500 leading-relaxed">
                This link is private to you. The link expires on <strong className="text-gray-500 dark:text-gray-400">{fmtDateTime(info.expires_at)}</strong>.
              </p>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-slate-300 dark:text-slate-600 pb-6">
          Powered by VShare � Secure File Sharing
        </p>
      </div>
    </div>
  )
}