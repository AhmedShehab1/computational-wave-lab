import { useEffect } from 'react'
import { useGlobalStore } from '@/state/globalStore'
import { ToastNotification } from './ui/ToastNotification'

// Keyframe animation for toast entry
const keyframeStyle = `
@keyframes slideInRight {
  from {
    opacity: 0;
    transform: translateX(100%);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes fadeOut {
  from {
    opacity: 1;
    transform: translateX(0);
  }
  to {
    opacity: 0;
    transform: translateX(100%);
  }
}
`;

export function ToastStack() {
  const toasts = useGlobalStore((s) => s.toasts)
  const removeToast = useGlobalStore((s) => s.removeToast)

  const hasAssertive = toasts.some((t) => t.type === 'error' || t.type === 'warning')

  useEffect(() => {
    const timers = toasts.map((toast) =>
      setTimeout(() => removeToast(toast.id), toast.duration ?? 4000),
    )
    return () => {
      timers.forEach(clearTimeout)
    }
  }, [removeToast, toasts])

  if (!toasts.length) return null

  return (
    <>
      {/* Inject keyframe animations */}
      <style>{keyframeStyle}</style>
      
      <div
        style={{
          position: 'fixed',
          top: 16,
          right: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          zIndex: 9999,
        }}
        aria-live={hasAssertive ? 'assertive' : 'polite'}
        aria-atomic="true"
      >
        {toasts.map((toast) => (
          <ToastNotification
            key={toast.id}
            toast={toast}
            onDismiss={removeToast}
          />
        ))}
      </div>
    </>
  )
}
