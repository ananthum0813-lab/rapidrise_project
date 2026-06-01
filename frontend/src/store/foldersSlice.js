import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import {
  getFolders,
  createFolder as apiCreate,
  getFolderDetail as apiGetDetail,
  updateFolder as apiUpdate,
  deleteFolder as apiDelete,
  addFilesToFolder as apiAddFiles,
  removeFilesFromFolder as apiRemoveFiles,
  shareFolderFiles as apiShare,
} from '@/api/foldersApi'
import { toast } from 'react-hot-toast'


export const fetchFolders = createAsyncThunk(
  'folders/fetchFolders',
  async (_, { rejectWithValue }) => {
    try {
      const { data } = await getFolders()
      return data.data        // { folders: [...], count: N }
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to load folders.')
    }
  }
)

export const fetchFolderDetail = createAsyncThunk(
  'folders/fetchFolderDetail',
  async (folderId, { rejectWithValue }) => {
    try {
      const { data } = await apiGetDetail(folderId)
      return data.data        // full folder with files[]
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to load folder.')
    }
  }
)

export const createFolder = createAsyncThunk(
  'folders/createFolder',
  async (payload, { rejectWithValue }) => {
    try {
      const { data } = await apiCreate(payload)
      toast.success('Folder created successfully', { id: 'create-folder-success' })
      return data.data
    } catch (err) {
      const errorMsg = err.response?.data?.message || 'Failed to create folder.'
      toast.error(errorMsg, { id: 'create-folder-error' })
      return rejectWithValue(errorMsg)
    }
  }
)

export const updateFolder = createAsyncThunk(
  'folders/updateFolder',
  async ({ folderId, payload }, { rejectWithValue }) => {
    try {
      const { data } = await apiUpdate(folderId, payload)
      toast.success('Folder renamed successfully', { id: 'rename-folder-success' })
      return data.data
    } catch (err) {
      const errorMsg = err.response?.data?.message || 'Failed to update folder.'
      toast.error(errorMsg, { id: 'rename-folder-error' })
      return rejectWithValue(errorMsg)
    }
  }
)

export const deleteFolder = createAsyncThunk(
  'folders/deleteFolder',
  async (folderId, { rejectWithValue }) => {
    try {
      await apiDelete(folderId)
      toast.success('Folder deleted successfully', { id: 'delete-folder-success' })
      return folderId
    } catch (err) {
      const errorMsg = err.response?.data?.message || 'Failed to delete folder.'
      toast.error(errorMsg, { id: 'delete-folder-error' })
      return rejectWithValue(errorMsg)
    }
  }
)

export const addFilesToFolder = createAsyncThunk(
  'folders/addFiles',
  async ({ folderId, fileIds }, { rejectWithValue }) => {
    try {
      const { data } = await apiAddFiles(folderId, fileIds)
      toast.success('Files added to folder successfully', { id: 'add-files-success' })
      return { folderId, ...data.data }
    } catch (err) {
      const errorMsg = err.response?.data?.message || 'Failed to add files.'
      toast.error(errorMsg, { id: 'add-files-error' })
      return rejectWithValue(errorMsg)
    }
  }
)

export const removeFilesFromFolder = createAsyncThunk(
  'folders/removeFiles',
  async ({ folderId, fileIds }, { rejectWithValue }) => {
    try {
      const { data } = await apiRemoveFiles(folderId, fileIds)
      toast.success('Files removed from folder', { id: 'remove-files-success' })
      return { folderId, fileIds, ...data.data }
    } catch (err) {
      const errorMsg = err.response?.data?.message || 'Failed to remove files.'
      toast.error(errorMsg, { id: 'remove-files-error' })
      return rejectWithValue(errorMsg)
    }
  }
)

export const shareFolderFiles = createAsyncThunk(
  'folders/share',
  async ({ folderId, payload }, { rejectWithValue }) => {
    try {
      const { data } = await apiShare(folderId, payload)
      toast.success('Folder shared successfully', { id: 'share-folder-success' })
      return data.data
    } catch (err) {
      const errorMsg = err.response?.data?.message || 'Share failed.'
      toast.error(errorMsg, { id: 'share-folder-error' })
      return rejectWithValue(errorMsg)
    }
  }
)


const initialState = {
  folders:       [],          // summary list
  openFolder:    null,        // full detail (with files[])
  loading:       false,
  detailLoading: false,
  sharing:       false,
  error:         null,
  shareResult:   null,
}

const foldersSlice = createSlice({
  name: 'folders',
  initialState,
  reducers: {
    clearError(state)       { state.error = null },
    clearShareResult(state) { state.shareResult = null },
    clearOpenFolder(state)  { state.openFolder = null },
  },
  extraReducers: (builder) => {

    builder
      .addCase(fetchFolders.pending, (s) => { s.loading = true; s.error = null })
      .addCase(fetchFolders.fulfilled, (s, { payload }) => {
        s.loading = false
        s.folders = payload.folders || []
      })
      .addCase(fetchFolders.rejected, (s, { payload }) => { s.loading = false; s.error = payload })

    builder
      .addCase(fetchFolderDetail.pending, (s) => { s.detailLoading = true; s.error = null })
      .addCase(fetchFolderDetail.fulfilled, (s, { payload }) => {
        s.detailLoading = false
        s.openFolder    = payload
      })
      .addCase(fetchFolderDetail.rejected, (s, { payload }) => { s.detailLoading = false; s.error = payload })

    builder
      .addCase(createFolder.pending,   (s) => { s.loading = true;  s.error = null })
      .addCase(createFolder.fulfilled, (s, { payload }) => {
        s.loading = false
        s.folders = [payload, ...s.folders]
      })
      .addCase(createFolder.rejected, (s, { payload }) => { s.loading = false; s.error = payload })

    builder
      .addCase(updateFolder.pending,   (s) => { s.loading = true;  s.error = null })
      .addCase(updateFolder.fulfilled, (s, { payload }) => {
        s.loading = false
        const idx = s.folders.findIndex((f) => f.id === payload.id)
        if (idx !== -1) s.folders[idx] = payload
        if (s.openFolder?.id === payload.id) s.openFolder = { ...s.openFolder, ...payload }
      })
      .addCase(updateFolder.rejected, (s, { payload }) => { s.loading = false; s.error = payload })

    builder
      .addCase(deleteFolder.fulfilled, (s, { payload: id }) => {
        s.folders = s.folders.filter((f) => f.id !== id)
        if (s.openFolder?.id === id) s.openFolder = null
      })

    builder
      .addCase(addFilesToFolder.fulfilled, (s, { payload }) => {
        const idx = s.folders.findIndex((f) => f.id === payload.folderId)
        if (idx !== -1) s.folders[idx] = { ...s.folders[idx], file_count: (s.folders[idx].file_count || 0) + (payload.added || 0) }
      })

    builder
      .addCase(removeFilesFromFolder.fulfilled, (s, { payload }) => {
        if (s.openFolder?.id === payload.folderId) {
          s.openFolder.files = (s.openFolder.files || []).filter(
            (f) => !payload.fileIds.includes(f.id)
          )
        }
        const idx = s.folders.findIndex((f) => f.id === payload.folderId)
        if (idx !== -1) s.folders[idx] = {
          ...s.folders[idx],
          file_count: Math.max(0, (s.folders[idx].file_count || 0) - (payload.fileIds?.length || 0)),
        }
      })

    builder
      .addCase(shareFolderFiles.pending,   (s) => { s.sharing = true;  s.error = null; s.shareResult = null })
      .addCase(shareFolderFiles.fulfilled, (s, { payload }) => { s.sharing = false; s.shareResult = payload })
      .addCase(shareFolderFiles.rejected,  (s, { payload }) => { s.sharing = false; s.error = payload })
  },
})

export const { clearError, clearShareResult, clearOpenFolder } = foldersSlice.actions
export default foldersSlice.reducer