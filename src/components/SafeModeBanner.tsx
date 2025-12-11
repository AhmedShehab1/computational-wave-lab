interface SafeModeBannerProps {
  active: boolean
  message: string
  helpUrl?: string
}

export function SafeModeBanner({ active, message, helpUrl }: SafeModeBannerProps) {
  if (!active) return null

  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        padding: '10px 14px',
        background: 'rgba(255, 92, 108, 0.16)',
        color: 'var(--text-primary)',
        borderBottom: '1px solid rgba(255, 92, 108, 0.4)',
      }}
      role="status"
      aria-live="assertive"
    >
      <span style={{ fontWeight: 600 }}>Safe Mode:</span> {message}{' '}
      {helpUrl ? (
        <a href={helpUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-teal)' }}>
          Troubleshooting Guide
        </a>
      ) : null}
    </div>
  )
}
