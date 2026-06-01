/**
 * api/foldersApi.js
 * ─────────────────────────────────────────────────────────────────────────────
 * All HTTP calls for the Folder feature.
 */
import api from '@/api/axios'

// ── CRUD ──────────────────────────────────────────────────────────────────────

/** List all folders (summary, no file payloads). */
export const getFolders = () => api.get('/api/files/folders/')

/** Create a new folder; optionally include file_ids to pre-populate. */
export const createFolder = (payload) => api.post('/api/files/folders/', payload)

/** Full folder detail — includes embedded file list. */
export const getFolderDetail = (folderId) => api.get(`/api/files/folders/${folderId}/`)

/** Rename / recolour / re-icon a folder. */
export const updateFolder = (folderId, payload) =>
  api.patch(`/api/files/folders/${folderId}/`, payload)

/** Delete a folder (files are NOT deleted). */
export const deleteFolder = (folderId) => api.delete(`/api/files/folders/${folderId}/`)

// ── File membership ───────────────────────────────────────────────────────────

/** Add files to a folder. payload = { file_ids: [...] } */
export const addFilesToFolder = (folderId, fileIds) =>
  api.post(`/api/files/folders/${folderId}/add-files/`, { file_ids: fileIds })

/** Remove files from a folder. payload = { file_ids: [...] } */
export const removeFilesFromFolder = (folderId, fileIds) =>
  api.post(`/api/files/folders/${folderId}/remove-files/`, { file_ids: fileIds })

// ── Sharing from a folder ─────────────────────────────────────────────────────

/**
 * Share files that live inside a folder.
 *
 * payload = {
 *   file_ids?:         string[]   // omit → share all files in folder
 *   recipient_emails:  string[]
 *   expiration_hours:  number
 *   message?:          string
 *   share_type:        'single' | 'zip'
 *   zip_name?:         string     // only for zip
 * }
 */
export const shareFolderFiles = (folderId, payload) =>
  api.post(`/api/files/folders/${folderId}/share/`, payload)