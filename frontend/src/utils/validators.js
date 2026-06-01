// All rules mirror backend serializer validation exactly

export const emailRules = {
  required: 'Email is required.',
  pattern: {
    value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    message: 'Enter a valid email address.',
  },
}

export const passwordRules = {
  required: 'Password is required.',
  minLength: { value: 8, message: 'Password must be at least 8 characters.' },
  validate: {
    hasLetter:  (v) => /[a-zA-Z]/.test(v)     || 'Must contain at least one letter.',
    hasNumber:  (v) => /\d/.test(v)            || 'Must contain at least one number.',
    hasSpecial: (v) => /[^A-Za-z0-9]/.test(v) || 'Must contain at least one special character.',
  },
}

export const firstNameRules = {
  required: 'First name is required.',
  validate: (v) =>
    /^[A-Za-z\s'-]{2,}$/.test(v.trim()) || 'First name: letters only, minimum 2 characters.',
}

export const lastNameRules = {
  required: 'Last name is required.',
  validate: (v) =>
    /^[A-Za-z\s'-]{1,}$/.test(v.trim()) || 'Last name: letters only.',
}

export const dateOfBirthRules = {
  required: 'Date of birth is required.',
  validate: (v) => {
    const dob = new Date(v)
    const today = new Date()
    if (dob > today) return 'Date of birth cannot be in the future.'
    const age = Math.floor((today - dob) / (365.25 * 24 * 60 * 60 * 1000))
    if (age < 13) return 'You must be at least 13 years old.'
    return true
  },
}

// Extract a readable message from any API error
export const getApiError = (err) =>
  err?.response?.data?.message ||
  err?.response?.data?.detail ||
  err?.message ||
  'Something went wrong. Please try again.'