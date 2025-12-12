import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { SafeModeBanner } from '@/components/SafeModeBanner'
import { ToastStack } from '@/components/ToastStack'
import { UploadPanel } from '@/components/UploadPanel'
import { MixerControls } from '@/components/MixerControls'
import { RegionControls } from '@/components/RegionControls'
import { AdaptiveCanvas } from '@/components/AdaptiveCanvas'
import { SteeringJoystick } from '@/components/SteeringJoystick'
import { OutputViewport } from '@/components/OutputViewport'
import { useWorkerSupport } from '@/hooks/useWorkerSupport'
import { useGlobalStore } from '@/state/globalStore'
import { beamWorkerPool, fftWorkerPool, imageWorkerPool } from '@/workers/pool'
import { mapHeatmapToImageData } from '@/utils/colormap'
import { computeRowSpectrum } from '@/utils/spectrum'
import { fftMode } from '@/config/runtime'
import type { BeamJobPayload, FileMeta, FileSlot, MixerJobPayload, OutputViewportId } from '@/types'

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
  const outputImages = useGlobalStore((s) => s.outputImages)
  const mixerProgress = useGlobalStore((s) => s.mixerProgress)
  const setMixerProgress = useGlobalStore((s) => s.setMixerProgress)
  const snapshots = useGlobalStore((s) => s.snapshots)
  const compareSelection = useGlobalStore((s) => s.compareSelection)
  const setCompareSelection = useGlobalStore((s) => s.setCompareSelection)
  const addSnapshot = useGlobalStore((s) => s.addSnapshot)
  const beamConfig = useGlobalStore((s) => s.beamConfig)
  const setBeamConfig = useGlobalStore((s) => s.setBeamConfig)
  const beamResult = useGlobalStore((s) => s.beamResult)
  const setBeamResult = useGlobalStore((s) => s.setBeamResult)
  const beamStatus = useGlobalStore((s) => s.beamStatus)
  const setBeamStatus = useGlobalStore((s) => s.setBeamStatus)
  const beamConfigRef = useRef(beamConfig)
  const beamDebounce = useRef<number | null>(null)
  const [showSpectrum, setShowSpectrum] = useState(false)
  const [spectrum, setSpectrum] = useState<Record<OutputViewportId, Float32Array | null>>({ 1: null, 2: null })
  const [loadingSlots, setLoadingSlots] = useState<Record<FileSlot, boolean>>({
    A: false,
    B: false,
    C: false,
    D: false,
  })

  useEffect(() => {
    beamConfigRef.current = beamConfig
  }, [beamConfig])

  const handleFilesAccepted = useCallback(
    async (files: File[]) => {
      if (safeMode.active) {
        pushToast({ id: crypto.randomUUID(), type: 'warning', message: 'Safe mode enabled. Uploads are paused.' })
        return
      }

      const validFiles = files.filter((file) => file.type.startsWith('image/'))
      if (!validFiles.length) {
        pushToast({ id: crypto.randomUUID(), type: 'error', message: 'Only image files are supported.' })
        return
      }

      const slots: FileSlot[] = ['A', 'B', 'C', 'D']
      const metas: FileMeta[] = validFiles.slice(0, slots.length).map((file, idx) => ({
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
          const file = validFiles[idx]
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

  useEffect(() => {
    if (!showSpectrum) {
      setSpectrum({ 1: null, 2: null })
      return
    }
    const next: Record<OutputViewportId, Float32Array | null> = { 1: null, 2: null }
    ;(['1', '2'] as const).forEach((key: '1' | '2') => {
      const id = Number(key) as OutputViewportId
      const img = outputImages[id]
      if (img) {
        next[id] = computeRowSpectrum(img.pixels, img.width, img.height)
      }
    })
    setSpectrum(next)
  }, [outputImages, showSpectrum])

  const runMix = useCallback(
    async (target: OutputViewportId) => {
      if (safeMode.active) {
        pushToast({ id: crypto.randomUUID(), type: 'warning', message: 'Safe mode enabled. Mixing is paused.' })
        return
      }
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
      setMixerProgress(target, 0)
      const jobId = `fft-${target}-${crypto.randomUUID()}`
      const payload: MixerJobPayload = {
        images: loadedImages,
        weights: mixerConfig,
        regionMask,
        brightnessConfig,
        targetViewport: target,
        fftMode,
      }
      try {
        const result = (await fftWorkerPool.enqueue({
          id: jobId,
          payload,
          onProgress: (p) => setMixerProgress(target, Math.min(1, Math.max(0, p))),
        })) as {
          width: number
          height: number
          pixels: Uint8ClampedArray
          modeUsed?: MixerJobPayload['fftMode']
        }
        if (fftMode === 'wasm' && result.modeUsed !== 'wasm') {
          pushToast({ id: crypto.randomUUID(), type: 'warning', message: 'Wasm FFT unavailable, fell back to JS.' })
        }
        setOutputImage(target, result)
        pushToast({
          id: crypto.randomUUID(),
          type: 'success',
          message: `Output ${target} updated`,
        })
        setOutputStatus(target, 'idle')
        setMixerProgress(target, null)
      } catch (err) {
        setOutputStatus(target, 'error')
        setMixerProgress(target, null)
        pushToast({
          id: crypto.randomUUID(),
          type: 'error',
          message: err instanceof Error ? err.message : 'Mix failed',
        })
      }
    },
    [brightnessConfig, images, mixerConfig, pushToast, regionMask, safeMode.active, setMixerProgress, setOutputImage, setOutputStatus],
  )

  const runBeamSim = useCallback(async (config?: typeof beamConfig) => {
    if (safeMode.active) return
    const effective = config ?? beamConfigRef.current
    if (!effective.arrays.length) {
      pushToast({ id: crypto.randomUUID(), type: 'warning', message: 'Add at least one array element before simulating.' })
      return
    }
    setBeamStatus('running')
    const jobId = `beam-${crypto.randomUUID()}`
    const payload: BeamJobPayload = {
      arrays: effective.arrays,
      steering: effective.steering,
      renderMode: effective.renderMode,
      widebandMode: effective.widebandMode,
      resolution: effective.resolution,
      bounds: effective.bounds,
    }
    try {
      const result = (await beamWorkerPool.enqueue({ id: jobId, payload })) as {
        heatmap?: Float32Array
        width: number
        height: number
      }
      setBeamResult(result)
      pushToast({ id: crypto.randomUUID(), type: 'success', message: 'Beam simulation complete' })
      setBeamStatus('idle')
    } catch (err) {
      setBeamStatus('error')
      pushToast({
        id: crypto.randomUUID(),
        type: 'error',
        message: err instanceof Error ? err.message : 'Beam simulation failed',
      })
    }
  }, [beamConfigRef, pushToast, safeMode.active, setBeamResult, setBeamStatus])

  const scheduleBeamSim = useCallback(
    (nextConfig?: typeof beamConfig) => {
      if (nextConfig) {
        beamConfigRef.current = nextConfig
        setBeamConfig(nextConfig)
      }
      if (beamDebounce.current) window.clearTimeout(beamDebounce.current)
      beamDebounce.current = window.setTimeout(() => runBeamSim(), 200)
    },
    [runBeamSim, setBeamConfig],
  )

  useEffect(() => () => {
    if (beamDebounce.current) window.clearTimeout(beamDebounce.current)
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key === 'r') {
        e.preventDefault()
        runMix(1)
      }
      if (e.key === 'b') {
        e.preventDefault()
        runBeamSim()
      }
      if (e.key === 'c') {
        e.preventDefault()
        setShowSpectrum((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [runBeamSim, runMix, setShowSpectrum])

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
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
            <button onClick={() => runMix(1)} disabled={safeMode.active || outputStatus[1] === 'mixing'} title="Runs FFT mix into Output 1">
              {outputStatus[1] === 'mixing' ? 'Mixing…' : 'Run Mix → Output 1'}{' '}
              <span style={{ fontSize: 11, paddingLeft: 6, color: 'var(--text-muted)' }}>
                {safeMode.active ? 'Safe Mode' : outputStatus[1] === 'mixing' ? 'Mixing…' : 'Ready'}
              </span>
            </button>
            <button
              onClick={() => setShowSpectrum((prev) => !prev)}
              aria-pressed={showSpectrum}
              style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 }}
              title="Toggle spectrum overlay"
            >
              <span>{showSpectrum ? 'Hide spectrum' : 'Show spectrum'}</span>
            </button>
            {safeMode.active ? <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Processing disabled in Safe Mode</span> : null}
          </div>
          {outputStatus[1] === 'mixing' && (
            <div style={{ marginTop: 8, height: 6, background: 'var(--panel-border)', borderRadius: 6 }}>
              <div
                style={{
                  width: `${Math.round((mixerProgress[1] ?? 0) * 100)}%`,
                  height: '100%',
                  background: 'var(--accent)',
                  borderRadius: 6,
                  transition: 'width 120ms ease-out',
                }}
              />
            </div>
          )}
          <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>
            Loading: {Object.entries(loadingSlots).filter(([, v]) => v).map(([k]) => k).join(', ') || 'idle'}
          </p>
          <div style={{ display: 'grid', gap: 18, marginTop: 12 }}>
            <OutputViewport
              title="Output 1"
              image={outputImages[1]}
              loading={outputStatus[1] === 'mixing'}
              showSpectrum={showSpectrum}
              spectrumData={spectrum[1] ?? undefined}
              safeMode={safeMode.active}
            />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                onClick={() => {
                  const img = outputImages[1]
                  if (!img) return
                  addSnapshot(1, img)
                  pushToast({ id: crypto.randomUUID(), type: 'info', message: 'Snapshot pinned' })
                }}
                disabled={safeMode.active || !outputImages[1]}
              >
                Snapshot
              </button>
              <label style={{ fontSize: 12 }}>Compare target</label>
              <button
                onClick={() => setCompareSelection(1, null)}
                disabled={!compareSelection[1]}
                aria-disabled={!compareSelection[1]}
                style={{ fontSize: 12 }}
              >
                Clear
              </button>
            </div>
            {snapshots.filter((s) => s.viewport === 1).length ? (
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  overflowX: 'auto',
                  padding: 4,
                  border: '1px solid var(--panel-border)',
                  borderRadius: 6,
                  backgroundImage: 'linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px)',
                  backgroundSize: '100% 12px',
                }}
                role="listbox"
                aria-label="Snapshots for Output 1"
              >
                {snapshots
                  .filter((s) => s.viewport === 1)
                  .map((snap) => {
                    const isSelected = compareSelection[1] === snap.id
                    return (
                      <button
                        key={snap.id}
                        onClick={() => setCompareSelection(1, snap.id)}
                        aria-pressed={isSelected}
                        role="option"
                        aria-label={`Snapshot captured at ${new Date(snap.createdAt).toLocaleString()}`}
                        style={{
                          border: isSelected ? '2px solid var(--accent)' : '1px solid var(--panel-border)',
                          borderRadius: 6,
                          padding: 2,
                          background: isSelected ? 'rgba(77,208,225,0.1)' : 'var(--panel)',
                          cursor: 'pointer',
                        }}
                        title={new Date(snap.createdAt).toLocaleString()}
                      >
                        <canvas
                          width={Math.max(1, Math.floor(snap.image.width / 4))}
                          height={Math.max(1, Math.floor(snap.image.height / 4))}
                          style={{ display: 'block' }}
                          ref={(el) => {
                            if (!el) return
                            const ctx = el.getContext('2d')
                            if (!ctx) return
                            const imgData = new ImageData(new Uint8ClampedArray(snap.image.pixels), snap.image.width, snap.image.height)
                            const off = document.createElement('canvas')
                            off.width = snap.image.width
                            off.height = snap.image.height
                            const octx = off.getContext('2d')
                            if (!octx) return
                            octx.putImageData(imgData, 0, 0)
                            ctx.drawImage(off, 0, 0, el.width, el.height)
                          }}
                        />
                      </button>
                    )
                  })}
              </div>
            ) : null}
            {compareSelection[1]
              ? (() => {
                  const snap = snapshots.find((s) => s.id === compareSelection[1])
                  if (!snap) return null
                  return (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Comparing to selected snapshot</span>
                      <canvas
                        width={Math.max(1, Math.floor(snap.image.width / 6))}
                        height={Math.max(1, Math.floor(snap.image.height / 6))}
                        style={{ border: '1px solid var(--panel-border)', borderRadius: 4, background: '#0b1020' }}
                        ref={(el) => {
                          if (!el) return
                          const ctx = el.getContext('2d')
                          if (!ctx) return
                          const imgData = new ImageData(new Uint8ClampedArray(snap.image.pixels), snap.image.width, snap.image.height)
                          const off = document.createElement('canvas')
                          off.width = snap.image.width
                          off.height = snap.image.height
                          const octx = off.getContext('2d')
                          if (!octx) return
                          octx.putImageData(imgData, 0, 0)
                          ctx.drawImage(off, 0, 0, el.width, el.height)
                        }}
                        aria-label="Selected snapshot for comparison"
                      />
                    </div>
                  )
                })()
              : null}

            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button onClick={() => runMix(2)} disabled={safeMode.active || outputStatus[2] === 'mixing'} title="Runs FFT mix into Output 2">
                {outputStatus[2] === 'mixing' ? 'Mixing…' : 'Run Mix → Output 2'}{' '}
                <span style={{ fontSize: 11, paddingLeft: 6, color: 'var(--text-muted)' }}>
                  {safeMode.active ? 'Safe Mode' : outputStatus[2] === 'mixing' ? 'Mixing…' : 'Ready'}
                </span>
              </button>
            </div>
            {outputStatus[2] === 'mixing' && (
              <div style={{ marginTop: 8, height: 6, background: 'var(--panel-border)', borderRadius: 6 }}>
                <div
                  style={{
                    width: `${Math.round((mixerProgress[2] ?? 0) * 100)}%`,
                    height: '100%',
                    background: 'var(--accent)',
                    borderRadius: 6,
                    transition: 'width 120ms ease-out',
                  }}
                />
              </div>
            )}
            <OutputViewport
              title="Output 2"
              image={outputImages[2]}
              loading={outputStatus[2] === 'mixing'}
              showSpectrum={showSpectrum}
              spectrumData={spectrum[2] ?? undefined}
              safeMode={safeMode.active}
            />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                onClick={() => {
                  const img = outputImages[2]
                  if (!img) return
                  addSnapshot(2, img)
                  pushToast({ id: crypto.randomUUID(), type: 'info', message: 'Snapshot pinned' })
                }}
                disabled={safeMode.active || !outputImages[2]}
              >
                Snapshot
              </button>
              <label style={{ fontSize: 12 }}>Compare target</label>
              <button
                onClick={() => setCompareSelection(2, null)}
                disabled={!compareSelection[2]}
                aria-disabled={!compareSelection[2]}
                style={{ fontSize: 12 }}
              >
                Clear
              </button>
            </div>
            {snapshots.filter((s) => s.viewport === 2).length ? (
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  overflowX: 'auto',
                  padding: 4,
                  border: '1px solid var(--panel-border)',
                  borderRadius: 6,
                  backgroundImage: 'linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px)',
                  backgroundSize: '100% 12px',
                }}
                role="listbox"
                aria-label="Snapshots for Output 2"
              >
                {snapshots
                  .filter((s) => s.viewport === 2)
                  .map((snap) => {
                    const isSelected = compareSelection[2] === snap.id
                    return (
                      <button
                        key={snap.id}
                        onClick={() => setCompareSelection(2, snap.id)}
                        aria-pressed={isSelected}
                        role="option"
                        aria-label={`Snapshot captured at ${new Date(snap.createdAt).toLocaleString()}`}
                        style={{
                          border: isSelected ? '2px solid var(--accent)' : '1px solid var(--panel-border)',
                          borderRadius: 6,
                          padding: 2,
                          background: isSelected ? 'rgba(77,208,225,0.1)' : 'var(--panel)',
                          cursor: 'pointer',
                        }}
                        title={new Date(snap.createdAt).toLocaleString()}
                      >
                        <canvas
                          width={Math.max(1, Math.floor(snap.image.width / 4))}
                          height={Math.max(1, Math.floor(snap.image.height / 4))}
                          style={{ display: 'block' }}
                          ref={(el) => {
                            if (!el) return
                            const ctx = el.getContext('2d')
                            if (!ctx) return
                            const imgData = new ImageData(new Uint8ClampedArray(snap.image.pixels), snap.image.width, snap.image.height)
                            const off = document.createElement('canvas')
                            off.width = snap.image.width
                            off.height = snap.image.height
                            const octx = off.getContext('2d')
                            if (!octx) return
                            octx.putImageData(imgData, 0, 0)
                            ctx.drawImage(off, 0, 0, el.width, el.height)
                          }}
                        />
                      </button>
                    )
                  })}
              </div>
            ) : null}
            {compareSelection[2]
              ? (() => {
                  const snap = snapshots.find((s) => s.id === compareSelection[2])
                  if (!snap) return null
                  return (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Comparing to selected snapshot</span>
                      <canvas
                        width={Math.max(1, Math.floor(snap.image.width / 6))}
                        height={Math.max(1, Math.floor(snap.image.height / 6))}
                        style={{ border: '1px solid var(--panel-border)', borderRadius: 4, background: '#0b1020' }}
                        ref={(el) => {
                          if (!el) return
                          const ctx = el.getContext('2d')
                          if (!ctx) return
                          const imgData = new ImageData(new Uint8ClampedArray(snap.image.pixels), snap.image.width, snap.image.height)
                          const off = document.createElement('canvas')
                          off.width = snap.image.width
                          off.height = snap.image.height
                          const octx = off.getContext('2d')
                          if (!octx) return
                          octx.putImageData(imgData, 0, 0)
                          ctx.drawImage(off, 0, 0, el.width, el.height)
                        }}
                        aria-label="Selected snapshot for comparison"
                      />
                    </div>
                  )
                })()
              : null}
          </div>
        </section>
        <section style={panelStyle}>
          <h2>Beamforming Simulator</h2>
          <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
            <div style={{ minWidth: 240 }}>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)' }}>Render Mode</label>
              <select
                value={beamConfig.renderMode}
                onChange={(e) => {
                  const renderMode = e.target.value as BeamJobPayload['renderMode']
                  scheduleBeamSim({ ...beamConfigRef.current, renderMode })
                }}
                disabled={safeMode.active}
              >
                <option value="interference">Interference</option>
                <option value="beam-slice">Beam Slice</option>
                <option value="array-geometry">Array Geometry</option>
              </select>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
                Wideband Mode
              </label>
              <select
                value={beamConfig.widebandMode}
                onChange={(e) => {
                  const widebandMode = e.target.value as BeamJobPayload['widebandMode']
                  scheduleBeamSim({ ...beamConfigRef.current, widebandMode })
                }}
                disabled={safeMode.active}
              >
                <option value="aggregated">Aggregated</option>
                <option value="per-carrier">Per-carrier</option>
              </select>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
                Resolution
              </label>
              <input
                type="number"
                min={64}
                max={512}
                value={beamConfig.resolution}
                onChange={(e) => {
                  const resolution = Number(e.target.value)
                  scheduleBeamSim({ ...beamConfigRef.current, resolution })
                }}
                disabled={safeMode.active}
              />
              <button onClick={() => runBeamSim()} disabled={safeMode.active || beamStatus === 'running'} style={{ marginTop: 12 }}>
                {beamStatus === 'running' ? 'Simulating…' : 'Run Beam →'}{' '}
                <span style={{ fontSize: 11, paddingLeft: 6, color: 'var(--text-muted)' }}>
                  {safeMode.active ? 'Safe Mode' : beamStatus === 'running' ? 'Running…' : 'Ready'}
                </span>
              </button>
            </div>
            <div style={{ flex: '1 1 300px' }}>
              <SteeringJoystick
                theta={beamConfig.steering.theta}
                phi={beamConfig.steering.phi}
                onChange={(steering) => scheduleBeamSim({ ...beamConfigRef.current, steering })}
              />
            </div>
          </div>
          <div style={{ marginTop: 'var(--space-4)' }}>
            {beamResult?.heatmap ? (
              <AdaptiveCanvas
                width={beamResult.width}
                height={beamResult.height}
                pixels={mapHeatmapToImageData(beamResult.heatmap, beamResult.width, beamResult.height)}
                label={`Mode: ${beamConfig.renderMode}`}
              />
            ) : (
              <p style={{ color: 'var(--text-muted)' }}>Run the beam simulation to visualize power levels.</p>
            )}
          </div>
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
