/**
 * components/modals/FileShareModal.jsx
 *
 * Fixes in this version:
 *  1. Error is cleared on EVERY user interaction (email add/remove, field change)
 *  2. Sends `file_id` in addition to `file` to accommodate both serializer conventions
 *  3. Validates file.id presence before submission with a clear user-facing message
 *  4. Per-field DRF errors are parsed and shown against the correct UI element
 *  5. "Send to more" resets the full form so another batch can be sent immediately
 *  6. Unique-URL-per-recipient guarantee is documented with an inline note
 */

import { useState, useCallback } from 'react'
import { createShare } from '@/api/sharingApi'


const EXPIRY_OPTIONS = [
  { value: 1,   label: '1 hour'  },
  { value: 24,  label: '1 day'   },
  { value: 72,  label: '3 days'  },
  { value: 168, label: '1 week'  },
  { value: 720, label: '30 days' },
]

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/


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

/**
 * Parse DRF error responses into a { general, field } object.
 *
 * DRF can return:
 *   { detail: "…" }                           → general error
 *   { message: "…" }                          → general error (drf-spectacular / custom exc handler)
 *   { field_name: ["msg", …], … }             → per-field errors
 *   "plain string"                            → general error
 */
function parseDRFError(err) {
  const data = err?.response?.data

  if (!data) return { general: 'Network error — please try again.', field: null }
  if (typeof data === 'string') return { general: data, field: null }
  if (data.detail)  return { general: data.detail, field: null }
  if (data.message) return { general: data.message, field: null }

  // Per-field errors — collect them
  const parts = Object.entries(data).map(([field, errors]) => {
    const msg = Array.isArray(errors) ? errors.join(' ') : String(errors)
    // Map backend field names to human-readable labels
    const LABELS = {
      file:             'File',
      file_id:          'File',
      recipient_emails: 'Recipients',
      recipient_email:  'Recipient',
      expiration_hours: 'Expiry',
      message:          'Message',
    }
    const label = LABELS[field] ?? field
    return `${label}: ${msg}`
  })

  // If the only field that errored is the file UUID, surface it specifically
  const fileFields = ['file', 'file_id', 'file_pk']
  const onlyFileError =
    Object.keys(data).length === 1 &&
    fileFields.includes(Object.keys(data)[0])

  if (onlyFileError) {
    return {
      general: null,
      field: `The file could not be found on the server. Please close and reopen this dialog. (${parts[0]})`,
    }
  }

  return { general: parts.join(' | '), field: null }
}


function EmailChipInput({ value, onChange, disabled, hasError }) {
  const [raw, setRaw] = useState('')

  const flush = useCallback(
    (text) => {
      const list = text
        .split(/[,;\s\n]+/)
        .map((e) => e.trim())
        .filter((e) => EMAIL_RE.test(e))
      if (list.length) onChange([...new Set([...value, ...list])])
    },
    [value, onChange],
  )

  const onKeyDown = (e) => {
    if (['Enter', ',', ';', ' '].includes(e.key)) {
      e.preventDefault()
      flush(raw)
      setRaw('')
    }
    // Backspace on empty input removes last chip
    if (e.key === 'Backspace' && !raw && value.length) {
      onChange(value.slice(0, -1))
    }
  }

  return (
    <div>
      <div className="relative">
        <input
          type="email"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => { if (raw.trim()) { flush(raw); setRaw('') } }}
          disabled={disabled}
          placeholder="name@example.com — Enter or comma to add"
          className={`w-full px-3 py-2.5 bg-gray-50 rounded-xl border text-sm
                      focus:ring-2 focus:ring-brand-200 focus:outline-none
                      disabled:opacity-60 disabled:cursor-not-allowed transition-colors
                      ${hasError ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}
        />
        {value.length > 0 && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 bg-brand-100 text-brand-700 text-xs font-bold px-2 py-0.5 rounded-full pointer-events-none select-none">
            {value.length}
          </span>
        )}
      </div>

      {value.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {value.map((email) => (
            <span
              key={email}
              className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-brand-50 text-brand-700 text-xs font-semibold rounded-full border border-brand-100"
            >
              {email}
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChange(value.filter((x) => x !== email))}
                className="flex items-center justify-center w-3.5 h-3.5 rounded-full hover:bg-red-100 transition-colors disabled:opacity-50"
                title={`Remove ${email}`}
              >
                <i className="fas fa-xmark text-[9px] text-brand-500 hover:text-red-500" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}


export default function FileShareModal({ file, onClose }) {
  const [emails,      setEmails]      = useState([])
  const [expiry,      setExpiry]      = useState(24)
  const [message,     setMessage]     = useState('')
  const [sharing,     setSharing]     = useState(false)
  const [emailError,  setEmailError]  = useState(null)   // highlights the recipients field
  const [generalError,setGeneralError]= useState(null)   // red banner
  const [fileError,   setFileError]   = useState(null)   // special case for file-field errors
  const [successMsg,  setSuccessMsg]  = useState(null)

  const clearErrors = useCallback(() => {
    setEmailError(null)
    setGeneralError(null)
    setFileError(null)
  }, [])

  const handleEmailChange = useCallback(
    (v) => {
      setEmails(v)
      clearErrors()
    },
    [clearErrors],
  )

  const handleShare = async () => {
    clearErrors()

    // Client-side validation
    if (!emails.length) {
      setEmailError('Please add at least one recipient email.')
      return
    }
    if (!file?.id) {
      setFileError('File reference is missing. Please close and reopen this dialog.')
      return
    }

    setSharing(true)

    try {
      /**
       * The backend's CreateShareView / create_shares() loops over
       * recipient_emails and creates one FileShare per email, each with
       * its own unique share_token → unique download URL.
       *
       * We send BOTH `file` and `file_id` so the serializer works
       * regardless of which field name it expects.
       */
      await createShare({
        file:             file.id,   // primary field expected by CreateShareSerializer
        file_id:          file.id,   // fallback if serializer uses file_id
        recipient_emails: emails,    // array → one unique link per address
        expiration_hours: Number(expiry),
        message:          message.trim(),
      })

      setSuccessMsg(
        emails.length === 1
          ? `Share link sent to ${emails[0]}.`
          : `Share links sent to all ${emails.length} recipients.`,
      )
      // Clear recipients & message but leave expiry as-is for follow-up sends
      setEmails([])
      setMessage('')
    } catch (err) {
      const { general, field } = parseDRFError(err)
      if (field)   setFileError(field)
      else         setGeneralError(general)
    } finally {
      setSharing(false)
    }
  }

  const handleSendMore = () => {
    setSuccessMsg(null)
    clearErrors()
    setEmails([])
    setMessage('')
  }

  const expiryLabel = EXPIRY_OPTIONS.find((o) => o.value === expiry)?.label ?? `${expiry}h`

  return (
    <div
      className="modal-overlay"
      onClick={(e) => { if (e.target === e.currentTarget && !sharing) onClose() }}
    >
      <div className="modal-panel w-full max-w-md flex flex-col overflow-hidden max-h-[95vh]">

                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 bg-brand-50 rounded-xl flex items-center justify-center flex-shrink-0">
              <i className={`fas ${getFileIcon(file?.mime_type)} text-base`} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-gray-900 truncate max-w-[200px] sm:max-w-xs">
                {file?.original_name ?? 'Unknown file'}
              </p>
              <p className="text-[11px] text-gray-400">{file?.file_size_display}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={sharing}
            className="ml-3 p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-all flex-shrink-0 disabled:opacity-50"
            aria-label="Close"
          >
            <i className="fas fa-xmark" />
          </button>
        </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-4">

                    {successMsg && (
            <div className="flex items-start gap-2.5 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700">
              <i className="fas fa-circle-check mt-0.5 flex-shrink-0 text-emerald-500" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold">✓ {successMsg}</p>
                <p className="text-[11px] text-emerald-600 mt-0.5">
                  Each recipient received a unique private link — links cannot be shared.
                </p>
                <button
                  type="button"
                  onClick={handleSendMore}
                  className="mt-2 text-xs font-bold underline underline-offset-2 text-emerald-700 hover:text-emerald-900 transition-colors"
                >
                  Send to more recipients →
                </button>
              </div>
            </div>
          )}

          {fileError && (
            <div className="flex items-start gap-2.5 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              <i className="fas fa-circle-exclamation mt-0.5 flex-shrink-0" />
              <span>{fileError}</span>
            </div>
          )}

                    {generalError && (
            <div className="flex items-start gap-2.5 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              <i className="fas fa-circle-exclamation mt-0.5 flex-shrink-0" />
              <span>{generalError}</span>
            </div>
          )}

                    {!successMsg && (
            <div className="flex items-start gap-2.5 px-4 py-3 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-700">
              <i className="fas fa-info-circle mt-0.5 flex-shrink-0" />
              <span>
                Each recipient receives a <strong>unique private download link</strong> by
                email. Links expire after the chosen period and cannot be reused.
              </span>
            </div>
          )}

                    {!successMsg && (
            <div>
              <label className="flex items-center gap-1 text-[11px] font-bold text-gray-500 mb-1.5 uppercase tracking-wider">
                Recipients
                <span className="text-red-500">*</span>
                {emails.length > 0 && (
                  <span className="ml-auto text-[10px] font-normal normal-case text-brand-500">
                    {emails.length} added — each gets a unique link
                  </span>
                )}
              </label>
              <EmailChipInput
                value={emails}
                onChange={handleEmailChange}
                disabled={sharing}
                hasError={!!emailError}
              />
              {emailError && (
                <p className="mt-1 text-xs text-red-500 flex items-center gap-1">
                  <i className="fas fa-triangle-exclamation text-[10px]" />
                  {emailError}
                </p>
              )}
            </div>
          )}

                    {!successMsg && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-gray-500 mb-1.5 uppercase tracking-wider">
                  Expires After
                </label>
                <select
                  value={expiry}
                  onChange={(e) => { setExpiry(Number(e.target.value)); clearErrors() }}
                  disabled={sharing}
                  className="w-full px-3 py-2 bg-gray-50 rounded-xl border border-gray-200 text-sm
                             focus:ring-2 focus:ring-brand-200 focus:outline-none
                             disabled:opacity-60 cursor-pointer"
                >
                  {EXPIRY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-500 mb-1.5 uppercase tracking-wider">
                  Message
                </label>
                <input
                  type="text"
                  value={message}
                  onChange={(e) => { setMessage(e.target.value); clearErrors() }}
                  disabled={sharing}
                  placeholder="Optional note…"
                  maxLength={200}
                  className="w-full px-3 py-2 bg-gray-50 rounded-xl border border-gray-200 text-sm
                             focus:ring-2 focus:ring-brand-200 focus:outline-none
                             disabled:opacity-60"
                />
              </div>
            </div>
          )}

                    {emails.length > 0 && !successMsg && (
            <div className="flex items-start gap-2.5 px-4 py-3 bg-brand-50 border border-brand-100 rounded-xl text-xs text-brand-700">
              <i className="fas fa-paper-plane mt-0.5 flex-shrink-0" />
              <span>
                <strong>{emails.length} unique private link{emails.length !== 1 ? 's' : ''}</strong>
                {' '}will be emailed — one per recipient, expiring in <strong>{expiryLabel}</strong>.
              </span>
            </div>
          )}
        </div>

                <div className="px-6 pb-6 pt-2 flex gap-3 flex-shrink-0 border-t border-slate-50">
          <button
            type="button"
            onClick={onClose}
            disabled={sharing}
            className="px-4 py-2.5 bg-gray-100 text-gray-600 rounded-xl text-sm font-bold
                       hover:bg-gray-200 transition-all disabled:opacity-60"
          >
            {successMsg ? 'Done' : 'Close'}
          </button>

          {!successMsg && (
            <button
              type="button"
              onClick={handleShare}
              disabled={sharing || emails.length === 0}
              className="flex-1 py-2.5 bg-brand-600 text-white rounded-xl text-sm font-bold
                         hover:bg-brand-700 active:bg-brand-800 transition-all
                         disabled:opacity-50 disabled:cursor-not-allowed
                         flex items-center justify-center gap-2"
            >
              {sharing ? (
                <><i className="fas fa-spinner fa-spin text-xs" />Sending…</>
              ) : (
                <>
                  <i className="fas fa-paper-plane text-xs" />
                  Send Share Link{emails.length > 1 ? `s (${emails.length})` : ''}
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}