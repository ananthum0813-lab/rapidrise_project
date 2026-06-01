import api from '@/api/axios'

// ── Files ─────────────────────────────────────────────────────────────────────

export const getFiles = (page = 1, search = '', ordering = '-uploaded_at') =>
  api.get('/api/files/', { params: { page, search, ordering } })

/**
 * Same as getFiles but exposes page_size so callers can fetch up to 100
 * results per page. Used by the Dashboard activity chart to collect all
 * uploads from the last 7 days without being limited to the default page
 * size of 10.
 *
 * The backend FilePagination already supports page_size (max_page_size=100).
 */
export const getFilesWithPageSize = (
  page     = 1,
  search   = '',
  ordering = '-uploaded_at',
  pageSize = 10,
) =>
  api.get('/api/files/', {
    params: { page, search, ordering, page_size: pageSize },
  })

/**
 * Compute SHA-256 of a File/Blob in the browser using SubtleCrypto.
 * Returns the hex string.
 */
export async function computeSHA256(file) {
  const buffer     = await file.arrayBuffer()
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Check if a file with the given sha256 already exists in the user's storage.
 */
export const checkDuplicate = (sha256) =>
  api.post('/api/files/check-duplicate/', { sha256 })

/**
 * Upload one or more File objects.
 *
 * @param {File[]}  files        — native File objects to upload
 * @param {string}  expiryOption — one of 'never' | '1_hour' | '1_day' | '7_days' | '30_days'
 *
 * When expiryOption is 'never' (the default) the field is omitted from the
 * FormData so the backend treats it as no expiry, preserving backward compat.
 */
export const uploadFiles = (files, expiryOption = 'never') => {
  const form = new FormData()
  files.forEach((f) => form.append('files', f))
  if (expiryOption && expiryOption !== 'never') {
    form.append('expiry_option', expiryOption)
  }
  return api.post('/api/files/upload/', form, {
    headers: { 'Content-Type': undefined },
  })
}

export const deleteFile = (fileId) => api.delete(`/api/files/${fileId}/`)

export const downloadFile = (fileId) =>
  api.get(`/api/files/${fileId}/download/`, { responseType: 'blob' })

export const renameFile = (fileId, newName) =>
  api.post(`/api/files/${fileId}/rename/`, { new_name: newName })

export const getStorageInfo = () => api.get('/api/files/storage/')

// ── Expiry ────────────────────────────────────────────────────────────────────

/**
 * Set or clear the auto-delete expiry on an existing file.
 *
 * @param {string}  fileId       — UUID of the file
 * @param {string}  expiryOption — 'never' | '1_hour' | '1_day' | '7_days' | '30_days'
 */
export const setFileExpiry = (fileId, expiryOption) =>
  api.post(`/api/files/${fileId}/set-expiry/`, { expiry_option: expiryOption })

// ── Favourites ────────────────────────────────────────────────────────────────

export const toggleFavorite = (fileId) =>
  api.post(`/api/files/${fileId}/favorite/`)

export const getFavorites = (page = 1) =>
  api.get('/api/files/favorites/', { params: { page } })

// ── Trash ─────────────────────────────────────────────────────────────────────

export const getTrash = (page = 1) =>
  api.get('/api/files/trash/', { params: { page } })

export const restoreFile = (fileId) =>
  api.post(`/api/files/${fileId}/restore/`)

export const permanentlyDelete = (fileId) =>
  api.post(`/api/files/${fileId}/delete-permanently/`)

export const emptyTrash = () =>
  api.post('/api/files/trash/empty/')

// ── Batch operations ──────────────────────────────────────────────────────────

export const batchDelete = (fileIds) =>
  api.post('/api/files/batch-delete/', { file_ids: fileIds })

export const batchRestore = (fileIds) =>
  api.post('/api/files/batch-restore/', { file_ids: fileIds })

// ── Storage dashboard ─────────────────────────────────────────────────────────

/**
 * Full dashboard snapshot — used by the redesigned Storage page.
 * Returns quota, trash info, type breakdown, largest 5, and recent 5 files.
 */
export const getStorageDashboard = () => api.get('/api/files/storage/dashboard/')

/**
 * Paginated largest-files list.
 *
 * @param {object} params
 * @param {number} params.page
 * @param {string} params.search    — filter by filename
 * @param {string} params.ordering  — '-file_size' | 'file_size' | '-uploaded_at' | 'uploaded_at' | 'original_name' | '-original_name'
 */
export const getLargestFiles = ({ page = 1, search = '', ordering = '-file_size' } = {}) =>
  api.get('/api/files/storage/largest/', { params: { page, search, ordering } })

/**
 * Paginated recent-files list ordered by upload date descending.
 */
export const getRecentFiles = (page = 1) =>
  api.get('/api/files/storage/recent/', { params: { page } })

/**
 * Per-category byte and file-count totals
 * (Images, Videos, PDFs, Documents, Others).
 */
export const getFileTypeUsage = () => api.get('/api/files/storage/type-usage/')

/**
 * Trash size in bytes + file count.
 */
export const getTrashInfo = () => api.get('/api/files/storage/trash-info/')