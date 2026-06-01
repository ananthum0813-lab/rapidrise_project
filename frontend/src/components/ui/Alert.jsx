const config = {
  error: {
    wrap: 'bg-red-50 border-red-200 text-red-700 dark:bg-accent-red/10 dark:border-accent-red/30 dark:text-accent-red',
    icon: (
      <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  success: {
    wrap: 'bg-green-50 border-green-200 text-green-700 dark:bg-emerald-500/10 dark:border-emerald-500/30 dark:text-emerald-400',
    icon: (
      <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  info: {
    wrap: 'bg-brand-50 border-brand-200 text-brand-700 dark:bg-indigo-500/10 dark:border-indigo-500/25 dark:text-indigo-200',
    icon: (
      <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
}

export default function Alert({ type = 'error', message, className = '' }) {
  if (!message) return null
  const { wrap, icon } = config[type] || config.error
  return (
    <div className={`flex items-start gap-2.5 px-3.5 py-3 rounded-lg border text-sm ${wrap} ${className}`}>
      {icon}
      <span>{message}</span>
    </div>
  )
}
