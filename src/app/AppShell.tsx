import { useEffect, type CSSProperties } from 'react'
import { SafeModeBanner } from '@/components/SafeModeBanner'
import { useWorkerSupport } from '@/hooks/useWorkerSupport'
import { useGlobalStore } from '@/state/globalStore'

const shellStyle: CSSProperties = {
  minHeight: '100vh',
  display: 'grid',
  gridTemplateRows: 'auto 1fr',
  background: 'var(--bg-navy)',
  color: 'var(--text-primary)',
}

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '12px 20px',
  borderBottom: '1px solid var(--panel-border)',
  background: 'var(--panel)',
}

const workspacesStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 'var(--space-6)',
  padding: 'var(--space-6)',
  position: 'relative',
}

const panelStyle: CSSProperties = {
  background: 'var(--panel)',
  border: '1px solid var(--panel-border)',
  borderRadius: 'var(--radius-md)',
  padding: 'var(--space-4)',
  minHeight: '60vh',
  boxShadow: 'var(--shadow-soft)',
}

export function AppShell() {
  const { supported } = useWorkerSupport()
  const safeMode = useGlobalStore((s) => s.safeMode)
  const setSafeMode = useGlobalStore((s) => s.setSafeMode)

  useEffect(() => {
    if (!supported) setSafeMode(true)
  }, [supported, setSafeMode])

  return (
    <div style={shellStyle}>
      <SafeModeBanner
        active={safeMode}
        message="Hardware Acceleration Disabled. Simulation paused."
        helpUrl="https://example.com/troubleshooting"
      />
      <header style={headerStyle}>
        <div>Quantum Wave Research — Workspace</div>
        <div>Top Bar Placeholder</div>
      </header>
      <main style={workspacesStyle}>
        <section style={panelStyle}>
          <h2>Fourier Mixer</h2>
          <p>Placeholder workspace region for Part A.</p>
        </section>
        <section style={panelStyle}>
          <h2>Beamforming Simulator</h2>
          <p>Placeholder workspace region for Part B.</p>
        </section>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            display: 'grid',
            alignContent: 'flex-start',
            gap: 'var(--space-2)',
          }}
          aria-hidden
        >
          <div style={{ marginLeft: 'auto', width: '260px' }}>ToastStack (TODO)</div>
          <div style={{ marginLeft: 'auto', width: '260px' }}>Educational Explain Overlay (TODO)</div>
          <div style={{ marginLeft: 'auto', width: '260px' }}>Undo/Redo Controls (TODO)</div>
        </div>
      </main>
    </div>
  )
}
