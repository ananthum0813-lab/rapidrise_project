import api from './axios'

const AUTH = '/api/auth'

export const registerUser    = (data)          => api.post(`${AUTH}/register/`, data)
export const loginUser       = (data)          => api.post(`${AUTH}/login/`, data)
export const logoutUser      = (refresh)       => api.post(`${AUTH}/logout/`, { refresh })
export const getProfile      = ()              => api.get(`${AUTH}/profile/`)
export const updateProfile   = (data)          => api.patch(`${AUTH}/profile/update/`, data)
export const changePassword  = (data)          => api.post(`${AUTH}/change-password/`, data)
export const forgotPassword  = (email)         => api.post(`${AUTH}/forgot-password/`, { email })
export const resetPassword   = (data)          => api.post(`${AUTH}/reset-password/`, data)
export const refreshToken    = (refresh)       => api.post(`${AUTH}/token/refresh/`, { refresh })
export const deleteAccount   = (payload)       => api.post(`${AUTH}/delete-account/`, payload)