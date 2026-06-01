import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="text-center">
        <p className="font-display text-7xl font-bold text-brand-100 mb-4">404</p>
        <h1 className="font-display text-2xl font-semibold text-gray-900 mb-2">Page not found</h1>
        <p className="text-gray-500 text-sm mb-8">The page you're looking for doesn't exist.</p>
        <Link to="/dashboard" className="btn-primary btn">Go to dashboard</Link>
      </div>
    </div>
  )
}