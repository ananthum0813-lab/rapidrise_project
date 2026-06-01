import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { toast } from 'react-hot-toast'
import { login, clearError } from '@/store/authSlice'
import { emailRules } from '@/utils/validators'
import ThemeToggle from '@/components/ui/ThemeToggle'

export default function Login() {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const location = useLocation()
  const { loading, error, isAuthenticated } = useSelector((s) => s.auth)

  const [showPassword, setShowPassword] = useState(false)

  const successMessage = location.state?.successMessage || null
  const from           = location.state?.from?.pathname || '/dashboard'

  const {
    register: field,
    handleSubmit,
    formState: { errors },
  } = useForm({ mode: 'onTouched' })

  useEffect(() => { dispatch(clearError()) }, [dispatch])

  useEffect(() => {
    if (isAuthenticated) navigate(from, { replace: true })
  }, [isAuthenticated, navigate, from])

  useEffect(() => {
    if (successMessage) {
      toast.success(successMessage, { id: 'login-success' })
      window.history.replaceState({}, document.title)
    }
  }, [successMessage])

  useEffect(() => {
    if (error) toast.error(error, { id: 'login-error' })
  }, [error])



  const onSubmit = async (formData) => {
    const result = await dispatch(login(formData))
    if (login.fulfilled.match(result)) navigate(from, { replace: true })
  }

  return (
    <div className="min-h-screen flex w-full" style={{ backgroundColor: 'var(--bg-page)', backgroundImage: 'var(--bg-page-gradient)', backgroundAttachment: 'fixed' }}>

      {/* ── Left Panel ─────────────────────────────────────────────────────── */}
      <div className="hidden lg:flex lg:w-[45%] xl:w-[40%] relative overflow-hidden flex-col justify-between p-12" style={{ background: 'var(--surface-featured)', borderRight: '1px solid var(--border-subtle)' }}>
        
        {/* Decorative background elements */}
        <div className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-hidden">
          <div className="absolute -top-[20%] -right-[10%] w-[70%] h-[70%] rounded-full opacity-20 blur-[100px]" style={{ background: 'var(--accent-primary)' }}></div>
          <div className="absolute -bottom-[20%] -left-[10%] w-[60%] h-[60%] rounded-full opacity-20 blur-[100px]" style={{ background: 'var(--accent-secondary)' }}></div>
          <div className="absolute inset-0" style={{ backgroundImage: 'linear-gradient(rgba(91,91,214,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(91,91,214,0.03) 1px, transparent 1px)', backgroundSize: '32px 32px' }}></div>
        </div>

        {/* ── Brand header ── */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg" style={{ background: 'linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-secondary) 100%)' }}>
            <i className="fas fa-cloud-arrow-up text-white text-lg" />
          </div>
          <div>
            <h2 className="text-xl font-extrabold tracking-tight" style={{ color: 'var(--text-primary)' }}>
              VShare
            </h2>
            <p className="text-xs font-semibold uppercase tracking-wider mt-0.5" style={{ color: 'var(--accent-primary)' }}>
              Secure Workspace
            </p>
          </div>
        </div>

        {/* ── Center content ── */}
        <div className="relative z-10 my-auto max-w-md">
          <h1 className="text-4xl lg:text-5xl font-black leading-tight tracking-tight mb-6" style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            Share files<br />
            <span style={{
              background: 'linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-secondary) 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>
              smarter.
            </span>
          </h1>
          <p className="text-[15px] font-medium leading-relaxed mb-10" style={{ color: 'var(--text-secondary)' }}>
            Modern workspace built for speed, security, and seamless collaboration. Experience file sharing without limits.
          </p>

          {/* Feature cards using theme widget-card */}
          <div className="flex flex-col gap-4">
            {[
              { icon: 'fa-shield-halved', title: 'Encrypted sharing',  sub: 'End-to-end protected'   },
              { icon: 'fa-link',          title: 'Secure links',        sub: 'Controlled access'      },
              { icon: 'fa-folder-tree',   title: 'Organized storage',   sub: 'Smart file management'  },
            ].map((item) => (
              <div key={item.title} className="widget-card flex items-center gap-4 px-5 py-4 cursor-default group transition-all duration-300 hover:-translate-y-1">
                <div className="widget-icon group-hover:scale-110 transition-transform duration-300">
                  <i className={`fas ${item.icon}`} />
                </div>
                <div>
                  <p className="text-[14px] font-bold" style={{ color: 'var(--text-primary)' }}>{item.title}</p>
                  <p className="text-xs font-medium mt-0.5" style={{ color: 'var(--text-muted)' }}>{item.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="relative z-10 flex items-center gap-3 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
          <span>© {new Date().getFullYear()} VShare</span>
          <span className="w-1 h-1 rounded-full bg-current opacity-40"></span>
          <span>All rights reserved</span>
        </div>
      </div>

      {/* ── Right Panel (Form) ────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col relative shadow-2xl lg:shadow-none z-20" style={{ backgroundColor: 'var(--bg-surface)' }}>
        {/* Top accent bar */}
        <div className="absolute top-0 left-0 right-0 h-1 z-10" style={{ background: 'linear-gradient(90deg, var(--accent-primary), var(--accent-secondary), var(--accent-highlight))' }} />

        {/* Theme Toggle Top Right */}
        <div className="absolute top-6 right-6 lg:top-8 lg:right-8 z-20">
          <ThemeToggle />
        </div>

        <div className="flex-1 flex items-center justify-center p-6 sm:p-12 relative overflow-y-auto">
          <div className="w-full max-w-[380px] relative z-10 animate-fade-in">
            
            {/* Mobile Logo */}
            <div className="flex lg:hidden items-center gap-3 mb-10">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg" style={{ background: 'linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-secondary) 100%)' }}>
                <i className="fas fa-cloud-arrow-up text-white text-lg" />
              </div>
              <span className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text-primary)' }}>VShare</span>
            </div>

            {/* Heading */}
            <div className="mb-8">
              <h1 className="text-[28px] font-extrabold tracking-tight mb-2" style={{ color: 'var(--text-primary)' }}>
                Welcome back
              </h1>
              <p className="text-[14px] font-medium" style={{ color: 'var(--text-muted)' }}>
                Sign in to your account to continue.
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
              
              {/* Email */}
              <div className="space-y-1.5">
                <label className="block text-[12px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                  Email address
                </label>
                <div className="relative group">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none transition-colors duration-200 group-focus-within:text-indigo-500" style={{ color: 'var(--text-muted)' }}>
                    <i className="fas fa-envelope text-sm" />
                  </div>
                  <input
                    type="email"
                    placeholder="jane@example.com"
                    autoComplete="email"
                    {...field('email', emailRules)}
                    className={`field w-full pl-11 pr-4 py-3 text-[14px] ${errors.email ? 'field-error' : ''}`}
                    style={errors.email ? { borderColor: 'var(--color-danger-border)', backgroundColor: 'var(--color-danger-bg)' } : {}}
                  />
                </div>
                {errors.email && (
                  <p className="field-msg flex items-center gap-1.5 font-medium">
                    <i className="fas fa-circle-exclamation text-[11px]" />
                    {errors.email.message}
                  </p>
                )}
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-[12px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                    Password
                  </label>
                  <Link to="/forgot-password" className="widget-link text-[13px] font-semibold">
                    Forgot password?
                  </Link>
                </div>
                <div className="relative group">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none transition-colors duration-200 group-focus-within:text-indigo-500" style={{ color: 'var(--text-muted)' }}>
                    <i className="fas fa-lock text-sm" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Your password"
                    autoComplete="current-password"
                    {...field('password', { required: 'Password is required.' })}
                    className={`field w-full pl-11 pr-12 py-3 text-[14px] ${errors.password ? 'field-error' : ''}`}
                    style={errors.password ? { borderColor: 'var(--color-danger-border)', backgroundColor: 'var(--color-danger-bg)' } : {}}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 transition-colors focus:outline-none hover:text-indigo-500"
                    style={{ color: 'var(--text-muted)' }}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    <i className={`fas ${showPassword ? 'fa-eye-slash' : 'fa-eye'} text-sm`} />
                  </button>
                </div>
                {errors.password && (
                  <p className="field-msg flex items-center gap-1.5 font-medium">
                    <i className="fas fa-circle-exclamation text-[11px]" />
                    {errors.password.message}
                  </p>
                )}
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full mt-2 py-3.5 rounded-xl text-[15px] font-bold tracking-wide flex items-center justify-center gap-2.5 shadow-lg transition-all hover:shadow-xl hover:-translate-y-0.5"
              >
                {loading ? (
                  <><i className="fas fa-circle-notch fa-spin text-sm" /> Signing in…</>
                ) : (
                  <><i className="fas fa-arrow-right-to-bracket text-sm" /> Sign in</>
                )}
              </button>
            </form>

            {/* Divider */}
            <div className="flex items-center gap-4 my-8">
              <div className="flex-1 h-px" style={{ backgroundColor: 'var(--border-subtle)' }} />
              <span className="text-[11px] font-bold tracking-widest uppercase" style={{ color: 'var(--text-muted)' }}>
                New Here?
              </span>
              <div className="flex-1 h-px" style={{ backgroundColor: 'var(--border-subtle)' }} />
            </div>

            {/* Register CTA */}
            <Link
              to="/register"
              className="btn-secondary w-full py-3.5 rounded-xl text-[14px] font-bold flex items-center justify-center gap-2.5 transition-all hover:-translate-y-0.5"
            >
              <i className="fas fa-user-plus text-sm" style={{ color: 'var(--accent-primary)' }} />
              Create an account
            </Link>

            {/* Trust badges */}
            <div className="flex items-center justify-center gap-6 mt-8">
              {[
                { icon: 'fa-shield-halved', label: 'Encrypted' },
                { icon: 'fa-lock',          label: 'Private'   },
                { icon: 'fa-bolt',          label: 'Fast'      },
              ].map((b) => (
                <div key={b.label} className="flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
                  <i className={`fas ${b.icon} text-[11px]`} style={{ color: 'var(--accent-primary)' }} />
                  <span className="text-[12px] font-bold">{b.label}</span>
                </div>
              ))}
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}