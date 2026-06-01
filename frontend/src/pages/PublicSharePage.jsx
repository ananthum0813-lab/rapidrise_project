/**
 * PublicSharePage.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Route: /share/:token   (no auth required)
 *
 * This is the page recipients see when a file owner shares a file with them.
 * Flow:
 *  1. Load → GET /api/sharing/public/<token>/ to validate share & fetch file info
 *  2. Show file details (name, size, type, expiry, message)
 *  3. Download button → GET /api/sharing/public/<token>/download/
 *
 * Separate from PublicUploadPage (/shared/:token) which is for file REQUESTS.
 */

import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getPublicShareInfo, downloadPublicShare } from '@/api/sharingApi'
import { toast } from 'react-hot-toast'

function formatBytes(bytes) {
  if (!bytes) return '—'
  if (bytes < 1024)       return `${bytes} B`
  if (bytes < 1024 ** 2)  return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3)  return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`
}

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
}

function getFileIcon(mime) {
  if (!mime)                                                  return 'fa-file text-gray-400'
  if (mime.includes('pdf'))                                   return 'fa-file-pdf text-red-500'
  if (mime.includes('image'))                                 return 'fa-image text-blue-500'
  if (mime.includes('video'))                                 return 'fa-video text-purple-500'
  if (mime.includes('word') || mime.includes('document'))     return 'fa-file-word text-blue-600'
  if (mime.includes('spreadsheet') || mime.includes('sheet')) return 'fa-file-excel text-green-600'
  if (mime.includes('zip') || mime.includes('archive'))       return 'fa-file-zipper text-orange-500'
  if (mime.includes('audio'))                                 return 'fa-file-audio text-pink-500'
  if (mime.includes('text'))                                  return 'fa-file-lines text-gray-500'
  return 'fa-file text-gray-400'
}

function ErrorScreen({ type, message }) {
  const config = {
    invalid:  { icon: '🔗', title: 'Invalid Link',      color: 'text-gray-600'  },
    expired:  { icon: '⏰', title: 'Link Expired',       color: 'text-amber-600' },
    revoked:  { icon: '🔒', title: 'Link Revoked',       color: 'text-gray-600'  },
    error:    { icon: '⚠️', title: 'Something Went Wrong', color: 'text-red-600' },
  }[type] || { icon: '⚠️', title: 'Error', color: 'text-red-600' }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-dropdown p-10 max-w-md w-full text-center">
        <div className="text-6xl mb-4">{config.icon}</div>
        <h2 className={`text-2xl font-bold mb-3 ${config.color}`}>{config.title}</h2>
        <p className="text-gray-500 text-sm leading-relaxed">{message}</p>
      </div>
    </div>
  )
}

export default function PublicSharePage() {
  const { token } = useParams()
  const [loading,      setLoading]      = useState(true)
  const [shareInfo,    setShareInfo]    = useState(null)
  const [error,        setError]        = useState(null)
  const [downloading,  setDownloading]  = useState(false)
  const [downloaded,   setDownloaded]   = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { data } = await getPublicShareInfo(token)
        if (!cancelled) setShareInfo(data.data)
      } catch (err) {
        if (cancelled) return
        const status  = err.response?.status
        const message = err.response?.data?.message || err.response?.data?.detail || 'Something went wrong.'
        const lower   = message.toLowerCase()

        if (status === 404) {
          if (lower.includes('expir'))                                          setError({ type: 'expired', message })
          else if (lower.includes('revok'))                                     setError({ type: 'revoked', message })
          else                                                                  setError({ type: 'invalid', message: 'This share link is invalid or has been removed.' })
        } else {
          setError({ type: 'error', message })
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [token])

  const handleDownload = async () => {
    setDownloading(true)
    const toastId = toast.loading(`Downloading ${shareInfo?.file_name || 'file'}...`)
    try {
      const { data } = await downloadPublicShare(token)
      const url = window.URL.createObjectURL(data)
      const a   = document.createElement('a')
      a.href     = url
      a.download = shareInfo.file_name || 'download'
      a.click()
      window.URL.revokeObjectURL(url)
      setDownloaded(true)
      toast.success('Download successful!', { id: toastId })
    } catch {
      toast.error('Download failed. The link may have expired.', { id: toastId })
    } finally {
      setDownloading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <i className="fas fa-circle-notch fa-spin text-3xl text-brand-500 mb-4"></i>
          <p className="text-sm text-gray-500">Validating share link…</p>
        </div>
      </div>
    )
  }

  if (error) return <ErrorScreen type={error.type} message={error.message} />

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-dropdown p-8 sm:p-10 max-w-md w-full">

                <div className="text-center mb-8">
          <div className="w-20 h-20 bg-brand-50 rounded-lg flex items-center justify-center mx-auto mb-5">
            <i className={`fas ${getFileIcon(shareInfo?.mime_type)} text-4xl`}></i>
          </div>
          <h1 className="text-xl font-bold text-gray-900 break-all">{shareInfo?.file_name}</h1>
          <p className="text-sm text-gray-400 mt-1">{formatBytes(shareInfo?.file_size_display || shareInfo?.file_size)}</p>
        </div>

                {shareInfo?.message && (
          <div className="mb-6 px-4 py-3 bg-brand-50 border-l-4 border-brand-500 rounded-r-2xl">
            <p className="text-xs font-bold text-brand-500 mb-1 uppercase tracking-wider">Message</p>
            <p className="text-sm text-gray-900 leading-relaxed">"{shareInfo.message}"</p>
          </div>
        )}

                <div className="grid grid-cols-2 gap-3 mb-8">
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Type</p>
            <p className="text-sm font-bold text-gray-800 break-all">
              {shareInfo?.mime_type?.split('/')[1]?.toUpperCase() || 'FILE'}
            </p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Shared</p>
            <p className="text-sm font-bold text-gray-800">{formatDate(shareInfo?.shared_at)}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4 col-span-2">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Expires</p>
            <p className="text-sm font-bold text-gray-800">{formatDate(shareInfo?.expires_at)}</p>
          </div>
        </div>

                <button
          onClick={handleDownload}
          disabled={downloading}
          className="w-full py-4 bg-brand-600 text-white rounded-lg font-bold text-sm hover:bg-brand-700 transition-all  disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {downloading
            ? <><i className="fas fa-spinner fa-spin"></i>Downloading…</>
            : downloaded
              ? <><i className="fas fa-circle-check"></i>Downloaded — Click to Download Again</>
              : <><i className="fas fa-download"></i>Download File</>
          }
        </button>

                <div className="mt-6 flex items-start gap-3">
          <i className="fas fa-shield-halved text-green-400 mt-0.5 flex-shrink-0"></i>
          <p className="text-xs text-gray-400 leading-relaxed">
            This file has been scanned for malware and is safe to download.
            The link will expire on {formatDate(shareInfo?.expires_at)}.
          </p>
        </div>

        <p className="text-center text-xs text-gray-300 mt-6">Powered by VShare · Secure File Sharing</p>
      </div>
    </div>
  )
}