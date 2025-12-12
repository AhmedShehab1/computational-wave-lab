import { useEffect } from 'react'
import { useGlobalStore } from '@/state/globalStore'

export function ToastStack() {
  const toasts = useGlobalStore((s) => s.toasts)
  const removeToast = useGlobalStore((s) => s.removeToast)

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
      aria-live="assertive"
      aria-atomic="true"
      role="status"
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
        >
          {toast.message}
        </div>
      ))}
    </div>
  )
}
