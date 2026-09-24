/**
 * Display strings and browser autofill hints for the cabinet email form.
 * Kept in a dedicated module so the form component stays declarative and the
 * literals have a single, clearly non-secret home (these are UI texts and
 * standard HTML autocomplete tokens, not credentials of any kind).
 */
export const PASSWORD_HINT = 'Пароль'
export const NEW_PASSWORD_HINT = 'Пароль (от 8 символов)'

export const PASSWORD_AUTOCOMPLETE = {
  register: 'new-password',
  login: 'current-password',
} as const
