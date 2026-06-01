import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { verifySession } from '@/store/authSlice'
import ProtectedRoute from '@/components/layout/ProtectedRoute'
import AppLayout from '@/components/layout/AppLayout'

// Auth Pages
import Login          from '@/pages/auth/Login'
import Register       from '@/pages/auth/Register'
import ForgotPassword from '@/pages/auth/ForgotPassword'
import ResetPassword  from '@/pages/auth/ResetPassword'

// App Pages
import Dashboard from '@/pages/Dashboard'
import Files     from '@/pages/Files'
import Folders   from '@/pages/Folders'
import Sharing   from '@/pages/Sharing'
import Storage   from '@/pages/Storage'
import Settings  from '@/pages/Settings'
import Starred   from '@/pages/Starred'
import Trash     from '@/pages/Trash'
import NotFound  from '@/pages/NotFound'
import Landing   from '@/pages/Landing'

// Public Pages
import PublicSharePage    from '@/pages/PublicSharePage'
import PublicUploadPage   from '@/pages/PublicUploadPage'
import PublicZipSharePage from '@/pages/PublicZipSharePage'

function RootRedirect() {
  const { isAuthenticated, sessionChecked } = useSelector((s) => s.auth)
  if (!sessionChecked) return null
  return <Navigate to={isAuthenticated ? '/dashboard' : '/login'} replace />
}

function AppRoutes() {
  const dispatch = useDispatch()
  const { accessToken } = useSelector((s) => s.auth)

  useEffect(() => {
    if (accessToken) {
      dispatch(verifySession())
    } else {
      dispatch({ type: 'auth/verifySession/rejected', payload: 'No token' })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Routes>
      {/* Root */}
      <Route path="/" element={<Landing />} />
      <Route path="/app" element={<RootRedirect />} />

      {/* Auth */}
      <Route path="/login"           element={<Login />} />
      <Route path="/register"        element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password"  element={<ResetPassword />} />

      {/* Public share / upload */}
      <Route path="/share/:token"          element={<PublicSharePage />} />
      <Route path="/shared/:token"         element={<PublicUploadPage />} />
      <Route path="/request/upload/:token" element={<PublicUploadPage />} />
      <Route path="/zip-share/:token"      element={<PublicZipSharePage />} />

      {/* Protected — all inside AppLayout so sidebar/nav render */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/files"     element={<Files />} />
          <Route path="/folders" element={<Folders />} />
          <Route path="/folders/:folderId" element={<Folders />} />
          <Route path="/sharing"   element={<Sharing />} />
          <Route path="/storage"   element={<Storage />} />
          <Route path="/starred"   element={<Starred />} />
          <Route path="/trash"     element={<Trash />} />
          <Route path="/settings"  element={<Settings />} />
        </Route>
      </Route>

      {/* 404 */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

import { Toaster } from 'react-hot-toast'

export default function App() {
  return (
    <BrowserRouter>
      <Toaster 
        position="top-center" 
        toastOptions={{
          duration: 5000,
          className: 'dark:bg-[#1a2234] dark:text-gray-100',
          success: { duration: 4000 },
          error: { duration: 8000 },
          style: {
            background: 'var(--bg-surface)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-default)',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
            padding: '16px 24px',
            fontSize: '15px',
            fontWeight: '600',
            borderRadius: '12px',
            maxWidth: '500px'
          },
        }}
      />
      <AppRoutes />
    </BrowserRouter>
  )
}