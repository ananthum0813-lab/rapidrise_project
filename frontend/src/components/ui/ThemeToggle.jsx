import { useTheme } from '@/context/ThemeContext'

/**
 * @param {'compact' | 'full'} variant
 */
export default function ThemeToggle({ variant = 'compact', className = '' }) {
  const { theme, toggleTheme, setLightTheme, setDarkTheme, isDark } = useTheme()

  if (variant === 'full') {
    return (
      <div className={`flex gap-2 ${className}`}>
        <button
          type="button"
          onClick={setLightTheme}
          aria-pressed={theme === 'light'}
          className={`flex flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
            theme === 'light'
              ? 'border-brand-500 bg-brand-50 text-brand-700 dark:border-indigo-500/40 dark:bg-indigo-500/10 dark:text-indigo-200'
              : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-midnight-500 dark:bg-midnight-700 dark:text-slate-500 dark:hover:bg-midnight-600'
          }`}
        >
          <i className="fas fa-sun text-sm" aria-hidden />
          Light
        </button>
        <button
          type="button"
          onClick={setDarkTheme}
          aria-pressed={theme === 'dark'}
          className={`flex flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
            theme === 'dark'
              ? 'border-indigo-500/35 bg-nav-active text-indigo-100'
              : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-midnight-500 dark:bg-midnight-700 dark:text-slate-500'
          }`}
        >
          <i className="fas fa-moon text-sm" aria-hidden />
          Dark
        </button>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Light mode' : 'Dark mode'}
      className={`theme-toggle-btn ${className}`}
    >
      <i className={`fas ${isDark ? 'fa-sun' : 'fa-moon'} text-sm`} aria-hidden />
    </button>
  )
}
