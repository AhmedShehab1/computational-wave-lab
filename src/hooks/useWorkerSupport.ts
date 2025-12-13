import { useSyncExternalStore, useMemo } from 'react'
import { useGlobalStore } from '@/state/globalStore'

// Check worker support once at module load
let workerSupportResult: { supported: boolean; error: Error | null } | null = null

function checkWorkerSupport(): { supported: boolean; error: Error | null } {
  if (workerSupportResult) return workerSupportResult
  
  try {
    const blob = new Blob([''], { type: 'application/javascript' })
    const url = URL.createObjectURL(blob)
    const worker = new Worker(url)
    worker.terminate()
    URL.revokeObjectURL(url)
    workerSupportResult = { supported: true, error: null }
  } catch (err) {
    const e = err instanceof Error ? err : new Error('Worker unsupported')
    workerSupportResult = { supported: false, error: e }
  }
  
  return workerSupportResult
}

// Run check immediately
checkWorkerSupport()

export function useWorkerSupport() {
  const setSafeMode = useGlobalStore((s) => s.setSafeMode)
  
  // Use sync external store to get the cached result without triggering re-renders
  const result = useSyncExternalStore(
    () => () => {}, // No subscription needed - value is static
    () => checkWorkerSupport(),
    () => checkWorkerSupport()
  )
  
  // Set safe mode if workers not supported (only once, memoized)
  useMemo(() => {
    if (!result.supported && result.error) {
      setSafeMode({ active: true, reason: result.error.message })
    }
  }, [result.supported, result.error, setSafeMode])

  return result
}
