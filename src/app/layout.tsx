import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Sunday Smashers — Christmas Mini Tournament',
  description: 'Smash. Compete. Celebrate. The Sunday Smashers Christmas Mini Tournament.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
