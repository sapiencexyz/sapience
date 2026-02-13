import { Analytics } from '@vercel/analytics/react'
import type { ReactNode } from 'react'

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <Analytics />
    </>
  )
}
