export function mapAuthError(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'Authentication failed. Please try again.'
  }

  const details = [error.message, (error as { code?: string }).code]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  if (
    details.includes('auth/invalid-credential') ||
    details.includes('auth/invalid-login-credentials') ||
    details.includes('auth/wrong-password') ||
    details.includes('auth/user-not-found')
  ) {
    return 'Invalid email or password.'
  }
  if (details.includes('auth/email-already-in-use')) {
    return 'This email is already registered.'
  }
  if (details.includes('auth/weak-password')) {
    return 'Password is too weak. Use at least 6 characters.'
  }
  if (details.includes('auth/popup-closed-by-user')) {
    return 'Google sign-in was cancelled.'
  }
  if (details.includes('auth/popup-blocked')) {
    return 'Popup blocked by browser. Allow popups for this site and try again.'
  }
  if (details.includes('auth/unauthorized-domain')) {
    return 'This domain is not authorized in Firebase Auth. Add 127.0.0.1 and localhost in Authorized domains.'
  }
  if (details.includes('auth/operation-not-allowed')) {
    return 'Sign-in method is not enabled in Firebase Auth. Enable Email/Password and Google provider in console.'
  }
  if (details.includes('auth/account-exists-with-different-credential')) {
    return 'Account exists with a different sign-in method. Try email/password.'
  }
  if (
    details.includes('permission-denied') ||
    details.includes('missing or insufficient permissions')
  ) {
    return 'Signed in, but profile sync was blocked by Firestore rules. Update Firestore rules for user_profiles.'
  }
  if (details.includes('firebase is not configured')) {
    return error.message
  }
  return error.message || 'Authentication failed. Please try again.'
}
