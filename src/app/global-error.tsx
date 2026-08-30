'use client'

import { useEffect } from 'react'

/**
 * Catches errors thrown by the root layout itself. When this renders the normal
 * layout is gone, so it deliberately avoids importing shared components, design
 * tokens or `next/font` variables — none of them are guaranteed to be available.
 * Everything here is inline and self-contained.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem 1rem',
          textAlign: 'center',
          background: 'linear-gradient(160deg, #fff7fb 0%, #f5f3ff 45%, #eaf4fb 100%)',
          fontFamily:
            'ui-rounded, "Nunito", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          color: '#3a1f4d',
        }}
      >
        <div style={{ maxWidth: '32rem' }}>
          <div aria-hidden="true" style={{ fontSize: '3rem', lineHeight: 1 }}>
            🎄🏸
          </div>
          <h1 style={{ margin: '1rem 0 0', fontSize: '2rem', fontWeight: 800 }}>
            The whole court went dark
          </h1>
          <p style={{ margin: '1rem 0 0', color: '#5b4a68', lineHeight: 1.6 }}>
            Something broke badly enough to take the page down with it. Reloading usually sorts it
            out.
          </p>
          {error.digest && (
            <p style={{ margin: '0.75rem 0 0', fontSize: '0.75rem', color: '#5b4a68' }}>
              Reference: <code>{error.digest}</code>
            </p>
          )}
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: '2rem',
              cursor: 'pointer',
              border: 0,
              borderRadius: '999px',
              padding: '0.75rem 1.75rem',
              fontSize: '1rem',
              fontWeight: 700,
              color: '#ffffff',
              background: 'linear-gradient(120deg, #b5196a 0%, #663dd5 100%)',
            }}
          >
            Reload the page
          </button>
        </div>
      </body>
    </html>
  )
}
