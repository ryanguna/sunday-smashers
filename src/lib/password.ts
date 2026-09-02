/**
 * Password rules, in one place.
 *
 * Sign-up validated inline ("Use at least 8 characters"), and nothing else
 * validated at all because nothing else could change a password. Now that
 * `/account/password` exists, the same rule has to hold in two places — and a
 * rule duplicated in two places is a rule that will disagree with itself.
 *
 * The minimum matches Supabase's own default (`GOTRUE_PASSWORD_MIN_LENGTH`),
 * so a password this accepts is never rejected by the server afterwards.
 */

export const MIN_PASSWORD_LENGTH = 8

export interface PasswordIssues {
  password?: string
  confirmPassword?: string
}

/**
 * Validates a new password and its confirmation.
 *
 * `current` is optional: when supplied (the change-password form knows it),
 * reusing it is rejected, because "change your password" that accepts the
 * password you already have has not changed anything.
 */
export function validateNewPassword(
  password: string,
  confirmPassword: string,
  current?: string,
): PasswordIssues {
  const issues: PasswordIssues = {}

  if (password.length < MIN_PASSWORD_LENGTH) {
    issues.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`
  } else if (current !== undefined && current.length > 0 && password === current) {
    issues.password = 'That’s the password you already have. Pick a different one.'
  }

  if (confirmPassword !== password) {
    issues.confirmPassword = 'Passwords don’t match.'
  }

  return issues
}

export function hasIssues(issues: PasswordIssues): boolean {
  return Object.keys(issues).length > 0
}
