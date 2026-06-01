import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { toast } from 'react-hot-toast'
import { register, clearError } from '@/store/authSlice'
import {
  emailRules, passwordRules,
  firstNameRules, lastNameRules, dateOfBirthRules,
} from '@/utils/validators'
import ThemeToggle from '@/components/ui/ThemeToggle'

export default function Register() {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const { loading, error, isAuthenticated } = useSelector((s) => s.auth)
  const [showPassword,        setShowPassword]        = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const {
    register: field, handleSubmit, watch, setError,
    formState: { errors },
  } = useForm({ mode: 'onTouched' })

  // eslint-disable-next-line react-hooks/incompatible-library
  const password = watch('password')

  useEffect(() => { dispatch(clearError()) }, [dispatch])

  useEffect(() => {
    if (isAuthenticated) navigate('/dashboard', { replace: true })
  }, [isAuthenticated, navigate])

  useEffect(() => {
    if (error && typeof error === 'string') toast.error(error, { id: 'register-error' })
  }, [error])

  const onSubmit = async (formData) => {
    const result = await dispatch(register(formData))
    if (register.rejected.match(result)) {
      const fieldErrors = result.payload?.errors
      if (fieldErrors && typeof fieldErrors === 'object') {
        Object.entries(fieldErrors).forEach(([key, msgs]) => {
          if (key !== 'non_field_errors') {
            setError(key, {
              type: 'server',
              message: Array.isArray(msgs) ? msgs[0] : String(msgs),
            })
          }
        })
      }
      return
    }
    navigate('/login', {
      replace: true,
      state: { successMessage: 'Account created! Please sign in.' },
    })
  }

  return (
    <div
      className="min-h-screen flex w-full"
      style={{ backgroundColor: 'var(--bg-page)', backgroundImage: 'var(--bg-page-gradient)', backgroundAttachment: 'fixed' }}
    >

      {/* ── Left Panel ─────────────────────────────────────────────────────── */}
      <div
        className="hidden lg:flex lg:w-[45%] xl:w-[40%] relative overflow-hidden flex-col p-12"
        style={{ background: 'var(--surface-featured)', borderRight: '1px solid var(--border-subtle)' }}
      >
        {/* Decorative background elements */}
        <div className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-hidden">
          <div className="absolute -top-[20%] -right-[10%] w-[70%] h-[70%] rounded-full opacity-20 blur-[100px]" style={{ background: 'var(--accent-primary)' }} />
          <div className="absolute -bottom-[20%] -left-[10%] w-[60%] h-[60%] rounded-full opacity-20 blur-[100px]" style={{ background: 'var(--accent-secondary)' }} />
          <div className="absolute inset-0" style={{ backgroundImage: 'linear-gradient(rgba(91,91,214,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(91,91,214,0.03) 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
        </div>

        {/* Brand header */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg" style={{ background: 'linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-secondary) 100%)' }}>
            <i className="fas fa-cloud-arrow-up text-white text-lg" />
          </div>
          <div>
            <h2 className="text-xl font-extrabold tracking-tight" style={{ color: 'var(--text-primary)' }}>VShare</h2>
            <p className="text-xs font-semibold uppercase tracking-wider mt-0.5" style={{ color: 'var(--accent-primary)' }}>Secure Workspace</p>
          </div>
        </div>

        {/* Center content — mt-10 keeps it close to brand header */}
        <div className="relative z-10 mt-10 max-w-md">
          <h1
            className="text-4xl lg:text-5xl font-black leading-tight tracking-tight mb-4"
            style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}
          >
            Create your<br />
            <span style={{
              background: 'linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-secondary) 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>
              secure workspace.
            </span>
          </h1>
          <p className="text-[15px] font-medium leading-relaxed mb-7" style={{ color: 'var(--text-secondary)' }}>
            Upload, organize and share files with a fast and modern experience. Build your workflow today.
          </p>

          {/* Feature cards */}
          <div className="flex flex-col gap-3">
            {[
              { icon: 'fa-mobile-screen',  title: 'Access anywhere',       sub: 'Works on every device'           },
              { icon: 'fa-link',           title: 'Expiring share links',  sub: 'Set it, share it, forget it'     },
              { icon: 'fa-cloud-arrow-up', title: 'Fast uploads',          sub: 'Store and access files anytime'  },
            ].map((item) => (
              <div key={item.title} className="widget-card flex items-center gap-4 px-5 py-3.5 cursor-default group transition-all duration-300 hover:-translate-y-1">
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

        {/* Footer — pushed to bottom with mt-auto */}
        <div className="relative z-10 mt-auto flex items-center gap-3 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
          <span>© {new Date().getFullYear()} VShare</span>
          <span className="w-1 h-1 rounded-full bg-current opacity-40" />
          <span>All rights reserved</span>
        </div>
      </div>

      {/* ── Right Panel ────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col relative shadow-2xl lg:shadow-none z-20" style={{ backgroundColor: 'var(--bg-surface)' }}>

        {/* Top accent bar */}
        <div className="absolute top-0 left-0 right-0 h-1 z-10" style={{ background: 'linear-gradient(90deg, var(--accent-primary), var(--accent-secondary), var(--accent-highlight))' }} />

        {/* Theme toggle */}
        <div className="absolute top-6 right-6 lg:top-8 lg:right-8 z-30">
          <ThemeToggle />
        </div>

        {/* Form content — centered vertically, no overflow scroll needed */}
        <div className="relative z-10 flex flex-col items-center justify-center px-6 sm:px-12 py-6 flex-1">
          <div className="w-full max-w-[420px] animate-fade-in">

            {/* Mobile logo */}
            <div className="flex lg:hidden items-center gap-3 mb-6">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shadow-lg" style={{ background: 'linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-secondary) 100%)' }}>
                <i className="fas fa-cloud-arrow-up text-white text-base" />
              </div>
              <span className="text-xl font-extrabold tracking-tight" style={{ color: 'var(--text-primary)' }}>VShare</span>
            </div>

            {/* Heading */}
            <div className="mb-5">
              <h1 className="text-[24px] font-extrabold tracking-tight mb-1" style={{ color: 'var(--text-primary)' }}>
                Create your account
              </h1>
              <p className="text-[13px] font-medium" style={{ color: 'var(--text-muted)' }}>
                Start sharing files securely in minutes.
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-3">

              {/* Name row */}
              <div className="grid grid-cols-2 gap-3">
                <FieldGroup label="First name" required error={errors.first_name?.message}>
                  <input
                    type="text" placeholder="Jane" autoComplete="given-name"
                    {...field('first_name', firstNameRules)}
                    className={inputCls(errors.first_name).replace('pl-11', 'px-4')}
                  />
                </FieldGroup>
                <FieldGroup label="Last name" required error={errors.last_name?.message}>
                  <input
                    type="text" placeholder="Doe" autoComplete="family-name"
                    {...field('last_name', lastNameRules)}
                    className={inputCls(errors.last_name).replace('pl-11', 'px-4')}
                  />
                </FieldGroup>
              </div>

              {/* Email */}
              <FieldGroup label="Email address" required error={errors.email?.message}>
                <IconLeft icon="fa-envelope" />
                <input
                  type="email" placeholder="jane@example.com" autoComplete="email"
                  {...field('email', emailRules)}
                  className={inputCls(errors.email)}
                />
              </FieldGroup>

              {/* Date of birth */}
              <FieldGroup label="Date of birth" required error={errors.date_of_birth?.message}>
                <IconLeft icon="fa-calendar" />
                <input
                  type="date" autoComplete="bday"
                  {...field('date_of_birth', dateOfBirthRules)}
                  className={inputCls(errors.date_of_birth)}
                  onClick={(e) => e.target.showPicker && e.target.showPicker()}
                />
              </FieldGroup>

              {/* Password */}
              <FieldGroup
                label="Password" required
                error={errors.password?.message}
                hint={!errors.password ? 'Letter, number & special character.' : undefined}
              >
                <IconLeft icon="fa-lock" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Min. 8 chars with number & symbol"
                  autoComplete="new-password"
                  {...field('password', passwordRules)}
                  className={`${inputCls(errors.password)} pr-12`}
                />
                <EyeToggle show={showPassword} onToggle={() => setShowPassword(v => !v)} />
              </FieldGroup>

              {/* Confirm password */}
              <FieldGroup label="Confirm password" required error={errors.confirm_password?.message}>
                <IconLeft icon="fa-lock" />
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder="Repeat your password"
                  autoComplete="new-password"
                  {...field('confirm_password', {
                    required: 'Please confirm your password.',
                    validate: (v) => v === password || 'Passwords do not match.',
                  })}
                  className={`${inputCls(errors.confirm_password)} pr-12`}
                />
                <EyeToggle show={showConfirmPassword} onToggle={() => setShowConfirmPassword(v => !v)} />
              </FieldGroup>

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full py-3 rounded-xl text-[14px] font-bold tracking-wide flex items-center justify-center gap-2.5 shadow-lg transition-all hover:shadow-xl hover:-translate-y-0.5"
              >
                {loading ? (
                  <><i className="fas fa-circle-notch fa-spin text-sm" /> Creating account…</>
                ) : (
                  <><i className="fas fa-user-plus text-sm" /> Create account</>
                )}
              </button>
            </form>

            {/* Divider */}
            <div className="flex items-center gap-4 my-4">
              <div className="flex-1 h-px" style={{ backgroundColor: 'var(--border-subtle)' }} />
              <span className="text-[11px] font-bold tracking-widest uppercase" style={{ color: 'var(--text-muted)' }}>
                Have an account?
              </span>
              <div className="flex-1 h-px" style={{ backgroundColor: 'var(--border-subtle)' }} />
            </div>

            {/* Sign in CTA */}
            <Link
              to="/login"
              className="btn-secondary w-full py-3 rounded-xl text-[14px] font-bold flex items-center justify-center gap-2.5 transition-all hover:-translate-y-0.5"
            >
              <i className="fas fa-arrow-right-to-bracket text-sm" style={{ color: 'var(--accent-primary)' }} />
              Sign in instead
            </Link>

            {/* Trust badges */}
            <div className="flex items-center justify-center gap-6 mt-4">
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

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function IconLeft({ icon }) {
  return (
    <div
      className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none transition-colors duration-200 group-focus-within:text-indigo-500"
      style={{ color: 'var(--text-muted)' }}
    >
      <i className={`fas ${icon} text-sm`} />
    </div>
  )
}

function EyeToggle({ show, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="absolute right-4 top-1/2 -translate-y-1/2 transition-colors focus:outline-none hover:text-indigo-500"
      style={{ color: 'var(--text-muted)' }}
      aria-label={show ? 'Hide password' : 'Show password'}
    >
      <i className={`fas ${show ? 'fa-eye-slash' : 'fa-eye'} text-sm`} />
    </button>
  )
}

function inputCls(fieldError) {
  return `field w-full pl-11 pr-4 py-2.5 text-[14px] ${fieldError ? 'field-error' : ''}`
}

function FieldGroup({ label, required, hint, error, children }) {
  return (
    <div className="space-y-1">
      <label
        className="block text-[11px] font-bold uppercase tracking-wider"
        style={{ color: 'var(--text-secondary)' }}
      >
        {label}
        {required && (
          <span style={{ color: 'var(--color-danger)', marginLeft: '2px' }}>*</span>
        )}
      </label>
      <div className="relative group">
        {children}
      </div>
      {hint && !error && (
        <p className="text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>{hint}</p>
      )}
      {error && (
        <p className="field-msg flex items-center gap-1.5 font-medium">
          <i className="fas fa-circle-exclamation text-[11px]" />
          {error}
        </p>
      )}
    </div>
  )
}