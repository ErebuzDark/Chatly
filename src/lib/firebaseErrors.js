const MESSAGES = {
  'auth/email-already-in-use': 'An account with this email already exists.',
  'auth/invalid-email': 'That email address looks invalid.',
  'auth/weak-password': 'Password is too weak. Use at least 8 characters.',
  'auth/invalid-credential': 'Incorrect email or password.',
  'auth/wrong-password': 'Incorrect password.',
  'auth/requires-recent-login': 'Please log out and sign back in before performing this sensitive action.',
  'auth/user-disabled': 'This account has been disabled.',
  'auth/too-many-requests': 'Too many attempts. Please wait a moment and try again.',
  'auth/network-request-failed': 'Network error. Check your connection.',
  'app/username-taken': 'That username is already taken.',
  'app/blocked': 'You cannot interact with this user.',
  'app/invalid-invite': 'This group invite link is invalid or expired.',
  'permission-denied': 'You do not have permission to do that.',
}

export function getErrorMessage(error) {
  if (!error) return 'Something went wrong. Please try again.'
  return MESSAGES[error.code] ?? error.message ?? 'Something went wrong. Please try again.'
}
