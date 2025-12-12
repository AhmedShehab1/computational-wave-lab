import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { SafeModeBanner } from '@/components/SafeModeBanner'
import { ToastStack } from '@/components/ToastStack'
import { UploadPanel } from '@/components/UploadPanel'
import { MixerControls } from '@/components/MixerControls'
import { RegionControls } from '@/components/RegionControls'
import { useWorkerSupport } from '@/hooks/useWorkerSupport'
import { useGlobalStore } from '@/state/globalStore'
import { fftWorkerPool, imageWorkerPool } from '@/workers/pool'
import type { FileMeta, FileSlot, MixerJobPayload, OutputViewportId } from '@/types'

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
  const setFiles = useGlobalStore((s) => s.setFiles)
  const setImageData = useGlobalStore((s) => s.setImageData)
  const setNormalizedSize = useGlobalStore((s) => s.setNormalizedSize)
  const pushToast = useGlobalStore((s) => s.pushToast)
  const images = useGlobalStore((s) => s.images)
  const mixerConfig = useGlobalStore((s) => s.mixerConfig)
  const regionMask = useGlobalStore((s) => s.regionMask)
  const brightnessConfig = useGlobalStore((s) => s.brightnessConfig)
  const setOutputImage = useGlobalStore((s) => s.setOutputImage)
  const setOutputStatus = useGlobalStore((s) => s.setOutputStatus)
  const outputStatus = useGlobalStore((s) => s.outputStatus)
  const [loadingSlots, setLoadingSlots] = useState<Record<FileSlot, boolean>>({
    A: false,
    B: false,
    C: false,
    D: false,
  })

  const handleFilesAccepted = useCallback(
    async (files: File[]) => {
      if (safeMode.active) {
        pushToast({ id: crypto.randomUUID(), type: 'warning', message: 'Safe mode enabled. Uploads are paused.' })
        return
      }

      const slots: FileSlot[] = ['A', 'B', 'C', 'D']
      const metas: FileMeta[] = files.slice(0, slots.length).map((file, idx) => ({
        id: slots[idx],
        name: file.name,
        size: file.size,
        type: file.type,
        lastModified: file.lastModified,
      }))
      setFiles(metas)

      // First pass: decode to determine sizes
      const firstPassResults = await Promise.all(
        metas.map(async (meta, idx) => {
          const file = files[idx]
          if (!file) return null
          setLoadingSlots((prev) => ({ ...prev, [meta.id]: true }))
          const buffer = await file.arrayBuffer()
          const jobId = `img-${meta.id}-${crypto.randomUUID()}`
          try {
            const result = (await imageWorkerPool.enqueue({
              id: jobId,
              payload: { fileArrayBuffer: buffer, fileType: meta.type },
            })) as { width: number; height: number; pixels: Uint8ClampedArray }
            return { slot: meta.id, buffer, fileType: meta.type, ...result }
          } catch (err) {
            pushToast({
              id: crypto.randomUUID(),
              type: 'error',
              message: err instanceof Error ? err.message : 'Image worker error',
            })
            setImageData(meta.id, null)
            setLoadingSlots((prev) => ({ ...prev, [meta.id]: false }))
            return null
          }
        }),
      )

      const successful = firstPassResults.filter((r): r is NonNullable<typeof r> => Boolean(r))
      if (!successful.length) {
        setLoadingSlots({ A: false, B: false, C: false, D: false })
        return
      }

      const minWidth = Math.min(...successful.map((r) => r.width))
      const minHeight = Math.min(...successful.map((r) => r.height))

      const normalizedResults = await Promise.all(
        successful.map(async (entry) => {
          if (entry.width === minWidth && entry.height === minHeight) {
            return entry
          }
          const jobId = `img-${entry.slot}-${crypto.randomUUID()}`
          const resized = (await imageWorkerPool.enqueue({
            id: jobId,
            payload: {
              fileArrayBuffer: entry.buffer,
              fileType: entry.fileType,
              targetSize: { width: minWidth, height: minHeight },
            },
          })) as { width: number; height: number; pixels: Uint8ClampedArray }
          return { ...resized, slot: entry.slot, buffer: entry.buffer, fileType: entry.fileType }
        }),
      )

      normalizedResults.forEach((res) => {
        if (!res) return
        setImageData(res.slot, { width: res.width, height: res.height, pixels: res.pixels })
      })

      setLoadingSlots({ A: false, B: false, C: false, D: false })

      if (normalizedResults.length) {
        setNormalizedSize({ width: minWidth, height: minHeight })
        pushToast({
          id: crypto.randomUUID(),
          type: 'success',
          message: `Images normalized to ${minWidth}×${minHeight}`,
        })
      }
    },
    [pushToast, safeMode.active, setFiles, setImageData, setNormalizedSize],
  )

  useEffect(() => {
    if (!supported) setSafeMode({ active: true })
  }, [supported, setSafeMode])

  const runMix = useCallback(
    async (target: OutputViewportId) => {
      if (safeMode.active) return
      const loadedImages = Object.entries(images)
        .map(([id, data]) =>
          data ? { id: id as FileSlot, width: data.width, height: data.height, pixels: data.pixels } : null,
        )
        .filter((v): v is NonNullable<typeof v> => Boolean(v))
      if (!loadedImages.length) {
        pushToast({ id: crypto.randomUUID(), type: 'warning', message: 'No images loaded' })
        return
      }
      setOutputStatus(target, 'mixing')
      const jobId = `fft-${target}-${crypto.randomUUID()}`
      const payload: MixerJobPayload = {
        images: loadedImages,
        weights: mixerConfig,
        regionMask,
        brightnessConfig,
        targetViewport: target,
        fftMode: 'js',
      }
      try {
        const result = (await fftWorkerPool.enqueue({ id: jobId, payload })) as {
          width: number
          height: number
          pixels: Uint8ClampedArray
        }
        setOutputImage(target, result)
        pushToast({
          id: crypto.randomUUID(),
          type: 'success',
          message: `Mix completed for output ${target}`,
        })
        setOutputStatus(target, 'idle')
      } catch (err) {
        setOutputStatus(target, 'error')
        pushToast({
          id: crypto.randomUUID(),
          type: 'error',
          message: err instanceof Error ? err.message : 'Mix failed',
        })
      }
    },
    [brightnessConfig, images, mixerConfig, pushToast, regionMask, safeMode.active, setOutputImage, setOutputStatus],
  )

  return (
    <div style={shellStyle}>
      <SafeModeBanner
        active={safeMode.active}
        message={safeMode.reason || 'Hardware Acceleration Disabled. Simulation paused.'}
        helpUrl="https://example.com/troubleshooting"
      />
      <ToastStack />
      <header style={headerStyle}>
        <div>Quantum Wave Research — Workspace</div>
        <div>Top Bar Placeholder</div>
      </header>
      <main style={workspacesStyle}>
        <section style={panelStyle}>
          <h2>Fourier Mixer</h2>
          <UploadPanel onFilesAccepted={handleFilesAccepted} />
          <MixerControls />
          <RegionControls />
          <button onClick={() => runMix(1)} disabled={safeMode.active}>
            {outputStatus[1] === 'mixing' ? 'Mixing…' : 'Run Mix → Output 1'}
          </button>
          <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>
            Loading: {Object.entries(loadingSlots).filter(([, v]) => v).map(([k]) => k).join(', ') || 'idle'}
          </p>
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
          <div style={{ marginLeft: 'auto', width: '260px' }}>Educational Explain Overlay (TODO)</div>
          <div style={{ marginLeft: 'auto', width: '260px' }}>Undo/Redo Controls (TODO)</div>
        </div>
      </main>
    </div>
  )
}
