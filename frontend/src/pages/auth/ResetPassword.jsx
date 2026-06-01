import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { resetPassword } from '@/api/authApi'
import { toast } from 'react-hot-toast'
import { passwordRules, getApiError } from '@/utils/validators'
import AuthLayout from '@/components/layout/AuthLayout'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
export default function ResetPassword() {
const navigate = useNavigate()
const [searchParams] = useSearchParams()
const token = searchParams.get('token')
const [loading, setLoading] = useState(false)
const [error, setError] = useState(null)
const [success, setSuccess] = useState(false)
const { register: field, handleSubmit, watch, formState: { errors } } = useForm({ mode: 'onTouched' })
// eslint-disable-next-line react-hooks/incompatible-library
const newPassword = watch('new_password')
useEffect(() => {
if (!token) navigate('/forgot-password', { replace: true })
  }, [token, navigate])
useEffect(() => {
if (error) toast.error(error, { id: 'reset-error' })
  }, [error])
const onSubmit = async ({ new_password, confirm_password }) => {
setLoading(true)
setError(null)
try {
await resetPassword({ token, new_password, confirm_password })
setSuccess(true)
setTimeout(() => navigate('/login'), 3000)
    } catch (err) {
setError(getApiError(err))
    } finally {
setLoading(false)
    }
  }
if (success) {
return (
<AuthLayout title="Password reset!" subtitle="You can now sign in with your new password.">
<div className="text-center space-y-5">
<div className="w-14 h-14 rounded-2xl bg-brand-50 flex items-center justify-center mx-auto">
<svg className="w-7 h-7 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
</svg>
</div>
<p className="text-sm text-gray-500">Redirecting you to sign in in 3 seconds…</p>
<Link to="/login" className="btn-primary btn inline-flex w-full justify-center">
            Sign in now
</Link>
</div>
</AuthLayout>
    )
  }
return (
<AuthLayout title="Set new password" subtitle="Choose a strong password for your account.">
<form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
<Input
label="New password"
type="password"
required
autoComplete="new-password"
placeholder="Min. 8 chars with number & symbol"
hint="Must include a letter, number, and special character."
error={errors.new_password?.message}
{...field('new_password', {
  ...passwordRules,
  validate: {
    ...passwordRules.validate,
    hasLetter:  (v) => /[a-zA-Z]/.test(v)      || 'Password must contain at least one letter.',
    hasNumber:  (v) => /\d/.test(v)             || 'Password must contain at least one number.',
    hasSpecial: (v) => /[^a-zA-Z0-9]/.test(v)  || 'Password must contain at least one special character.',
  },
})}
/>
<Input
label="Confirm new password"
type="password"
required
autoComplete="new-password"
placeholder="Repeat your new password"
error={errors.confirm_password?.message}
{...field('confirm_password', {
required: 'Please confirm your password.',
validate: (v) => v === newPassword || 'Passwords do not match.',
          })}
/>
<Button type="submit" variant="primary" fullWidth loading={loading}>
          Reset password
</Button>
</form>
</AuthLayout>
  )
}