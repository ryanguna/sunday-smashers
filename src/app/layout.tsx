import type { Metadata } from 'next'
import { Baloo_2, Nunito, Pacifico } from 'next/font/google'
import './globals.css'

// Heavy geometric sans for headings — bold, rounded, friendly.
const baloo = Baloo_2({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-heading',
  display: 'swap',
})

// Clean, highly legible sans for body copy.
const nunito = Nunito({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-body',
  display: 'swap',
})

// Playful handwritten script for the "Sunday" style flourish.
const pacifico = Pacifico({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-script',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Sunday Smashers — Christmas Mini Tournament',
  description: 'Smash. Compete. Celebrate. The Sunday Smashers Christmas Mini Tournament.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${baloo.variable} ${nunito.variable} ${pacifico.variable}`}>
      <body>{children}</body>
    </html>
  )
}
