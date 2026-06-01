import { Link } from 'react-router-dom'
import { useSelector } from 'react-redux'
import ThemeToggle from '@/components/ui/ThemeToggle'
import BrandLogo from '@/components/ui/BrandLogo'

export default function Landing() {
  const { isAuthenticated } = useSelector((s) => s.auth)

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#efedf8] dark:bg-[#020817] transition-colors duration-300">

      {/* Background */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-24 left-0 h-[420px] w-[420px] rounded-full bg-violet-300/20 blur-3xl dark:bg-violet-500/10" />
        <div className="absolute bottom-0 right-0 h-[420px] w-[420px] rounded-full bg-indigo-300/20 blur-3xl dark:bg-indigo-500/10" />
      </div>

      {/* Header */}
      <header className="relative z-20">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
          
          <BrandLogo />

          <div className="flex items-center gap-3">
            <ThemeToggle />

            <Link
              to={isAuthenticated ? '/dashboard' : '/register'}
              className="rounded-2xl bg-[#635BFF] px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#635BFF]/30 transition-all duration-300 hover:bg-[#574ff5] hover:scale-[1.03]"
            >
              {isAuthenticated ? 'Dashboard' : 'Get Started'}
            </Link>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="relative z-10 mx-auto flex min-h-[calc(100vh-90px)] max-w-7xl flex-col items-center justify-center gap-14 px-5 py-10 sm:px-8 lg:flex-row lg:gap-20">

        {/* Left Content */}
        <div className="w-full max-w-xl text-center lg:text-left">

          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-violet-200 bg-white/70 px-4 py-1.5 text-xs font-medium text-violet-700 shadow-sm backdrop-blur dark:border-slate-700 dark:bg-slate-900/60 dark:text-violet-300">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Secure File Sharing
          </div>

          <h1 className="text-4xl font-bold leading-tight tracking-tight text-slate-900 dark:text-white sm:text-5xl lg:text-6xl">
            Share files in a
            <span className="block bg-gradient-to-r from-[#635BFF] to-indigo-500 bg-clip-text text-transparent">
              modern workspace
            </span>
          </h1>

          <p className="mt-5 max-w-lg text-base leading-relaxed text-slate-600 dark:text-slate-400 sm:text-lg">
            Fast uploads, secure sharing, and a beautiful experience across all devices.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center lg:justify-start">
            <Link
              to={isAuthenticated ? '/dashboard' : '/register'}
              className="rounded-2xl bg-[#635BFF] px-7 py-3 text-center text-sm font-semibold text-white shadow-xl shadow-[#635BFF]/30 transition-all duration-300 hover:bg-[#574ff5] hover:scale-[1.03]"
            >
              {isAuthenticated ? 'Open Workspace' : 'Start Free'}
            </Link>

            {!isAuthenticated && (
              <Link
                to="/login"
                className="rounded-2xl border border-violet-200 bg-white/70 px-7 py-3 text-center text-sm font-semibold text-slate-700 backdrop-blur transition-all duration-300 hover:border-violet-300 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200"
              >
                Sign In
              </Link>
            )}
          </div>
        </div>

        {/* Right Preview Card */}
        <div className="w-full max-w-md">
          <div className="rounded-[36px] border border-violet-100 bg-white/80 p-6 shadow-2xl shadow-violet-200/40 backdrop-blur-xl dark:border-slate-800 dark:bg-[#071225]/90 dark:shadow-none">

            {/* Top */}
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                  VShare
                </h2>

                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Secure Workspace
                </p>
              </div>

              {/* Icon Button */}
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#635BFF] shadow-lg shadow-[#635BFF]/30">
                <i className="fas fa-cloud text-xl text-white" />
              </div>
            </div>

            {/* Upload Preview */}
            <div className="mt-8 rounded-[30px] border-2 border-dashed border-violet-200 bg-white/70 p-12 text-center dark:border-slate-700 dark:bg-slate-900/50">

              {/* Big Upload Icon */}
              <div className="mx-auto flex h-32 w-32 items-center justify-center rounded-[36px] bg-[#635BFF] shadow-2xl shadow-[#635BFF]/30">
                <i className="fas fa-cloud-arrow-up text-6xl text-white" />
              </div>

            </div>
          </div>
        </div>
      </main>
    </div>
  )
}