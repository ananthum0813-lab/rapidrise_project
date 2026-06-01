import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import { loginUser, registerUser, logoutUser, getProfile, updateProfile, deleteAccount as deleteAccountApi } from '@/api/authApi'
import { toast } from 'react-hot-toast'


export const login = createAsyncThunk(
  'auth/login',
  async (credentials, { rejectWithValue }) => {
    try {
      const { data } = await loginUser(credentials)
      toast.success('Login successful', { id: 'login-success' })
      return data.data // { tokens: { access, refresh }, user: {...} }
    } catch (err) {
      const errorMsg = err.response?.data?.message || 'Login failed.'
      toast.error(errorMsg, { id: 'login-error' })
      return rejectWithValue(errorMsg)
    }
  }
)

export const register = createAsyncThunk(
  'auth/register',
  async (formData, { rejectWithValue }) => {
    try {
      const { data } = await registerUser(formData)
      return data.data
    } catch (err) {
      const errors = err.response?.data?.errors
      const message = err.response?.data?.message || 'Registration failed.'
      toast.error(message, { id: 'register-error' })
      return rejectWithValue({ message, errors })
    }
  }
)

export const logout = createAsyncThunk(
  'auth/logout',
  async (_, { getState }) => {
    const refreshToken = getState().auth.refreshToken
    try {
      await logoutUser(refreshToken)
      toast.success('Logout successful', { id: 'logout-success' })
    } catch {
      toast.error('Logout failed.', { id: 'logout-error' })
    }
  }
)

export const verifySession = createAsyncThunk(
  'auth/verifySession',
  async () => {
    try {
      const { data } = await getProfile()
      return data.data // user object
    } catch {
      return 'Session expired.'
    }
  }
)

export const editProfile = createAsyncThunk(
  'auth/editProfile',
  async (profileData, { rejectWithValue }) => {
    try {
      const { data } = await updateProfile(profileData)
      toast.success('Profile updated successfully', { id: 'profile-update-success' })
      return data.data
    } catch (err) {
      const errorMsg = err.response?.data?.message || 'Profile update failed.'
      toast.error(errorMsg, { id: 'profile-update-error' })
      return rejectWithValue(errorMsg)
    }
  }
)

export const deleteAccount = createAsyncThunk(
  'auth/deleteAccount',
  async ({ confirmationText }, { getState, rejectWithValue }) => {
    try {
      const refresh = getState().auth.refreshToken
      await deleteAccountApi({ confirm: confirmationText, refresh })
      toast.success('Account deleted successfully', { id: 'account-deleted' })
      return true
    } catch (err) {
      const errorMsg = err.response?.data?.message || 'Account deletion failed.'
      toast.error(errorMsg, { id: 'account-delete-error' })
      return rejectWithValue(errorMsg)
    }
  }
)


const saveTokens = (access, refresh) => {
  localStorage.setItem('access_token', access)
  localStorage.setItem('refresh_token', refresh)
}

const clearTokens = () => {
  localStorage.removeItem('access_token')
  localStorage.removeItem('refresh_token')
}


const initialState = {
  user: null,
  accessToken: localStorage.getItem('access_token') || null,
  refreshToken: localStorage.getItem('refresh_token') || null,

  // This prevents stale/expired tokens from bypassing ProtectedRoute
  isAuthenticated: false,

  sessionChecked: false,

  loading: false,
  error: null,
  fieldErrors: null,
}


const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setTokens(state, { payload }) {
      state.accessToken = payload.accessToken
      state.refreshToken = payload.refreshToken
      saveTokens(payload.accessToken, payload.refreshToken)
    },
    clearError(state) {
      state.error = null
      state.fieldErrors = null
    },
  },
  extraReducers: (builder) => {

    builder
      .addCase(verifySession.pending, (state) => {
        state.sessionChecked = false
      })
      .addCase(verifySession.fulfilled, (state, { payload }) => {
        state.user = payload
        state.isAuthenticated = true
        state.sessionChecked = true
      })
      .addCase(verifySession.rejected, (state) => {
        state.user = null
        state.accessToken = null
        state.refreshToken = null
        state.isAuthenticated = false
        state.sessionChecked = true
        clearTokens()
      })

    builder
      .addCase(login.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(login.fulfilled, (state, { payload }) => {
        state.loading = false
        state.user = payload.user
        state.accessToken = payload.tokens.access
        state.refreshToken = payload.tokens.refresh
        state.isAuthenticated = true
        state.sessionChecked = true
        saveTokens(payload.tokens.access, payload.tokens.refresh)
      })
      .addCase(login.rejected, (state, { payload }) => {
        state.loading = false
        state.error = payload
      })

    builder
      .addCase(register.pending, (state) => {
        state.loading = true
        state.error = null
        state.fieldErrors = null
      })
      .addCase(register.fulfilled, (state) => {
        state.loading = false
      })
      .addCase(register.rejected, (state, { payload }) => {
        state.loading = false
        state.error = payload?.message || 'Registration failed.'
        state.fieldErrors = payload?.errors || null
      })

    builder.addCase(logout.fulfilled, (state) => {
      state.user = null
      state.accessToken = null
      state.refreshToken = null
      state.isAuthenticated = false
      state.error = null
      state.fieldErrors = null
      clearTokens()
    })

    builder
      .addCase(deleteAccount.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(deleteAccount.fulfilled, (state) => {
        state.loading = false
        state.user = null
        state.accessToken = null
        state.refreshToken = null
        state.isAuthenticated = false
        state.error = null
        state.fieldErrors = null
        clearTokens()
      })
      .addCase(deleteAccount.rejected, (state, { payload }) => {
        state.loading = false
        state.error = payload || 'Account deletion failed.'
      })

    builder
      .addCase(editProfile.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(editProfile.fulfilled, (state, { payload }) => {
        state.loading = false
        state.user = payload
      })
      .addCase(editProfile.rejected, (state, { payload }) => {
        state.loading = false
        state.error = payload
      })

  },
})

export const { setTokens, clearError } = authSlice.actions
export default authSlice.reducer