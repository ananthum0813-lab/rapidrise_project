import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import { toast } from 'react-hot-toast'
import {
  getAllFiles as apiGetAllFiles,
  getShares,
  createShare as apiCreateShare,
  revokeShare as apiRevokeShare,
  deleteShare as apiDeleteShare,
  createZipShare as apiCreateZipShare,
  getZipShares as apiGetZipShares,
  revokeZipShare as apiRevokeZipShare,
  deleteZipShare as apiDeleteZipShare,
  getGlobalAnalytics as apiGetGlobalAnalytics,
  getShareAnalytics as apiGetShareAnalytics,
  getFileRequests,
  createFileRequest as apiCreateRequest,
  closeFileRequest as apiCloseRequest,
  getInbox,
  reviewSubmission as apiReview,
  deleteInfectedFile as apiDeleteInfectedFile,
  removeInboxItem as apiRemoveInboxItem,
} from '@/api/sharingApi'

export const fetchAllFiles = createAsyncThunk(
  'sharing/fetchAllFiles',
  async (search = '', { rejectWithValue }) => {
    try {
      const { data } = await apiGetAllFiles(search)
      return data.data
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to load files.')
    }
  },
)

export const fetchShares = createAsyncThunk(
  'sharing/fetchShares',
  async ({ page = 1, status = '', file_id = '' } = {}, { rejectWithValue }) => {
    try {
      const { data } = await getShares(page, status, file_id)
      return data.data
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to load shares.')
    }
  },
)

export const share = createAsyncThunk(
  'sharing/share',
  async (formData, { rejectWithValue }) => {
    try {
      const { data } = await apiCreateShare(formData)
      toast.success('File shared successfully', { id: 'share-success' })
      return data.data
    } catch (err) {
      const errorMsg = err.response?.data?.message || 'Failed to share file.'
      toast.error(errorMsg, { id: 'share-error' })
      return rejectWithValue(errorMsg)
    }
  },
)

export const revoke = createAsyncThunk(
  'sharing/revoke',
  async (shareId, { rejectWithValue }) => {
    try {
      await apiRevokeShare(shareId)
      return shareId
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to revoke share.')
    }
  },
)

export const deleteShare = createAsyncThunk(
  'sharing/deleteShare',
  async (shareId, { rejectWithValue }) => {
    try {
      await apiDeleteShare(shareId)
      toast.success('Share removed successfully', { id: 'delete-share-success' })
      return shareId
    } catch (err) {
      const errorMsg = err.response?.data?.message || 'Failed to delete share.'
      toast.error(errorMsg, { id: 'delete-share-error' })
      return rejectWithValue(errorMsg)
    }
  },
)

export const createZipShare = createAsyncThunk(
  'sharing/createZipShare',
  async (formData, { rejectWithValue }) => {
    try {
      const { data } = await apiCreateZipShare(formData)
      toast.success('ZIP share created successfully', { id: 'zip-share-success' })
      return data.data
    } catch (err) {
      const errorMsg = err.response?.data?.message || 'Failed to create ZIP share.'
      toast.error(errorMsg, { id: 'zip-share-error' })
      return rejectWithValue(errorMsg)
    }
  },
)

export const fetchZipShares = createAsyncThunk(
  'sharing/fetchZipShares',
  async ({ page = 1, status = '' } = {}, { rejectWithValue }) => {
    try {
      const { data } = await apiGetZipShares(page, status)
      return data.data
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to load ZIP shares.')
    }
  },
)

export const revokeZipShare = createAsyncThunk(
  'sharing/revokeZipShare',
  async (zipShareId, { rejectWithValue }) => {
    try {
      await apiRevokeZipShare(zipShareId)
      return zipShareId
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to revoke ZIP share.')
    }
  },
)

export const deleteZipShare = createAsyncThunk(
  'sharing/deleteZipShare',
  async (zipShareId, { rejectWithValue }) => {
    try {
      await apiDeleteZipShare(zipShareId)
      return zipShareId
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to delete ZIP share.')
    }
  },
)

export const fetchGlobalAnalytics = createAsyncThunk(
  'sharing/fetchGlobalAnalytics',
  async (_, { rejectWithValue }) => {
    try {
      const { data } = await apiGetGlobalAnalytics()
      return data.data
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to load analytics.')
    }
  },
)

export const fetchShareAnalytics = createAsyncThunk(
  'sharing/fetchShareAnalytics',
  async (shareId, { rejectWithValue }) => {
    try {
      const { data } = await apiGetShareAnalytics(shareId)
      return data.data
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to load analytics.')
    }
  },
)

export const fetchRequests = createAsyncThunk(
  'sharing/fetchRequests',
  async ({ page = 1, status = '' } = {}, { rejectWithValue }) => {
    try {
      const { data } = await getFileRequests(page, status)
      return data.data
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to load requests.')
    }
  },
)

export const createRequest = createAsyncThunk(
  'sharing/createRequest',
  async (formData, { rejectWithValue }) => {
    try {
      const { data } = await apiCreateRequest(formData)
      toast.success('File request created successfully', { id: 'create-request-success' })
      return data.data
    } catch (err) {
      const errorMsg = err.response?.data?.message || 'Failed to create file request.'
      toast.error(errorMsg, { id: 'create-request-error' })
      return rejectWithValue(errorMsg)
    }
  },
)

export const closeRequest = createAsyncThunk(
  'sharing/closeRequest',
  async (id, { rejectWithValue }) => {
    try {
      await apiCloseRequest(id)
      return id
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to close request.')
    }
  },
)

export const fetchInbox = createAsyncThunk(
  'sharing/fetchInbox',
  async ({ page = 1, status = '', source_type = '', scan_status = '' } = {}, { rejectWithValue }) => {
    try {
      const { data } = await getInbox(page, status, source_type, scan_status)
      return data.data
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to load inbox.')
    }
  },
)

export const reviewInboxItem = createAsyncThunk(
  'sharing/reviewInboxItem',
  async ({ id, action, note = '' }, { rejectWithValue }) => {
    try {
      const { data } = await apiReview(id, action, note)
      return data.data
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to update submission.')
    }
  },
)

export const deleteInfectedFile = createAsyncThunk(
  'sharing/deleteInfectedFile',
  async (submissionId, { rejectWithValue }) => {
    try {
      await apiDeleteInfectedFile(submissionId)
      toast.success('Infected file deleted successfully', { id: 'delete-infected-success' })
      return submissionId
    } catch (err) {
      const errorMsg = err.response?.data?.message || 'Failed to delete infected file.'
      toast.error(errorMsg, { id: 'delete-infected-error' })
      return rejectWithValue(errorMsg)
    }
  }
)

export const removeInboxItem = createAsyncThunk(
  'sharing/removeInboxItem',
  async (submissionId, { rejectWithValue }) => {
    try {
      await apiRemoveInboxItem(submissionId)
      return submissionId
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to remove item.')
    }
  },
)

const sharingSlice = createSlice({
  name: 'sharing',
  initialState: {
    allFiles:        [],
    allFilesCount:   0,
    allFilesLoading: false,

    shares:     [],
    pagination: { current_page: 1, total_pages: 1, count: 0, next: null, previous: null },
    sharing:    false,
    error:      null,

    zipShares:     [],
    zipPagination: { current_page: 1, total_pages: 1, count: 0, next: null, previous: null },
    zipSharing:    false,

    globalAnalytics:  null,
    shareAnalytics:   null,
    analyticsLoading: false,

    requests:          [],
    requestPagination: { current_page: 1, total_pages: 1, count: 0 },
    requestLoading:    false,

    inbox:             [],
    inboxPagination:   { current_page: 1, total_pages: 1, count: 0 },
    inboxStatusCounts: {},
    scanStatusCounts:  {},
    inboxLoading:      false,
    deletingFile:      false,
    removingItem:      false,
  },
  reducers: {},
  extraReducers: (builder) => {

    builder
      .addCase(fetchAllFiles.pending,   (s) => { s.allFilesLoading = true })
      .addCase(fetchAllFiles.fulfilled, (s, { payload }) => {
        s.allFiles        = payload.files || []
        s.allFilesCount   = payload.count || 0
        s.allFilesLoading = false
      })
      .addCase(fetchAllFiles.rejected,  (s) => { s.allFilesLoading = false })

    builder
      .addCase(fetchShares.fulfilled, (s, { payload }) => {
        s.shares     = payload.results || []
        s.pagination = {
          current_page: payload.current_page,
          total_pages:  payload.total_pages,
          count:        payload.count,
          next:         payload.next,
          previous:     payload.previous,
        }
      })
      .addCase(share.pending,   (s) => { s.sharing = true;  s.error = null })
      .addCase(share.fulfilled, (s) => { s.sharing = false })
      .addCase(share.rejected,  (s, { payload }) => { s.sharing = false; s.error = payload })
      .addCase(revoke.fulfilled, (s, { payload: id }) => {
        const item = s.shares.find((x) => x.id === id)
        if (item) item.status = 'revoked'
      })
      .addCase(deleteShare.fulfilled, (s, { payload: id }) => {
        s.shares = s.shares.filter((x) => x.id !== id)
      })

    builder
      .addCase(createZipShare.pending,   (s) => { s.zipSharing = true; s.error = null })
      .addCase(createZipShare.fulfilled, (s, { payload }) => {
        s.zipSharing = false
        const newZips = payload.zip_shares || []
        s.zipShares   = [...newZips, ...s.zipShares]
        s.zipPagination = {
          ...s.zipPagination,
          count: (s.zipPagination.count || 0) + newZips.length,
        }
      })
      .addCase(createZipShare.rejected, (s, { payload }) => {
        s.zipSharing = false
        s.error = payload
      })
      .addCase(fetchZipShares.fulfilled, (s, { payload }) => {
        s.zipShares     = payload.results || []
        s.zipPagination = {
          current_page: payload.current_page,
          total_pages:  payload.total_pages,
          count:        payload.count,
          next:         payload.next,
          previous:     payload.previous,
        }
      })
      .addCase(revokeZipShare.fulfilled, (s, { payload: id }) => {
        const item = s.zipShares.find((x) => x.id === id)
        if (item) item.status = 'revoked'
      })
      .addCase(deleteZipShare.fulfilled, (s, { payload: id }) => {
        s.zipShares = s.zipShares.filter((x) => x.id !== id)
      })

    builder
      .addCase(fetchGlobalAnalytics.pending,   (s) => { s.analyticsLoading = true })
      .addCase(fetchGlobalAnalytics.fulfilled, (s, { payload }) => {
        s.globalAnalytics  = payload
        s.analyticsLoading = false
      })
      .addCase(fetchGlobalAnalytics.rejected,  (s) => { s.analyticsLoading = false })
      .addCase(fetchShareAnalytics.pending,    (s) => { s.analyticsLoading = true })
      .addCase(fetchShareAnalytics.fulfilled,  (s, { payload }) => {
        s.shareAnalytics   = payload
        s.analyticsLoading = false
      })
      .addCase(fetchShareAnalytics.rejected,   (s) => { s.analyticsLoading = false })

    builder
      .addCase(fetchRequests.pending,   (s) => { s.requestLoading = true })
      .addCase(fetchRequests.fulfilled, (s, { payload }) => {
        s.requests          = payload.results || []
        s.requestPagination = {
          current_page: payload.current_page,
          total_pages:  payload.total_pages,
          count:        payload.count,
        }
        s.requestLoading = false
      })
      .addCase(fetchRequests.rejected,  (s) => { s.requestLoading = false })
      // the list correctly without any race condition.
      .addCase(createRequest.pending,   (s) => { s.requestLoading = true; s.error = null })
      .addCase(createRequest.fulfilled, (s) => { s.requestLoading = false })
      .addCase(createRequest.rejected,  (s, { payload }) => { s.requestLoading = false; s.error = payload })
      .addCase(closeRequest.fulfilled, (s, { payload: id }) => {
        s.requests = s.requests.filter((r) => r.id !== id)
      })

    builder
      .addCase(fetchInbox.pending,   (s) => { s.inboxLoading = true })
      .addCase(fetchInbox.fulfilled, (s, { payload }) => {
        s.inbox            = payload.results || []
        s.inboxPagination  = {
          current_page: payload.current_page,
          total_pages:  payload.total_pages,
          count:        payload.count,
        }
        s.inboxStatusCounts = payload.status_counts      || {}
        s.scanStatusCounts  = payload.scan_status_counts || {}
        s.inboxLoading      = false
      })
      .addCase(fetchInbox.rejected, (s) => { s.inboxLoading = false })
      .addCase(reviewInboxItem.fulfilled, (s, { payload }) => {
        if (!payload?.id) return
        const idx = s.inbox.findIndex((x) => x.id === payload.id)
        if (idx !== -1) s.inbox[idx] = payload
      })
      .addCase(deleteInfectedFile.pending,   (s) => { s.deletingFile = true })
      .addCase(deleteInfectedFile.fulfilled, (s, { payload: id }) => {
        s.inbox        = s.inbox.filter((x) => x.id !== id)
        s.deletingFile = false
      })
      .addCase(deleteInfectedFile.rejected,  (s, { payload }) => {
        s.deletingFile = false
        s.error        = payload
      })
      .addCase(removeInboxItem.pending,   (s) => { s.removingItem = true })
      .addCase(removeInboxItem.fulfilled, (s, { payload: id }) => {
        s.inbox        = s.inbox.filter((x) => x.id !== id)
        s.removingItem = false
      })
      .addCase(removeInboxItem.rejected,  (s, { payload }) => {
        s.removingItem = false
        s.error        = payload
      })
  },
})

export default sharingSlice.reducer