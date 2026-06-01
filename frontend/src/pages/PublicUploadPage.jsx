/**
 * PublicUploadPage.jsx
 *
 * Route: /request/upload/:token
 *
 * Public page — no auth required.
 *
 * Flow:
 *  1. Fetch request info via per-recipient token.
 *  2. Automatically trigger OTP send to recipient email.
 *  3. Show OTP verification screen.
 *  4. After verified, show upload UI.
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import {
  getRecipientUploadInfo,
  submitRecipientUpload,
  getRecipientUploadStatuses,
  sendRecipientOTP,
  verifyRecipientOTP,
  resendRecipientOTP,
} from '@/api/sharingApi'



const fmtBytes = (b) => {
  if (!b) return '0 B'
  const k = 1024, sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(b) / Math.log(k))
  return `${parseFloat((b / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}
const fmtDate = (d) =>
  d ? new Date(d).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—'

const TERMINAL_STATUSES = new Set(['safe', 'infected', 'scan_failed'])


const ScanBadge = ({ status }) => {
  const cfg = {
    scanning:    { cls: 'bg-blue-50 text-blue-600 border-blue-200',          icon: 'fa-spinner fa-spin',      text: 'Scanning…'           },
    pending:     { cls: 'bg-gray-50 text-gray-500 border-gray-200',       icon: 'fa-clock',                text: 'Scan pending'        },
    safe:        { cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: 'fa-shield-halved',        text: 'No threats detected' },
    infected:    { cls: 'bg-red-50 text-red-700 border-red-200',             icon: 'fa-bug',                  text: 'Threat detected'     },
    scan_failed: { cls: 'bg-orange-50 text-orange-600 border-orange-200',    icon: 'fa-triangle-exclamation', text: 'Scan failed'         },
  }
  const c = cfg[status] || cfg.pending
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${c.cls}`}>
      <i className={`fas ${c.icon} text-[10px]`}></i>{c.text}
    </span>
  )
}


function FileRow({ file, onRemove }) {
  const ext     = file.name.split('.').pop().toLowerCase()
  const iconMap = {
    pdf: 'fa-file-pdf text-red-500', doc: 'fa-file-word text-blue-500', docx: 'fa-file-word text-blue-500',
    xls: 'fa-file-excel text-green-500', xlsx: 'fa-file-excel text-green-500',
    png: 'fa-file-image text-purple-500', jpg: 'fa-file-image text-purple-500',
    jpeg: 'fa-file-image text-purple-500', gif: 'fa-file-image text-purple-500',
    zip: 'fa-file-zipper text-amber-500', mp4: 'fa-file-video text-brand-500',
    txt: 'fa-file-lines text-gray-500', csv: 'fa-file-csv text-green-600',
  }
  const icon = iconMap[ext] || 'fa-file text-gray-400'
  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-xl group">
      <i className={`fas ${icon} text-lg flex-shrink-0`}></i>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-800 truncate">{file.name}</p>
        <p className="text-xs text-gray-400">{fmtBytes(file.size)}</p>
      </div>
      {onRemove && (
        <button onClick={onRemove} className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-red-500 p-1 rounded-lg hover:bg-red-50">
          <i className="fas fa-xmark text-sm"></i>
        </button>
      )}
    </div>
  )
}


function UploadedRow({ result }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 bg-white border border-gray-100 rounded-xl">
      <div className="flex items-center gap-3 min-w-0">
        <i className="fas fa-file-circle-check text-emerald-500 text-lg flex-shrink-0"></i>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-800 truncate">{result.filename}</p>
          <p className="text-xs text-gray-400">{fmtBytes(result.size)}</p>
        </div>
      </div>
      <ScanBadge status={result.scan_status || 'scanning'} />
    </div>
  )
}


function OtpInput({ value, onChange, disabled }) {
  const digits    = 6
  const inputRefs = useRef([])

  const chars = value.split('').concat(Array(digits).fill('')).slice(0, digits)

  const handleKey = (i, e) => {
    if (e.key === 'Backspace') {
      e.preventDefault()
      const next = [...chars]
      if (next[i]) {
        next[i] = ''
        onChange(next.join(''))
      } else if (i > 0) {
        next[i - 1] = ''
        onChange(next.join(''))
        inputRefs.current[i - 1]?.focus()
      }
      return
    }
    if (e.key === 'ArrowLeft' && i > 0) { inputRefs.current[i - 1]?.focus(); return }
    if (e.key === 'ArrowRight' && i < digits - 1) { inputRefs.current[i + 1]?.focus(); return }
    if (/^\d$/.test(e.key)) {
      e.preventDefault()
      const next = [...chars]
      next[i] = e.key
      onChange(next.join(''))
      if (i < digits - 1) inputRefs.current[i + 1]?.focus()
    }
  }

  const handlePaste = (e) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, digits)
    onChange(pasted.padEnd(0, ''))
    const focusIdx = Math.min(pasted.length, digits - 1)
    inputRefs.current[focusIdx]?.focus()
  }

  return (
    <div className="flex gap-2 justify-center" onPaste={handlePaste}>
      {chars.map((ch, i) => (
        <input
          key={i}
          ref={(el) => (inputRefs.current[i] = el)}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={ch}
          disabled={disabled}
          onChange={() => {}}
          onKeyDown={(e) => handleKey(i, e)}
          onFocus={(e) => e.target.select()}
          className={`w-11 h-13 text-center text-xl font-bold rounded-xl border transition-all focus:outline-none
            ${ch ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200 bg-gray-50 text-gray-700'}
            ${disabled ? 'opacity-50 cursor-not-allowed' : 'focus:border-brand-500 focus:ring-2 focus:ring-brand-100'}
          `}
          style={{ height: '3.25rem' }}
        />
      ))}
    </div>
  )
}


/**
 * OtpVerificationCard
 *
 * Props
 * ─────
 * recipientEmail     — shown to the user so they know where the code was sent
 * onVerified(token)  — called with the signed session_token on success;
 *                      the parent stores it and attaches it to every upload
 * token              — the upload URL token (used for API calls)
 * initialWaitSeconds — cooldown already in progress when the page loads
 */
function OtpVerificationCard({ recipientEmail, onVerified, token, initialWaitSeconds = 0 }) {
  const [otp,            setOtp]           = useState('')
  const [verifying,      setVerifying]     = useState(false)
  const [otpError,       setOtpError]      = useState('')
  const [cooldown,       setCooldown]      = useState(initialWaitSeconds)
  const [resendLoading,  setResendLoading] = useState(false)
  const [resendMsg,      setResendMsg]     = useState('')
  const cooldownRef = useRef(null)

  const startCooldown = useCallback((seconds) => {
    setCooldown(seconds)
    if (cooldownRef.current) clearInterval(cooldownRef.current)
    cooldownRef.current = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) { clearInterval(cooldownRef.current); return 0 }
        return prev - 1
      })
    }, 1000)
  }, [])

  useEffect(() => {
    if (initialWaitSeconds > 0) startCooldown(initialWaitSeconds)
    return () => { if (cooldownRef.current) clearInterval(cooldownRef.current) }
  }, []) // eslint-disable-line

  const handleVerify = async () => {
    if (otp.length < 6 || verifying) return
    setVerifying(true)
    setOtpError('')
    try {
      const { data } = await verifyRecipientOTP(token, otp)
      const payload  = data.data || data

      // The server issues a signed session_token on successful OTP verification.
      // We pass it up to the parent (PublicUploadPage) which stores it in state
      // and attaches it as X-Upload-Session on every upload request.
      // Without this token the upload endpoint rejects the request — even if
      // the DB still shows otp_verified=True from a different browser's session.
      const sessionToken = payload.session_token || ''
      if (!sessionToken) {
        // Defensive: if the server somehow omitted the token, treat as failure.
        setOtpError('Verification failed. Please try again.')
        setOtp('')
        return
      }

      onVerified(sessionToken)
    } catch (err) {
      const msg =
        err.response?.data?.otp?.[0] ||
        err.response?.data?.detail ||
        err.response?.data?.message ||
        'Invalid or expired OTP.'
      setOtpError(msg)
      setOtp('')
    } finally {
      setVerifying(false)
    }
  }

  const handleResend = async () => {
    if (cooldown > 0 || resendLoading) return
    setResendLoading(true)
    setResendMsg('')
    setOtpError('')
    try {
      const { data } = await resendRecipientOTP(token)
      const payload  = data.data || data
      const wait     = payload.wait_seconds || 60
      startCooldown(wait)
      setResendMsg('A new code has been sent to your email.')
      setOtp('')
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        err.response?.data?.detail ||
        'Could not resend code. Please try again.'
      setOtpError(msg)
    } finally {
      setResendLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-brand-100 overflow-hidden">
            <div className="px-6 pt-6 pb-4 border-b border-gray-100 text-center">
        <div className="w-14 h-14 bg-brand-50 rounded-lg flex items-center justify-center mx-auto mb-3">
          <i className="fas fa-shield-halved text-2xl text-brand-500"></i>
        </div>
        <p className="text-sm text-gray-500 mt-1 leading-relaxed">
          A 6-digit code was sent to{' '}
          <span className="font-semibold text-gray-700">{recipientEmail}</span>.
          <br />Enter it below to access the upload form.
        </p>
      </div>

            <div className="p-6 space-y-5">

        <OtpInput value={otp} onChange={setOtp} disabled={verifying} />

        {otpError && (
          <div className="flex items-start gap-2 px-4 py-3 bg-red-50 rounded-xl border border-red-100 text-xs text-red-700">
            <i className="fas fa-circle-exclamation mt-0.5 flex-shrink-0"></i>
            <span>{otpError}</span>
          </div>
        )}

        {resendMsg && (
          <div className="flex items-start gap-2 px-4 py-3 bg-emerald-50 rounded-xl border border-emerald-100 text-xs text-emerald-700">
            <i className="fas fa-check-circle mt-0.5 flex-shrink-0"></i>
            <span>{resendMsg}</span>
          </div>
        )}

        <button
          onClick={handleVerify}
          disabled={otp.length < 6 || verifying}
          className="w-full py-3.5 bg-brand-600 text-white rounded-xl font-bold text-sm hover:bg-brand-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm"
        >
          {verifying
            ? <><i className="fas fa-spinner fa-spin text-sm"></i>Verifying…</>
            : <><i className="fas fa-unlock text-sm"></i>Verify &amp; Continue</>}
        </button>

        <div className="flex items-center justify-center gap-2 text-sm">
          <span className="text-gray-400">Didn't receive it?</span>
          {cooldown > 0 ? (
            <span className="text-gray-400 font-medium tabular-nums">
              Resend in <span className="text-brand-500">{cooldown}s</span>
            </span>
          ) : (
            <button
              onClick={handleResend}
              disabled={resendLoading}
              className="text-brand-600 font-semibold hover:text-brand-700 disabled:opacity-50 flex items-center gap-1"
            >
              {resendLoading && <i className="fas fa-spinner fa-spin text-xs"></i>}
              Resend code
            </button>
          )}
        </div>

        <p className="text-center text-[11px] text-gray-400 flex items-center justify-center gap-1.5">
          <i className="fas fa-lock text-slate-300"></i>
          Do not share this code. FileVault staff will never ask for it.
        </p>
      </div>
    </div>
  )
}


export default function PublicUploadPage() {
  const { token } = useParams()

  const [info,    setInfo]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [infoErr, setInfoErr] = useState('')

  const [otpPhase,       setOtpPhase]       = useState('sending')
  const [otpInitialWait, setOtpInitialWait] = useState(0)   // cooldown when page loads

  // Signed session token issued by the server on successful OTP verification.
  // Stored in React state (tab-scoped) — intentionally NOT in localStorage.
  // Appended as the `session_token` FormData field on every upload request.
  const [sessionToken, setSessionToken] = useState('')

  const [files,              setFiles]              = useState([])
  const [progress,           setProgress]           = useState(0)
  const [uploading,          setUploading]          = useState(false)
  const [uploadErr,          setUploadErr]          = useState('')
  const [uploaded,           setUploaded]           = useState([])
  const [done,               setDone]               = useState(false)
  const [sessionUploadCount, setSessionUploadCount] = useState(0)

  const [dragOver, setDragOver] = useState(false)
  const dropRef   = useRef(null)
  const pollRef   = useRef(null)


  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }, [])

  useEffect(() => () => stopPolling(), [stopPolling])

  const startPolling = useCallback((newBatchFiles) => {
    if (pollRef.current) return
    if (newBatchFiles.length > 0 && newBatchFiles.every((f) => TERMINAL_STATUSES.has(f.scan_status))) return
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await getRecipientUploadStatuses(token)
        const results  = (data.data || data).files || []
        if (!results.length) return
        setUploaded(results)
        if (results.every((f) => TERMINAL_STATUSES.has(f.scan_status))) stopPolling()
      } catch { /* transient — keep polling */ }
    }, 3000)
  }, [token, stopPolling])


  useEffect(() => {
    if (!token) return
    setLoading(true)
    getRecipientUploadInfo(token)
      .then(({ data }) => {
        setInfo(data.data || data)
        setLoading(false)
        triggerOtpSend()
      })
      .catch((err) => {
        setInfoErr(
          err.response?.data?.detail ||
          err.response?.data?.message ||
          'This upload link is invalid or has expired.',
        )
        setLoading(false)
      })
  }, [token]) // eslint-disable-line


  async function triggerOtpSend() {
    try {
      const { data } = await sendRecipientOTP(token)
      const payload  = data.data || data
      const wait     = payload.wait_seconds || 0
      setOtpInitialWait(wait)
      setOtpPhase('pending')
    } catch (err) {
      const status  = err.response?.status
      const payload = err.response?.data?.data || {}

      if (status === 429) {
        setOtpInitialWait(payload.wait_seconds || 60)
        setOtpPhase('pending')   // still show input — previous OTP may be valid
      } else {
        setOtpPhase('error')
      }
    }
  }


  /**
   * Called by OtpVerificationCard when the server confirms the OTP.
   * Receives the signed session_token and stores it in state.
   * All subsequent upload requests will append it as the session_token FormData field.
   */
  const handleOtpVerified = useCallback((token) => {
    setSessionToken(token)
    setOtpPhase('verified')
  }, [])


  const addFiles = useCallback((incoming) => {
    setUploadErr('')
    const arr = Array.from(incoming)
    const serverSlotsAtLoad = info
      ? (info.remaining_slots ?? (info.max_files - info.submission_count))
      : 10
    const remaining = Math.max(0, serverSlotsAtLoad - sessionUploadCount - files.length)
    const allowed   = arr.slice(0, remaining)
    const blocked   = arr.length - allowed.length
    setFiles((prev) => {
      const names = new Set(prev.map((f) => f.name + f.size))
      return [...prev, ...allowed.filter((f) => !names.has(f.name + f.size))]
    })
    if (blocked > 0) setUploadErr(`Only ${remaining} more file(s) can be added to this request.`)
  }, [files, sessionUploadCount, info])

  const removeFile  = (idx)  => setFiles((prev) => prev.filter((_, i) => i !== idx))
  const onDragOver  = (e)    => { e.preventDefault(); setDragOver(true) }
  const onDragLeave = ()     => setDragOver(false)
  const onDrop      = (e)    => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files) }


  const handleUpload = async () => {
    if (!files.length || uploading) return
    setUploading(true)
    setProgress(0)
    setUploadErr('')

    const fd = new FormData()
    files.forEach((f) => fd.append('files', f))
    if (info?.recipient_email) fd.append('submitter_email', info.recipient_email)

    try {
      // Send the signed session token as a form field (not a custom header)
      // so it passes through CORS without requiring a preflight whitelist.
      fd.append('session_token', sessionToken)

      const { data }  = await submitRecipientUpload(token, fd, {
        onUploadProgress: (e) => { if (e.total) setProgress(Math.round((e.loaded / e.total) * 100)) },
      })
      const payload   = data.data || data
      const newFiles  = payload.files || []
      const accepted  = newFiles.length

      setUploaded((prev) => [...prev, ...newFiles])
      setSessionUploadCount((prev) => prev + accepted)
      setFiles([])
      setDone(true)

      if (payload.errors?.length) {
        setUploadErr(`Some files were not accepted:\n${payload.errors.map((e) => `${e.file}: ${e.errors?.join(', ')}`).join('\n')}`)
      }

      stopPolling()
      startPolling(newFiles)
    } catch (err) {
      const msg =
        err.response?.data?.detail ||
        err.response?.data?.message ||
        err.response?.data?.files ||
        'Upload failed. Please try again.'

      // Session token expired (server returned OTP-gate rejection).
      // Clear the stored token and send the user back to re-verify.
      if (err.response?.status === 400 && (err.response?.data?.otp || String(msg).toLowerCase().includes('otp'))) {
        setSessionToken('')
        setOtpPhase('expired')
        setUploadErr('')
        return
      }

      setUploadErr(Array.isArray(msg) ? msg.join(' ') : String(msg))
    } finally {
      setUploading(false)
      setProgress(0)
    }
  }


  const allScansSettled = uploaded.length > 0 && uploaded.every((f) => TERMINAL_STATUSES.has(f.scan_status))
  const allSafe         = allScansSettled && uploaded.every((f) => f.scan_status === 'safe')


  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <i className="fas fa-spinner fa-spin text-3xl text-brand-500 mb-4 block"></i>
        <p className="text-gray-500 font-medium">Loading upload page…</p>
      </div>
    </div>
  )

  if (infoErr) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center border border-red-100">
        <div className="w-16 h-16 bg-red-50 rounded-lg flex items-center justify-center mx-auto mb-4">
          <i className="fas fa-link-slash text-2xl text-red-500"></i>
        </div>
        <h2 className="text-lg font-bold text-gray-900 mb-2">Link Unavailable</h2>
        <p className="text-sm text-gray-500">{infoErr}</p>
      </div>
    </div>
  )


  const serverSlotsAtLoad   = info.remaining_slots ?? (info.max_files - info.submission_count)
  const isExpired           = !!(info.expires_at && new Date(info.expires_at) < new Date())
  const effectiveSlotsLeft  = Math.max(0, serverSlotsAtLoad - sessionUploadCount)
  const isFull              = effectiveSlotsLeft <= 0
  const displayUploadCount  = (info.recipient_upload_count || 0) + sessionUploadCount
  const isBlocked           = isExpired || (serverSlotsAtLoad <= 0 && sessionUploadCount === 0)


  if (done && isFull) return (
    <div className="min-h-screen bg-gray-50 flex items-start justify-center p-4 pt-10 sm:pt-16">
      <div className="max-w-lg w-full space-y-4">
        <div className="bg-white rounded-lg shadow-sm border border-emerald-100 p-8 text-center">
          <div className="w-16 h-16 bg-emerald-50 rounded-lg flex items-center justify-center mx-auto mb-4">
            <i className="fas fa-circle-check text-3xl text-emerald-500"></i>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-1">All Files Sent Successfully!</h2>
          <p className="text-sm text-gray-500">
            This request is now complete — no upload slots remain.<br />
            <span className="text-gray-400">The requester will review your files shortly.</span>
          </p>
        </div>
        {uploaded.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
              <i className="fas fa-shield-halved text-brand-500 text-sm"></i>
              <span className="text-sm font-bold text-gray-800">Security Scan Status</span>
              <span className="ml-auto text-xs text-gray-400">{uploaded.length} file{uploaded.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="p-4 space-y-2">
              {uploaded.map((r, i) => <UploadedRow key={i} result={r} />)}
            </div>
            {allScansSettled && (
              <div className="mx-4 mb-4 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-sm text-emerald-700 font-medium">
                <i className="fas fa-shield-halved text-emerald-500"></i>
                All files passed the security scan.
              </div>
            )}
          </div>
        )}
        {uploadErr && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800 whitespace-pre-line">
            <i className="fas fa-triangle-exclamation mr-2"></i>{uploadErr}
          </div>
        )}
        <div className="rounded-lg p-4 border bg-amber-50 border-amber-200 text-amber-700 text-sm font-medium flex items-center gap-3">
          <i className="fas fa-lock text-amber-500 text-lg"></i>
          <span>This request has reached its file limit. No further uploads are accepted.</span>
        </div>
      </div>
    </div>
  )


  return (
    <div className="min-h-screen bg-gray-50 flex items-start justify-center p-4 pt-8 sm:pt-14">
      <div className="max-w-xl w-full space-y-4">

                <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
          <div className="flex items-start gap-4">
            <div className="w-11 h-11 bg-brand-50 rounded-xl flex items-center justify-center flex-shrink-0">
              <i className="fas fa-inbox text-brand-500 text-lg"></i>
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-bold text-gray-900 leading-tight">{info.title}</h1>
              {info.owner_name && (
                <p className="text-xs text-gray-400 mt-0.5">
                  Requested by <span className="font-semibold text-gray-600">{info.owner_name}</span>
                </p>
              )}
              {info.description && (
                <p className="text-sm text-gray-600 mt-2 leading-relaxed">{info.description}</p>
              )}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="bg-gray-50 rounded-xl px-3 py-2">
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Slots Left</p>
              <p className={`text-sm font-bold mt-0.5 ${isFull ? 'text-red-500' : 'text-gray-800'}`}>
                {isFull ? 'Full' : `${effectiveSlotsLeft} of ${info.max_files}`}
              </p>
            </div>
            <div className="bg-gray-50 rounded-xl px-3 py-2">
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Expires</p>
              <p className={`text-sm font-bold mt-0.5 ${isExpired ? 'text-red-500' : 'text-gray-800'}`}>
                {info.expires_at ? fmtDate(info.expires_at) : 'Never'}
              </p>
            </div>
            {info.allowed_extensions?.length > 0 && (
              <div className="bg-gray-50 rounded-xl px-3 py-2 col-span-2 sm:col-span-1">
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">Accepted Types</p>
                <div className="flex flex-wrap gap-1">
                  {info.allowed_extensions.map((e) => (
                    <span key={e} className="px-1.5 py-0.5 bg-white text-gray-600 text-[10px] font-semibold rounded border border-gray-200">.{e}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {info.required_files?.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Required Files</p>
              <div className="flex flex-wrap gap-1.5">
                {info.required_files.map((f) => (
                  <span key={f} className="px-2.5 py-1 bg-amber-50 text-amber-700 text-xs font-semibold rounded-full border border-amber-100">
                    <i className="fas fa-file-circle-check mr-1 text-[10px]"></i>{f}
                  </span>
                ))}
              </div>
            </div>
          )}

          {info.recipient_email && (
            <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-2 text-xs text-gray-400">
              <i className="fas fa-envelope text-[11px]"></i>
              Upload link for <span className="font-semibold text-gray-600">{info.recipient_email}</span>
              {displayUploadCount > 0 && (
                <span className="ml-auto text-emerald-600 font-semibold">
                  <i className="fas fa-check-circle mr-1"></i>{displayUploadCount} already uploaded
                </span>
              )}
            </div>
          )}
        </div>

                {otpPhase === 'sending' && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-8 text-center">
            <i className="fas fa-spinner fa-spin text-2xl text-brand-500 mb-3 block"></i>
            <p className="text-sm font-semibold text-gray-600">Sending verification code…</p>
            <p className="text-xs text-gray-400 mt-1">Please check {info.recipient_email}</p>
          </div>
        )}

                {otpPhase === 'error' && (
          <div className="bg-white rounded-lg shadow-sm border border-red-100 p-6 text-center">
            <i className="fas fa-envelope-circle-check text-3xl text-red-400 mb-3 block"></i>
            <p className="text-sm font-bold text-red-700 mb-2">Could not send verification email</p>
            <p className="text-xs text-gray-400 mb-4">There was a problem sending the OTP. Please try again.</p>
            <button
              onClick={triggerOtpSend}
              className="px-5 py-2.5 bg-brand-600 text-white rounded-xl text-sm font-bold hover:bg-brand-700 transition-all"
            >
              Retry
            </button>
          </div>
        )}

                {otpPhase === 'expired' && (
          <div className="bg-white rounded-lg shadow-sm border border-amber-100 p-6 text-center">
            <i className="fas fa-clock text-3xl text-amber-400 mb-3 block"></i>
            <p className="text-sm font-bold text-amber-700 mb-2">Verification session expired</p>
            <p className="text-xs text-gray-400 mb-4">Your upload session has ended. Please verify again to continue.</p>
            <button
              onClick={() => { setOtpPhase('sending'); triggerOtpSend() }}
              className="px-5 py-2.5 bg-brand-600 text-white rounded-xl text-sm font-bold hover:bg-brand-700 transition-all"
            >
              Verify again
            </button>
          </div>
        )}

                {otpPhase === 'pending' && (
          <OtpVerificationCard
            recipientEmail={info.recipient_email}
            onVerified={handleOtpVerified}
            token={token}
            initialWaitSeconds={otpInitialWait}
          />
        )}

                {otpPhase === 'verified' && done && uploaded.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
              <i className="fas fa-shield-halved text-brand-500 text-sm"></i>
              <span className="text-sm font-bold text-gray-800">Security Scan Status</span>
              <span className="ml-auto text-xs text-gray-400">{uploaded.length} file{uploaded.length !== 1 ? 's' : ''} uploaded</span>
            </div>
            <div className="p-4 space-y-2">
              {uploaded.map((r, i) => <UploadedRow key={i} result={r} />)}
            </div>
            <div className="px-4 pb-4">
              {!allScansSettled ? (
                <p className="text-xs text-gray-400 flex items-center gap-1.5">
                  <i className="fas fa-info-circle text-blue-400"></i>
                  Scanning typically completes within a few seconds…
                </p>
              ) : allSafe ? (
                <div className="px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-sm text-emerald-700 font-medium">
                  <i className="fas fa-shield-halved text-emerald-500"></i>
                  All files are safe!{effectiveSlotsLeft > 0 ? ' You can upload more files below.' : ''}
                </div>
              ) : (
                <div className="px-4 py-3 bg-orange-50 border border-orange-200 rounded-xl flex items-center gap-2 text-sm text-orange-700 font-medium">
                  <i className="fas fa-triangle-exclamation text-orange-500"></i>
                  One or more files had scan issues. Check statuses above.
                </div>
              )}
            </div>
          </div>
        )}

                {otpPhase === 'verified' && isBlocked && (
          <div className={`rounded-lg p-5 border text-sm font-medium flex items-center gap-3 ${
            isExpired ? 'bg-red-50 border-red-200 text-red-700' : 'bg-amber-50 border-amber-200 text-amber-700'
          }`}>
            <i className={`fas ${isExpired ? 'fa-clock text-red-500' : 'fa-lock text-amber-500'} text-lg`}></i>
            <span>{isExpired ? 'This upload link has expired.' : 'This request has reached its file limit.'}</span>
          </div>
        )}

                {otpPhase === 'verified' && !isBlocked && !isExpired && effectiveSlotsLeft > 0 && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 pt-5 pb-4 border-b border-gray-100">
              <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <i className="fas fa-cloud-arrow-up text-brand-500"></i>
                {done ? 'Upload More Files' : 'Upload Your Files'}
              </h2>
                <p className="text-xs text-gray-400 mt-0.5">
                {effectiveSlotsLeft} slot{effectiveSlotsLeft !== 1 ? 's' : ''} remaining &middot; All files are scanned for security before delivery.
              </p>
            </div>

            <div className="p-5 space-y-4">
                            <div
                ref={dropRef}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                className={`relative border border-dashed rounded-xl p-8 text-center transition-all cursor-pointer ${
                  dragOver ? 'border-brand-500 bg-brand-50' : 'border-gray-200 bg-gray-50 hover:border-brand-300 hover:bg-brand-50/40'
                }`}
                onClick={() => document.getElementById('file-input').click()}
              >
                <input
                  id="file-input"
                  type="file"
                  multiple
                  className="hidden"
                  accept={info.allowed_extensions?.length ? info.allowed_extensions.map((e) => `.${e}`).join(',') : undefined}
                  onChange={(e) => { if (e.target.files.length) addFiles(e.target.files); e.target.value = '' }}
                />
                <div className={`transition-transform ${dragOver ? 'scale-110' : ''}`}>
                  <i className={`fas fa-cloud-arrow-up text-3xl mb-3 block ${dragOver ? 'text-brand-500' : 'text-slate-300'}`}></i>
                  <p className="text-sm font-semibold text-gray-600">
                    {dragOver ? 'Drop files here' : 'Drag & drop files, or click to browse'}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    Up to {effectiveSlotsLeft} file{effectiveSlotsLeft !== 1 ? 's' : ''} &middot; Max 100 MB each
                  </p>
                </div>
              </div>

              {files.length > 0 && (
                <div className="space-y-2">
                  {files.map((f, i) => <FileRow key={f.name + i} file={f} onRemove={() => removeFile(i)} />)}
                </div>
              )}

              {uploadErr && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700 whitespace-pre-line">
                  <i className="fas fa-triangle-exclamation mr-1.5"></i>{uploadErr}
                </div>
              )}

              {uploading && progress > 0 && (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-gray-500 font-medium">
                    <span><i className="fas fa-spinner fa-spin mr-1.5"></i>Uploading…</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-brand-500 to-brand-600 rounded-full transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}

              <button
                onClick={handleUpload}
                disabled={!files.length || uploading}
                className="w-full py-3.5 bg-brand-600 text-white rounded-xl font-bold text-sm hover:bg-brand-700 active:scale-[0.99] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm"
              >
                {uploading
                  ? <><i className="fas fa-spinner fa-spin"></i>Uploading {files.length} file{files.length !== 1 ? 's' : ''}…</>
                  : <><i className="fas fa-paper-plane"></i>Submit {files.length > 0 ? `${files.length} file${files.length !== 1 ? 's' : ''}` : 'Files'}</>}
              </button>

              <p className="text-center text-[11px] text-gray-400 flex items-center justify-center gap-1.5">
                <i className="fas fa-shield-halved text-emerald-400"></i>
                All files are automatically scanned for security before delivery.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}