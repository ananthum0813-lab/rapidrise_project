/**
 * SetExpiryModal.jsx
 *
 * Modal for setting / clearing auto-delete expiry on a single file.
 * Shows current expiry status and lets the user pick a new one.
 *
 * Props:
 *   file      — file object (needs id, original_name, expires_at)
 *   onClose   — () => void
 *   onUpdated — (updatedFile) => void   called after a successful save
 */

import { useState } from 'react'
import { setFileExpiry } from '@/api/filesApi'


export const EXPIRY_OPTIONS = [
  { value: 'never',   label: 'Never',   sublabel: 'File is permanent' },
  { value: '1_minute', label: '1 Minute', sublabel: 'Deletes in 60 seconds' },  
  { value: '1_hour',  label: '1 Hour',  sublabel: 'Deletes in 60 minutes' },
  { value: '1_day',   label: '1 Day',   sublabel: 'Deletes in 24 hours' },
  { value: '7_days',  label: '7 Days',  sublabel: 'Deletes in one week' },
  { value: '30_days', label: '30 Days', sublabel: 'Deletes in one month' },
]


export function getExpiryInfo(expiresAt) {
  if (!expiresAt) return null
  const now    = Date.now()
  const exp    = new Date(expiresAt).getTime()
  const diffMs = exp - now
  if (diffMs <= 0) return { label: 'Expired', variant: 'expired' }
  const h = diffMs / 3_600_000
  const d = h / 24
  if (h < 1)  return { label: 'Expires < 1h',              variant: 'critical' }
  if (h < 24) return { label: `Expires in ${Math.ceil(h)}h`, variant: 'critical' }
  if (d < 2)  return { label: 'Expires tomorrow',            variant: 'warning' }
  if (d < 7)  return { label: `Expires in ${Math.floor(d)}d`, variant: 'warning' }
  return             { label: `Expires in ${Math.floor(d)}d`, variant: 'normal' }
}

const variantClasses = {
  expired:  'text-red-500',
  critical: 'text-orange-500',
  warning:  'text-amber-500',
  normal:   'text-gray-400',
}

const variantBg = {
  expired:  'bg-red-50 border-red-100 text-red-700',
  critical: 'bg-orange-50 border-orange-100 text-orange-700',
  warning:  'bg-amber-50 border-amber-100 text-amber-700',
  normal:   'bg-gray-50 border-gray-200 text-gray-600',
}

function getFileIcon(mime) {
  if (!mime) return 'fa-file text-gray-400'
  if (mime.includes('pdf'))    return 'fa-file-pdf text-red-400'
  if (mime.includes('image'))  return 'fa-image text-blue-400'
  if (mime.includes('video'))  return 'fa-video text-purple-400'
  if (mime.includes('word') || mime.includes('document')) return 'fa-file-word text-blue-600'
  if (mime.includes('sheet') || mime.includes('spreadsheet')) return 'fa-file-excel text-green-500'
  if (mime.includes('zip') || mime.includes('archive')) return 'fa-file-zipper text-orange-400'
  if (mime.includes('audio')) return 'fa-file-audio text-pink-400'
  if (mime.includes('text'))  return 'fa-file-lines text-gray-400'
  return 'fa-file text-gray-400'
}


export default function SetExpiryModal({ file, onClose, onUpdated }) {
  // Pre-select 'never'
  const [selected, setSelected] = useState(() => {
  if (!file.expires_at) return 'never'
  const diffMs = new Date(file.expires_at).getTime() - Date.now()
  if (diffMs <= 0) return 'never'
  const diffMin = diffMs / 60_000
  if (diffMin <= 2)  return '1_minute'
  const diffH = diffMin / 60
  if (diffH <= 2)    return '1_hour'
  const diffD = diffH / 24
  if (diffD <= 2)    return '1_day'
  if (diffD <= 10)   return '7_days'
  return '30_days'
})
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState(null)
  const [success,  setSuccess]  = useState(false)

  const expiryInfo    = getExpiryInfo(file.expires_at)
  const hasExpiry     = !!file.expires_at
  const expiresAtDate = hasExpiry ? new Date(file.expires_at) : null

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const { data } = await setFileExpiry(file.id, selected)
      setSuccess(true)
      setTimeout(() => {
        onUpdated?.(data?.data ?? null)
        onClose()
      }, 800)
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to update expiry.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-panel w-full max-w-sm flex flex-col" style={{ maxHeight: '90vh' }}>

                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-brand-50 flex items-center justify-center flex-shrink-0">
              <i className={`fas ${getFileIcon(file.mime_type)} text-sm`} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-gray-900 truncate max-w-[200px]">{file.original_name}</p>
              <p className="text-[11px] text-gray-400">{file.file_size_display}</p>
            </div>
          </div>
          <button onClick={onClose} className="ml-2 flex-shrink-0 p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-all">
            <i className="fas fa-xmark" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">

                    {success && (
            <div className="flex items-center gap-2 px-3 py-2.5 bg-emerald-50 border border-emerald-100 rounded-xl text-sm text-emerald-700">
              <i className="fas fa-circle-check flex-shrink-0" />
              <span>Expiry updated!</span>
            </div>
          )}

                    {error && !success && (
            <div className="flex items-center gap-2 px-3 py-2.5 bg-red-50 border border-red-100 rounded-xl text-sm text-red-700">
              <i className="fas fa-circle-exclamation flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

                    {hasExpiry && !success && (
            <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold border ${variantBg[expiryInfo?.variant ?? 'normal']}`}>
              <i className="fas fa-clock flex-shrink-0" />
              <span>
                {expiryInfo?.variant === 'expired'
                  ? 'This file has already expired.'
                  : `Auto-deletes on ${expiresAtDate?.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`}
              </span>
              
            </div>
          )}

                    <div>
            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">
              {hasExpiry ? 'Change expiry' : 'Set auto-delete'}
            </p>
            <div className="space-y-1.5">
              {EXPIRY_OPTIONS.map(({ value, label, sublabel }) => {
                const active = selected === value
                return (
                  <label
                    key={value}
                    className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl border cursor-pointer transition-all select-none ${
                      active
                        ? 'bg-brand-50 border-brand-200'
                        : 'bg-gray-50 border-gray-200 hover:border-brand-200 hover:bg-brand-50/40'
                    }`}
                  >
                    <input
                      type="radio"
                      name="expiry_option"
                      value={value}
                      checked={active}
                      onChange={() => setSelected(value)}
                      className="accent-brand-600 w-4 h-4 flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-bold ${active ? 'text-brand-700' : 'text-gray-700'}`}>{label}</p>
                      <p className="text-[10px] text-gray-400">{sublabel}</p>
                    </div>
                    {value === 'never' && (
                      <span className="text-[10px] bg-slate-200 text-gray-500 font-bold px-1.5 py-0.5 rounded-full flex-shrink-0">
                        Default
                      </span>
                    )}
                  </label>
                )
              })}
            </div>
          </div>

          {selected !== 'never' && (
            <div className="flex items-start gap-2.5 px-3 py-2.5 bg-amber-50 border border-amber-100 rounded-xl text-xs text-amber-700">
              <i className="fas fa-triangle-exclamation mt-0.5 flex-shrink-0" />
              <span>
                The file will be <strong>moved to trash</strong> automatically after{' '}
                {EXPIRY_OPTIONS.find((o) => o.value === selected)?.label.toLowerCase()}.
                You can still restore it from trash within 30 days.
              </span>
            </div>
          )}
        </div>

                <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2.5 bg-gray-100 text-gray-600 rounded-xl text-sm font-bold hover:bg-gray-200 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || success}
            className="flex-1 py-2.5 bg-brand-600 text-white rounded-xl text-sm font-bold hover:bg-brand-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {success ? (
              <><i className="fas fa-check text-xs" />Saved!</>
            ) : saving ? (
              <><i className="fas fa-spinner fa-spin text-xs" />Saving…</>
            ) : (
              <><i className="fas fa-clock text-xs" />Save Expiry</>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

export { variantClasses }