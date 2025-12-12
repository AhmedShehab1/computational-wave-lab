import { useEffect } from 'react'
import { useGlobalStore } from '@/state/globalStore'

export function ToastStack() {
  const toasts = useGlobalStore((s) => s.toasts)
  const removeToast = useGlobalStore((s) => s.removeToast)

  const hasAssertive = toasts.some((t) => t.type === 'error' || t.type === 'warning')

  useEffect(() => {
    const timers = toasts.map((toast) =>
      setTimeout(() => removeToast(toast.id), toast.duration ?? 2500),
    )
    return () => {
      timers.forEach(clearTimeout)
    }
  }, [removeToast, toasts])

  if (!toasts.length) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: 16,
        right: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        zIndex: 20,
      }}
      aria-live={hasAssertive ? 'assertive' : 'polite'}
      aria-atomic="true"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          style={{
            padding: '10px 12px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--panel)',
            border: '1px solid var(--panel-border)',
            color: 'var(--text-primary)',
            boxShadow: 'var(--shadow-soft)',
            minWidth: 220,
          }}
          role={toast.type === 'error' || toast.type === 'warning' ? 'alert' : 'status'}
          aria-live={toast.type === 'error' || toast.type === 'warning' ? 'assertive' : 'polite'}
        >
          {toast.message}
        </div>
      ))}
    </div>
  )
}
