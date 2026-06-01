import axios from 'axios'
import { toast } from 'react-hot-toast'

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'

const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

// Attach access token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Handle 401 — try refresh, else force logout
let isRefreshing = false
let queue = []

const processQueue = (error, token = null) => {
  queue.forEach((p) => (error ? p.reject(error) : p.resolve(token)))
  queue = []
}

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    // Global Error Notifications
    if (!error.response) {
      toast.error('Network disconnected or server unavailable.', { id: 'network-error' })
    } else if (error.response.status >= 500) {
      toast.error('Unexpected server error occurred.', { id: 'server-error' })
    }

    const original = error.config

    if (error.response?.status === 401 && !original._retry) {
      const refreshToken = localStorage.getItem('refresh_token')

      // No refresh token — hard logout
      if (!refreshToken) {
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        if (window.location.pathname !== '/login') {
          toast.error('Session expired. Please log in again.', { id: 'session-expired' })
          window.location.replace('/login')
        }
        return Promise.reject(error)
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => queue.push({ resolve, reject }))
          .then((token) => {
            original.headers.Authorization = `Bearer ${token}`
            return api(original)
          })
      }

      original._retry = true
      isRefreshing = true

      try {
        const { data } = await axios.post(`${BASE_URL}/api/auth/token/refresh/`, {
          refresh: refreshToken,
        })
        const newAccess = data.data.access
        const newRefresh = data.data.refresh

        localStorage.setItem('access_token', newAccess)
        localStorage.setItem('refresh_token', newRefresh)

        processQueue(null, newAccess)
        original.headers.Authorization = `Bearer ${newAccess}`
        return api(original)
      } catch (err) {
        processQueue(err, null)
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        if (window.location.pathname !== '/login') {
          toast.error('Session expired. Please log in again.', { id: 'session-expired' })
          window.location.replace('/login')
        }
        return Promise.reject(err)
      } finally {
        isRefreshing = false
      }
    }

    return Promise.reject(error)
  }
)

export default api