import { Link } from 'react-router-dom'
import ThemeToggle from '@/components/ui/ThemeToggle'
import BrandLogo from '@/components/ui/BrandLogo'

const Logo = () => (
  <BrandLogo size="sm" />
)

export default function AuthLayout({ children, title, subtitle }) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col dark:dark-page-bg">
      <header className="auth-chrome">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <Link to="/" className="inline-block">
            <Logo />
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-10 sm:py-14">
        <div className="w-full max-w-md">
          <div className="mb-8 animate-fade-up">
            <h1 className="font-display text-2xl sm:text-[1.625rem] font-semibold text-gray-900 dark:text-gray-100 mb-2 tracking-tight">
              {title}
            </h1>
            {subtitle && (
              <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{subtitle}</p>
            )}
          </div>

          <div className="card p-7 sm:p-8 animate-fade-up delay-1">
            {children}
          </div>
        </div>
      </main>

      <footer className="text-center py-5 text-xs text-gray-400 dark:text-gray-500">
        © {new Date().getFullYear()} VShare. All rights reserved.
      </footer>
    </div>
  )
}
