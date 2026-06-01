import React from 'react'
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import { getFiles, uploadFiles, deleteFile, getStorageInfo, renameFile, restoreFile as restoreFileAPI } from '@/api/filesApi'
import { toast } from 'react-hot-toast'


export const fetchFiles = createAsyncThunk(
  'files/fetchFiles',
  async ({ page = 1, search = '', ordering = '-uploaded_at' } = {}, { rejectWithValue }) => {
    try {
      const { data } = await getFiles(page, search, ordering)
      return data.data
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to fetch files.')
    }
  }
)

export const upload = createAsyncThunk(
  'files/upload',
  async ({ files, expiryOption = 'never' }, { rejectWithValue }) => {
    const toastId = toast.loading('Uploading...')
    try {
      const { data } = await uploadFiles(files, expiryOption)
      toast.success(files.length > 1 ? `${files.length} files uploaded successfully` : 'File uploaded successfully', { id: toastId })
      return data.data
    } catch (err) {
      const status = err.response?.status
      let errorMsg = err.response?.data?.errors || err.response?.data?.message || err.response?.data?.detail
      
      if (!errorMsg && err.response?.data && typeof err.response.data === 'object') {
        errorMsg = err.response.data
      }

      if (!errorMsg) {
        errorMsg = 'Upload failed: Network or server error. Please check your connection and try again.'
      }
      
      if (typeof errorMsg !== 'string') {
        try {
          errorMsg = Object.values(errorMsg).flat().join(' ') || 'Upload failed: Unable to process the server response.'
        } catch {
          errorMsg = 'Upload failed: An unexpected error occurred while parsing the server response.'
        }
      }

      if (status === 413) {
        errorMsg = 'Upload failed: File size exceeds the maximum upload limit.'
      } else if (status === 402 || errorMsg.toLowerCase().includes('storage')) {
        errorMsg = 'Upload failed: Storage is full. Delete files or empty trash and try again.'
      } else if (status === 415) {
        errorMsg = 'Upload failed: Unsupported file type.'
      }
      
      toast.error(errorMsg, { id: toastId })
      return rejectWithValue(errorMsg)
    }
  }
)

export const remove = createAsyncThunk(
  'files/remove',
  async (fileId, { dispatch, rejectWithValue }) => {
    try {
      await deleteFile(fileId)
      toast.success(
        (t) => React.createElement('div', { className: 'flex items-center gap-4' },
          React.createElement('span', null, 'Moved to Trash'),
          React.createElement('button', {
            onClick: async () => {
              toast.dismiss(t.id)
              try {
                await restoreFileAPI(fileId)
                toast.success('File restored', { id: `restore-${fileId}` })
                dispatch(fetchFiles())
                dispatch(fetchStorage())
              } catch {
                toast.error('Failed to restore file')
              }
            },
            className: 'text-sm font-semibold text-brand-500 hover:text-brand-600 transition-colors'
          }, 'Undo')
        ),
        { id: `delete-file-${fileId}` }
      )
      return fileId
    } catch (err) {
      const msg = err.response?.data?.message || 'Delete failed.'
      toast.error(msg, { id: `delete-file-${fileId}-error` })
      return rejectWithValue(msg)
    }
  }
)

export const fetchStorage = createAsyncThunk(
  'files/fetchStorage',
  async (_, { rejectWithValue }) => {
    try {
      const { data } = await getStorageInfo()
      const storage = data.data
      if (storage.total_bytes > 0) {
        const usagePercent = (storage.used_bytes / storage.total_bytes) * 100
        if (storage.used_bytes >= storage.total_bytes) {
          toast.error('Storage full. Delete files or empty trash immediately to resume uploading.', { id: 'storage-full', duration: 8000 })
        } else if (usagePercent >= 95) {
          toast.error('Storage above 95%. Delete files or empty trash to continue uploading.', { id: 'storage-warning-critical' })
        } else if (usagePercent >= 90) {
          toast("You're using 90% of your storage capacity.", { id: 'storage-warning-90', icon: '⚠️', duration: 6000 })
        } else if (usagePercent >= 80) {
          toast("You're using 80% of your storage capacity.", { id: 'storage-warning-80', icon: '⚠️', duration: 6000 })
        }
      }
      return storage
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to fetch storage info.')
    }
  }
)

export const rename = createAsyncThunk(
  'files/rename',
  async ({ fileId, newName }, { rejectWithValue }) => {
    try {
      const { data } = await renameFile(fileId, newName)
      toast.success('File renamed successfully')
      return data.data
    } catch (err) {
      const msg = err.response?.data?.message || 'Rename failed.'
      toast.error(msg)
      return rejectWithValue(msg)
    }
  }
)


const initialState = {
  files: [],
  pagination: { count: 0, total_pages: 1, current_page: 1, next: null, previous: null },
  storage: null,
  loading: false,
  uploading: false,
  error: null,
}


const filesSlice = createSlice({
  name: 'files',
  initialState,
  reducers: {
    clearError(state) {
      state.error = null
    },
    toggleFavoriteOptimistic(state, { payload: fileId }) {
      const file = state.files.find(f => f.id === fileId)
      if (file) {
        file.is_favorite = !file.is_favorite
      }
    },
  },
  extraReducers: (builder) => {

    builder
      .addCase(fetchFiles.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchFiles.fulfilled, (state, { payload }) => {
        state.loading = false
        state.files = payload.results || []
        state.pagination = {
          count: payload.count,
          total_pages: payload.total_pages,
          current_page: payload.current_page,
          next: payload.next,
          previous: payload.previous,
        }
      })
      .addCase(fetchFiles.rejected, (state, { payload }) => {
        state.loading = false
        state.error = payload
      })

    builder
      .addCase(upload.pending, (state) => {
        state.uploading = true
        state.error = null
      })
      .addCase(upload.fulfilled, (state, { payload }) => {
        state.uploading = false

        const uploaded =
          payload?.uploaded ??
          payload?.results ??
          (Array.isArray(payload) ? payload : null)

        if (uploaded?.length) {
          state.files = [...uploaded, ...state.files]
          state.pagination.count += uploaded.length
        }
      })
      .addCase(upload.rejected, (state, { payload }) => {
        state.uploading = false
        state.error = payload
      })

    builder
      .addCase(remove.fulfilled, (state, { payload: fileId }) => {
        state.files = state.files.filter((f) => f.id !== fileId)
        state.pagination.count = Math.max(0, state.pagination.count - 1)
      })

    builder
      .addCase(fetchStorage.pending, (state) => {
        state.loading = true
      })
      .addCase(fetchStorage.fulfilled, (state, { payload }) => {
        state.loading = false
        state.storage = payload
      })
      .addCase(fetchStorage.rejected, (state, { payload }) => {
        state.loading = false
        state.error = payload
      })

    builder
      .addCase(rename.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(rename.fulfilled, (state, { payload }) => {
        state.loading = false
        const index = state.files.findIndex((f) => f.id === payload.id)
        if (index !== -1) {
          state.files[index] = payload
        }
      })
      .addCase(rename.rejected, (state, { payload }) => {
        state.loading = false
        state.error = payload
      })
  },
})

export const { clearError, toggleFavoriteOptimistic } = filesSlice.actions
export default filesSlice.reducer