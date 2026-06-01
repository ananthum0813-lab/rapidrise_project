import api from './axios'
import axios from 'axios'

const SHARING = '/api/sharing'

// ── Public axios (no auth interceptors) ───────────────────────────────────────
const publicApi = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '',
})

// ── All files for share selector ──────────────────────────────────────────────
export const getAllFiles = (search = '') =>
  api.get(`${SHARING}/all-files/`, { params: search ? { search } : {} })

// ── Single-file shares ────────────────────────────────────────────────────────
export const getShares = (page = 1, status = '', file_id = '') =>
  api.get(`${SHARING}/`, { params: { page, status, file_id } })

export const createShare = (data) =>
  api.post(`${SHARING}/create/`, data)

export const revokeShare = (id) =>
  api.post(`${SHARING}/${id}/revoke/`)

export const deleteShare = (id) =>
  api.delete(`${SHARING}/${id}/`)

// ── Multi-file ZIP shares ─────────────────────────────────────────────────────
export const createZipShare = (data) =>
  api.post(`${SHARING}/zip/create/`, data)

export const getZipShares = (page = 1, status = '') =>
  api.get(`${SHARING}/zip/`, { params: { page, status } })

export const revokeZipShare = (id) =>
  api.post(`${SHARING}/zip/${id}/revoke/`)

export const deleteZipShare = (id) =>
  api.delete(`${SHARING}/zip/${id}/`)

// ── Public ZIP share (no auth) ────────────────────────────────────────────────
export const getPublicZipShareInfo = (token) =>
  publicApi.get(`${SHARING}/public/zip/${token}/`)

export const downloadPublicZipShare = (token) =>
  publicApi.get(`${SHARING}/public/zip/${token}/download/`, { responseType: 'blob' })

// ── Analytics ─────────────────────────────────────────────────────────────────
export const getGlobalAnalytics = () =>
  api.get(`${SHARING}/analytics/`)

export const getShareAnalytics = (shareId) =>
  api.get(`${SHARING}/${shareId}/analytics/`)

// ── File Requests ─────────────────────────────────────────────────────────────
export const getFileRequests = (page = 1, status = '') =>
  api.get(`${SHARING}/requests/`, { params: { page, status } })

export const createFileRequest = (data) =>
  api.post(`${SHARING}/requests/`, data)

export const closeFileRequest = (id) =>
  api.delete(`${SHARING}/requests/${id}/`)

// ── Per-recipient upload (public) ─────────────────────────────────────────────
export const getRecipientUploadInfo = (token) =>
  publicApi.get(`${SHARING}/requests/upload/${token}/`)

export const submitRecipientUpload = (token, formData, config = {}) =>
  publicApi.post(`${SHARING}/requests/upload/${token}/submit/`, formData, {
    headers: { 'Content-Type': undefined },
    ...config,
  })
export const sendRecipientOTP = (token) =>
  publicApi.post(`${SHARING}/requests/upload/${token}/send-otp/`)

export const verifyRecipientOTP = (token, otp) =>
  publicApi.post(`${SHARING}/requests/upload/${token}/verify-otp/`, { otp })

export const resendRecipientOTP = (token) =>
  publicApi.post(`${SHARING}/requests/upload/${token}/resend-otp/`)
/**
 * Poll the latest scan statuses for files uploaded via a recipient token.
 * Public endpoint — no auth required.
 */
export const getRecipientUploadStatuses = (token) =>
  publicApi.get(`${SHARING}/public-upload-status/${token}/`)

// ── Legacy public upload ──────────────────────────────────────────────────────
export const getPublicRequestInfo = (token) =>
  publicApi.get(`${SHARING}/requests/public/${token}/`)

export const uploadToRequest = (token, formData, config = {}) =>
  publicApi.post(`${SHARING}/requests/public/${token}/upload/`, formData, {
    headers: { 'Content-Type': undefined },
    ...config,
  })

// ── Submission Inbox ──────────────────────────────────────────────────────────
export const getInbox = (page = 1, status = '', source_type = '', scan_status = '') =>
  api.get(`${SHARING}/inbox/`, { params: { page, status, source_type, scan_status } })

export const reviewSubmission = (id, action, note = '') =>
  api.post(`${SHARING}/inbox/${id}/review/`, { action, note })

/**
 * Hard-delete an infected/scan_failed file AND its inbox row.
 * Restricted by the backend to infected or scan_failed scan statuses.
 */
export const deleteInfectedFile = (submissionId) =>
  api.delete(`${SHARING}/inbox/${submissionId}/delete-file/`)

/**
 * Remove any inbox entry.
 * • If the file is infected/scan_failed → backend also hard-deletes the file.
 * • If the file is safe/scanning        → only the inbox row is removed;
 *   the file stays in the owner's library.
 */
export const removeInboxItem = (submissionId) =>
  api.delete(`${SHARING}/inbox/${submissionId}/remove/`)

// ── Public single-file share (no auth) ───────────────────────────────────────
export const getPublicShareInfo = (token) =>
  publicApi.get(`${SHARING}/public/${token}/`)

export const downloadPublicShare = (token) =>
  publicApi.get(`${SHARING}/public/${token}/download/?download=1`, { responseType: 'blob' })