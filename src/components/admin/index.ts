/**
 * Public surface of the admin console components.
 *
 * Other agents building admin sections should import from here. In
 * particular `ADMIN_NAV` (in `./nav`) is the one place to register a new
 * admin route so it appears in the sidebar and the mobile drawer.
 *
 * `./data` and `./actions` are intentionally NOT re-exported: they are
 * server-only (Supabase + `next/cache`) and must be imported directly from
 * a Server Component / Server Action so they never end up in a client
 * bundle.
 */

export * from './nav'
export * from './AdminShell'
export * from './AdminUI'
export * from './AdminFilterBar'
export * from './RegistrationsClient'
export * from './PaymentsClient'
