// Avoid static importing Vocs components during SSR; dynamically load on client
import { useEffect, useState, type ComponentType } from 'react'

type BuilderGuideAlertProps = {
  className?: string
}

export default function BuilderGuideAlert({ className }: BuilderGuideAlertProps) {
  const [CalloutCmp, setCalloutCmp] = useState<ComponentType<any> | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const mod = await import('vocs/components')
        if (mounted && mod?.Callout) setCalloutCmp(() => mod.Callout)
      } catch {
        // no-op; fallback styles will be used
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    mounted && CalloutCmp ? (
      <CalloutCmp className={className ?? ''} type="info">
        <strong>We strongly recommend</strong> using Cursor, Codex, Claude Code, or any other LLM-powered code editor. You may be surprised by how far you can get without writing code yourself. <a style={{ textDecoration: 'underline' }} href="/builder-guide/getting-started/get-started">See Get Started</a>
      </CalloutCmp>
    ) : null
  )
}


