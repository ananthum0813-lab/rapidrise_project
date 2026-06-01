import { useSelector } from 'react-redux'
import { Navigate, Outlet, useLocation } from 'react-router-dom'

const SessionLoader = () => (
  <div className="min-h-screen bg-gray-50 dark:dark-page-bg flex items-center justify-center">
    <div className="flex flex-col items-center gap-4">
      <div className="brand-chip w-10 h-10 flex items-center justify-center">
        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
      </div>
      <div className="flex items-center gap-2 text-sm text-gray-400 dark:text-gray-500">
        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
        Loading…
      </div>
    </div>
  </div>
)

export default function ProtectedRoute() {
  const { isAuthenticated, sessionChecked } = useSelector((s) => s.auth)
  const location = useLocation()

  if (!sessionChecked) {
    return <SessionLoader />
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return <Outlet />
}