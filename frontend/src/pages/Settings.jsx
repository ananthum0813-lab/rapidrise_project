import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useSelector, useDispatch } from 'react-redux'
import { changePassword } from '@/api/authApi'
import { deleteAccount, editProfile } from '@/store/authSlice'
import { useNavigate } from 'react-router-dom'
import { passwordRules, getApiError } from '@/utils/validators'
import Alert from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import ThemeToggle from '@/components/ui/ThemeToggle'

const nameRules = {
  pattern: {
    value: /^[A-Za-z\s'-]+$/,
    message: 'Only letters are allowed',
  },
}

export default function Settings() {
  const { user, loading } = useSelector((s) => s.auth)
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const [changing, setChanging] = useState(false)
  const [errorMsg, setErrorMsg] = useState(null)
  const [success, setSuccess] = useState(null)
  const [editingProfile, setEditingProfile] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [deleting, setDeleting] = useState(false)

  const {
    register: field, handleSubmit, watch, reset,
    formState: { errors },
  } = useForm({ mode: 'onTouched' })

  const {
    register: profileField, handleSubmit: handleProfileSubmit, reset: resetProfile,
    formState: { errors: profileErrors },
  } = useForm({ 
    mode: 'onTouched',
    defaultValues: {
      first_name: user?.first_name || '',
      last_name: user?.last_name || '',
      date_of_birth: user?.date_of_birth || '',
    }
  })

  const newPassword = watch('new_password')
  const avatarUrl = `https://ui-avatars.com/api/?name=${user?.first_name || 'U'}&background=6366f1&color=fff&size=128`

  useEffect(() => { reset() }, [reset])
  useEffect(() => { resetProfile() }, [resetProfile, user])

  const onSubmit = async (data) => {
    setChanging(true)
    setErrorMsg(null)
    setSuccess(null)

    try {
      await changePassword({
        old_password: data.old_password,
        new_password: data.new_password,
        confirm_password: data.confirm_password,
      })
      setSuccess('Password changed successfully!')
      reset()
      setTimeout(() => setSuccess(null), 5000)
    } catch (err) {
      setErrorMsg(getApiError(err))
    } finally {
      setChanging(false)
    }
  }

  const onProfileSubmit = async (data) => {
    const profileData = {}
    if (data.first_name !== user?.first_name) profileData.first_name = data.first_name
    if (data.last_name !== user?.last_name) profileData.last_name = data.last_name
    if (data.date_of_birth !== user?.date_of_birth) profileData.date_of_birth = data.date_of_birth
    
    if (Object.keys(profileData).length === 0) {
      setSuccess('No changes made.')
      return
    }

    try {
      await dispatch(editProfile(profileData)).unwrap()
      setSuccess('Profile updated successfully!')
      setEditingProfile(false)
      setTimeout(() => setSuccess(null), 5000)
    } catch (err) {
      setErrorMsg(err || 'Failed to update profile.')
    }
  }

  const handleDeleteAccount = async () => {
    setDeleting(true)
    setErrorMsg(null)
    try {
      await dispatch(deleteAccount({ confirmationText: deleteConfirm })).unwrap()
      navigate('/login', { replace: true })
    } catch (err) {
      setErrorMsg(err || 'Failed to delete account.')
    } finally {
      setDeleting(false)
      setDeleteOpen(false)
      setDeleteConfirm('')
    }
  }

  return (
    <div className="w-full">
      <div className="mx-auto max-w-4xl">
        
        <header className="mb-8">
          <h2 className="page-title">Account Settings</h2>
          <p className="text-gray-500 mt-1 flex items-center gap-2 text-sm">
            <i className="fas fa-user-shield text-brand-500"></i>
            Manage your identity and security preferences
          </p>
        </header>

        {success && <Alert type="success" message={success} className="mb-6 rounded-lg shadow-sm" />}
        {errorMsg && <Alert type="error" message={errorMsg} className="mb-6 rounded-lg shadow-sm" />}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          <div className="lg:col-span-2 space-y-6">
            <div className="card rounded-lg p-8 shadow-sm">
              <div className="flex justify-between items-center mb-8">
                <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                  <i className="fas fa-id-card text-brand-500"></i> Personal Info
                </h3>
                {!editingProfile && (
                  <button 
                    onClick={() => setEditingProfile(true)}
                    className="text-xs font-bold text-brand-600 bg-brand-50 px-4 py-2 rounded-xl hover:bg-brand-100 transition-colors"
                  >
                    Edit Profile
                  </button>
                )}
              </div>

              {!editingProfile ? (
                <div className="flex flex-col md:flex-row gap-8 items-start">
                  <div className="relative">
                    <img src={avatarUrl} className="w-24 h-24 rounded-full border-4 border-brand-50 shadow-inner" alt="User" />
                  </div>
                  
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-y-6 gap-x-12">
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Full Name</p>
                      <p className="font-bold text-gray-800">{user?.first_name} {user?.last_name || '—'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Email Address</p>
                      <p className="font-bold text-gray-800 truncate">{user?.email}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Birth Date</p>
                      <p className="font-bold text-gray-800">
                        {user?.date_of_birth ? new Date(user.date_of_birth).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'Not set'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Member Since</p>
                      <p className="font-bold text-gray-800">{new Date(user?.date_joined).getFullYear()}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleProfileSubmit(onProfileSubmit)} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input label="First Name" {...profileField('first_name', nameRules)} error={profileErrors.first_name?.message} className="bg-gray-50" />
                    <Input label="Last Name" {...profileField('last_name', nameRules)} error={profileErrors.last_name?.message} className="bg-gray-50" />
                  </div>
                  <Input label="Birth Date" type="date" {...profileField('date_of_birth')} error={profileErrors.date_of_birth?.message} className="bg-gray-50" onClick={(e) => e.target.showPicker && e.target.showPicker()} />
                  
                  <div className="flex gap-3 pt-4">
                    <button type="submit" disabled={loading} className="btn-primary">
                      {loading ? <i className="fas fa-spinner fa-spin mr-2"></i> : 'Save Changes'}
                    </button>
                    <button type="button" onClick={() => setEditingProfile(false)} className="px-6 py-3 text-gray-400 font-bold text-sm hover:text-gray-600">
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>

            <div className="card rounded-lg p-8 shadow-sm">
              <h3 className="text-xl font-bold text-gray-800 mb-8 flex items-center gap-2">
                <i className="fas fa-lock text-orange-400"></i> Security & Password
              </h3>
              
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                <div className="grid grid-cols-1 gap-5">
                  <Input
                    label="Current Password"
                    type="password"
                    placeholder="••••••••"
                    autoComplete="new-password"
                    {...field('old_password', { required: 'Required' })}
                    error={errors.old_password?.message}
                    className="bg-gray-50"
                  />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <Input
                      label="New Password"
                      type="password"
                      placeholder="••••••••"
                      {...field('new_password', passwordRules)}
                      error={errors.new_password?.message}
                      className="bg-gray-50"
                    />
                    <Input
                      label="Confirm Password"
                      type="password"
                      placeholder="••••••••"
                      {...field('confirm_password', {
                        required: 'Required',
                        validate: (v) => v === newPassword || 'Mismatch',
                      })}
                      error={errors.confirm_password?.message}
                      className="bg-gray-50"
                    />
                  </div>
                </div>

                <div className="pt-4">
                  <button type="submit" disabled={changing} className="px-8 py-4 bg-gray-900 text-white rounded-lg font-bold text-sm  hover:bg-black transition-all flex items-center gap-2">
                    {changing ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-shield-halved"></i>}
                    Update Password
                  </button>
                </div>
              </form>
            </div>
          </div>

          <div className="space-y-6">
            <div className="card p-6">
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1 flex items-center gap-2">
                <i className="fas fa-palette text-brand-500 dark:text-indigo-300"></i>
                Appearance
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                Switch between light and dark mode. Dark uses layered indigo surfaces with soft violet accents.
              </p>
              <ThemeToggle variant="full" />
            </div>

            <div className="card p-6 border border-red-200/70 dark:border-red-500/25">
              <h3 className="text-base font-semibold text-red-600 dark:text-red-400 mb-1 flex items-center gap-2">
                <i className="fas fa-triangle-exclamation" aria-hidden />
                Danger Zone
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                Permanently delete your account and all associated files, folders, shares, and submissions.
              </p>
              <Button variant="danger" className="w-full" onClick={() => setDeleteOpen(true)}>
                <i className="fas fa-user-slash" aria-hidden />
                Delete Account
              </Button>
            </div>
          </div>

        </div>
      </div>

      {deleteOpen && (
        <div className="modal-overlay">
          <div className="modal-panel max-w-md">
            <div className="modal-header">
              <h4 className="text-base font-semibold text-gray-900 dark:text-gray-100">Delete account</h4>
              <button type="button" className="btn-ghost btn-sm" onClick={() => setDeleteOpen(false)}>
                <i className="fas fa-times" aria-hidden />
              </button>
            </div>
            <div className="modal-body space-y-3">
              <p className="text-sm text-gray-600 dark:text-gray-300">
                This action is irreversible. To confirm, type <span className="font-semibold">delete</span>.
              </p>
              <Input
                label="Confirmation"
                placeholder='Type "delete"'
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
              />
            </div>
            <div className="modal-footer">
              <Button variant="ghost" onClick={() => setDeleteOpen(false)} disabled={deleting}>Cancel</Button>
              <Button
                variant="danger"
                onClick={handleDeleteAccount}
                loading={deleting}
                disabled={deleteConfirm.trim().toLowerCase() !== 'delete'}
              >
                Confirm delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}