export default function BrandLogo({ size = 'md', showText = true }) {
  const isSm = size === 'sm'
  return (
    <div className="flex items-center gap-2.5">
      <div className={`${isSm ? 'h-8 w-8' : 'h-9 w-9'} brand-chip flex items-center justify-center rounded-xl`}>
        <i className="fas fa-cloud-arrow-up text-white text-sm" aria-hidden />
      </div>
      {showText && (
        <span className="font-display font-semibold text-gray-900 dark:text-gray-100 text-lg tracking-tight">
          VShare
        </span>
      )}
    </div>
  )
}
