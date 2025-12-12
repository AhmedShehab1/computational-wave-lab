import { useEffect, useState } from 'react'
import { useGlobalStore } from '@/state/globalStore'

export function useWorkerSupport() {
  const [supported, setSupported] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const setSafeMode = useGlobalStore((s) => s.setSafeMode)

  useEffect(() => {
    try {
      const blob = new Blob([''], { type: 'application/javascript' })
      const url = URL.createObjectURL(blob)
      const worker = new Worker(url)
      worker.terminate()
      URL.revokeObjectURL(url)
      setSupported(true)
    } catch (err) {
      setSupported(false)
      const e = err instanceof Error ? err : new Error('Worker unsupported')
      setError(e)
      setSafeMode({ active: true, reason: e.message })
    }
  }, [setSafeMode])

  return { supported, error }
}
