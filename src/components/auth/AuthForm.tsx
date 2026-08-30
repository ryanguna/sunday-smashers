/**
 * Barrel + primary named export for the shared auth form UI. Other agents
 * building on top of auth (e.g. profile edit screens) should import the
 * pieces they need from here rather than reaching into individual files.
 */
export { AuthShell } from './AuthShell'
export { FieldWrapper, TextField, SelectField } from './FormField'
export { AlertBanner, DemoModeNotice } from './DemoModeNotice'
