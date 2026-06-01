import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { forgotPassword } from '@/api/authApi'
import { toast } from 'react-hot-toast'
import { emailRules, getApiError } from '@/utils/validators'
import AuthLayout from '@/components/layout/AuthLayout'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'

export default function ForgotPassword() {
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState(null)

  const { register: field, handleSubmit, formState: { errors } } = useForm({ mode: 'onTouched' })

  useEffect(() => {
    if (error) toast.error(error, { id: 'forgot-error' })
  }, [error])

  const onSubmit = async ({ email }) => {
    setLoading(true)
    setError(null)
    try {
      await forgotPassword(email)
      setSent(true)
    } catch (err) {
      setError(getApiError(err))
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <AuthLayout title="Check your email" subtitle="We'll send a link if that account exists.">
        <div className="text-center space-y-5">
          <div className="w-14 h-14 rounded-2xl bg-green-50 flex items-center justify-center mx-auto">
            <svg className="w-7 h-7 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <p className="text-sm text-gray-500 leading-relaxed">
            If an account exists for that email, you'll receive a password reset link shortly.
            Check your spam folder if you don't see it.
          </p>
          <Link to="/login" className="btn-primary btn inline-flex w-full justify-center">
            Back to sign in
          </Link>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Forgot your password?"
      subtitle="Enter your email and we'll send you a reset link."
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <Input
          label="Email address"
          type="email"
          required
          placeholder="jane@example.com"
          error={errors.email?.message}
          {...field('email', emailRules)}
        />

        <Button type="submit" variant="primary" fullWidth loading={loading}>
          Send reset link
        </Button>
      </form>

      <p className="text-center text-sm text-gray-500 mt-6">
        Remember it?{' '}
        <Link to="/login" className="text-brand-600 font-medium hover:text-brand-700 transition-colors">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  )
}