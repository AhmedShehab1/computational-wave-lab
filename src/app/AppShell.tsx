import { useCallback, useEffect, useRef, useState } from 'react'
import './AppShell.css'
import { SafeModeBanner } from '@/components/SafeModeBanner'
import { ToastStack } from '@/components/ToastStack'
import { TopHeader } from '@/components/TopHeader'
import { UploadPanel } from '@/components/UploadPanel'
import { MixerControls } from '@/components/MixerControls'
import { RegionControls } from '@/components/RegionControls'
import { AdaptiveCanvas } from '@/components/AdaptiveCanvas'
import { SteeringJoystick } from '@/components/SteeringJoystick'
import { OutputViewport } from '@/components/OutputViewport'
import { MeasurementsRibbon, createDefaultMeasurements } from '@/components/MeasurementsRibbon'
import { StatusBar } from '@/components/StatusBar'
import { useWorkerSupport } from '@/hooks/useWorkerSupport'
import { useGlobalStore } from '@/state/globalStore'
import { beamWorkerPool, fftWorkerPool, imageWorkerPool } from '@/workers/pool'
import { mapHeatmapToImageData } from '@/utils/colormap'
import { computeRowSpectrum } from '@/utils/spectrum'
import { fftMode as defaultFftMode } from '@/config/runtime'
import type { BeamJobPayload, FileMeta, FileSlot, MixerJobPayload, OutputViewportId } from '@/types'

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
  const fftMode = useGlobalStore((s) => s.fftMode)
  const setFftMode = useGlobalStore((s) => s.setFftMode)
  const beamConfig = useGlobalStore((s) => s.beamConfig)
  const setBeamConfig = useGlobalStore((s) => s.setBeamConfig)
  const beamResult = useGlobalStore((s) => s.beamResult)
  const setBeamResult = useGlobalStore((s) => s.setBeamResult)
  const beamStatus = useGlobalStore((s) => s.beamStatus)
  const setBeamStatus = useGlobalStore((s) => s.setBeamStatus)
  const beamConfigRef = useRef(beamConfig)
  const beamDebounce = useRef<number | null>(null)
  const beamFrameMsRef = useRef<number | null>(null)
  const [showSpectrum, setShowSpectrum] = useState(false)
  const [spectrum, setSpectrum] = useState<Record<OutputViewportId, Float32Array | null>>({ 1: null, 2: null })
  const [loadingSlots, setLoadingSlots] = useState<Record<FileSlot, boolean>>({
    A: false,
    B: false,
    C: false,
    D: false,
  })
  const [modeUsed, setModeUsed] = useState<Record<OutputViewportId, MixerJobPayload['fftMode']>>({ 1: defaultFftMode, 2: defaultFftMode })

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
        const used = result.modeUsed ?? fftMode
        setModeUsed((prev) => ({ ...prev, [target]: used }))
        if (fftMode === 'wasm' && used !== 'wasm') {
          pushToast({ id: crypto.randomUUID(), type: 'warning', message: 'Wasm FFT unavailable, fell back to JS.' })
          setFftMode('js')
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
        if (fftMode === 'wasm') {
          setFftMode('js')
        }
      }
    },
    [brightnessConfig, fftMode, images, mixerConfig, pushToast, regionMask, safeMode.active, setFftMode, setMixerProgress, setOutputImage, setOutputStatus],
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

  // UI state for new components
  const [workspace, setWorkspace] = useState('Dual Workspace')
  const [educationalMode, setEducationalMode] = useState(false)
  const [measurements, setMeasurements] = useState(createDefaultMeasurements(15.2, 12.4, 14.3, -13.2))
  const [systemLoad, setSystemLoad] = useState(25)
  const [memoryUsage, setMemoryUsage] = useState(40)
  const normalizedSize = useGlobalStore((s) => s.normalizedSize)

  // Update measurements on beam result change
  useEffect(() => {
    if (beamResult) {
      setMeasurements(createDefaultMeasurements(
        15 + Math.random() * 5,
        12 + Math.random() * 3,
        14 + Math.random() * 2,
        -13 - Math.random() * 3
      ))
    }
  }, [beamResult])

  // Fake system metrics
  useEffect(() => {
    const interval = setInterval(() => {
      setSystemLoad(prev => Math.max(10, Math.min(90, prev + (Math.random() - 0.5) * 10)))
      setMemoryUsage(prev => Math.max(20, Math.min(80, prev + (Math.random() - 0.5) * 5)))
    }, 3000)
    return () => clearInterval(interval)
  }, [])

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
    <div className="app-shell">
      <SafeModeBanner
        active={safeMode.active}
        message={safeMode.reason || 'Hardware Acceleration Disabled. Simulation paused.'}
        helpUrl="https://example.com/troubleshooting"
      />
      <ToastStack />

      {/* Top Header */}
      <TopHeader
        projectName="Quantum Wave Research - Dual Workspace"
        taskName="DSP Lab Session"
        workspace={workspace}
        onWorkspaceChange={setWorkspace}
        imageSize={normalizedSize}
        uploadWarning={safeMode.active ? 'Safe mode active' : null}
        educationalMode={educationalMode}
        onEducationalToggle={setEducationalMode}
        fftMode={fftMode}
        onFftModeChange={(mode) => setFftMode(mode)}
      />

      {/* Main Workspace */}
      <main className="main-workspace">
        {/* Part A - Fourier Mixer */}
        <div className="panel fourier-panel">
          <div className="panel-header">
            <h2>
              <span className="part-label">Part A</span>
              <span className="accent">Fourier Mixer</span>
            </h2>
          </div>
          <div className="panel-content">
            <UploadPanel onFilesAccepted={handleFilesAccepted} />
            <MixerControls />
            <RegionControls />
            
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginTop: '12px' }}>
              <button 
                className="scenario-btn"
                onClick={() => runMix(1)} 
                disabled={safeMode.active || outputStatus[1] === 'mixing'}
              >
                {outputStatus[1] === 'mixing' ? '⏳ Mixing...' : '▶ Run Mix (R)'}
              </button>
              <button
                className="scenario-btn"
                onClick={() => setShowSpectrum((prev) => !prev)}
                aria-pressed={showSpectrum}
              >
                {showSpectrum ? '📊 Hide Spectrum' : '📊 Show Spectrum'}
              </button>
              <span className="size-badge">
                <span className="icon">⚙️</span>
                <span>{(modeUsed[1] || 'js').toUpperCase()}</span>
              </span>
            </div>
            
            {outputStatus[1] === 'mixing' && (
              <div style={{ marginTop: '12px', height: '6px', background: 'var(--bg-input)', borderRadius: '3px' }}>
                <div
                  style={{
                    width: `${Math.round((mixerProgress[1] ?? 0) * 100)}%`,
                    height: '100%',
                    background: 'var(--gradient-accent)',
                    borderRadius: '3px',
                    transition: 'width 120ms ease-out',
                  }}
                />
              </div>
            )}
            
            <p style={{ color: 'var(--text-muted)', fontSize: '11px', marginTop: '8px' }}>
              Loading: {Object.entries(loadingSlots).filter(([, v]) => v).map(([k]) => k).join(', ') || 'idle'}
            </p>
            
            {/* Output Viewports */}
            <div className="output-section" style={{ marginTop: '16px' }}>
              <div className="output-header">
                <h3>Output 1</h3>
                <div className={`output-status ${outputStatus[1] === 'mixing' ? 'mixing' : 'routing'}`}>
                  {outputStatus[1] === 'mixing' ? '◌ Mixing' : '● Ready'}
                </div>
              </div>
              <OutputViewport
                title="Output 1"
                image={outputImages[1]}
                loading={outputStatus[1] === 'mixing'}
                showSpectrum={showSpectrum}
                spectrumData={spectrum[1] ?? undefined}
                safeMode={safeMode.active}
              />
              <div className="output-footer">
                <label className="spectrum-toggle">
                  <input
                    type="checkbox"
                    checked={showSpectrum}
                    onChange={() => setShowSpectrum(!showSpectrum)}
                  />
                  Show Spectrum
                </label>
                <button
                  className="snapshot-btn"
                  onClick={() => {
                    const img = outputImages[1]
                    if (!img) return
                    addSnapshot(1, img)
                    pushToast({ id: crypto.randomUUID(), type: 'info', message: 'Snapshot pinned' })
                  }}
                  disabled={safeMode.active || !outputImages[1]}
                >
                  📷 Snapshot
                </button>
              </div>
              {snapshots.filter((s) => s.viewport === 1).length > 0 && (
                <div className="snapshot-strip">
                  {snapshots
                    .filter((s) => s.viewport === 1)
                    .map((snap) => {
                      const isSelected = compareSelection[1] === snap.id
                      return (
                        <canvas
                          key={snap.id}
                          className={`snapshot-thumb ${isSelected ? 'selected' : ''}`}
                          width={48}
                          height={36}
                          onClick={() => setCompareSelection(1, isSelected ? null : snap.id)}
                          title={new Date(snap.createdAt).toLocaleString()}
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
                      )
                    })}
                </div>
              )}
            </div>

            {/* Output 2 */}
            <div className="output-section" style={{ marginTop: '16px' }}>
              <div className="output-header">
                <h3>Output 2</h3>
                <button className="scenario-btn" onClick={() => runMix(2)} disabled={safeMode.active || outputStatus[2] === 'mixing'}>
                  {outputStatus[2] === 'mixing' ? '⏳ Mixing...' : '▶ Mix'}
                </button>
                <div className={`output-status ${outputStatus[2] === 'mixing' ? 'mixing' : 'routing'}`}>
                  {outputStatus[2] === 'mixing' ? '◌ Mixing' : '● Ready'}
                </div>
              </div>
              <OutputViewport
                title="Output 2"
                image={outputImages[2]}
                loading={outputStatus[2] === 'mixing'}
                showSpectrum={showSpectrum}
                spectrumData={spectrum[2] ?? undefined}
                safeMode={safeMode.active}
              />
              <div className="output-footer">
                <button
                  className="snapshot-btn"
                  onClick={() => {
                    const img = outputImages[2]
                    if (!img) return
                    addSnapshot(2, img)
                    pushToast({ id: crypto.randomUUID(), type: 'info', message: 'Snapshot pinned' })
                  }}
                  disabled={safeMode.active || !outputImages[2]}
                >
                  📷 Snapshot
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Part B - Beamforming Simulator */}
        <div className="panel beam-panel">
          <div className="panel-header">
            <h2>
              <span className="part-label">Part B</span>
              <span className="accent">Beamforming Simulator</span>
            </h2>
          </div>
          <div className="panel-content">
            <div style={{ display: 'grid', gap: '16px' }}>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>Render Mode</label>
                  <select
                    className="header-select"
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
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>Wideband Mode</label>
                  <select
                    className="header-select"
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
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>Resolution</label>
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
                    style={{
                      width: '80px',
                      padding: '6px 10px',
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--text-primary)',
                      fontSize: '12px'
                    }}
                  />
                </div>
                <button 
                  className="scenario-btn" 
                  onClick={() => runBeamSim()} 
                  disabled={safeMode.active || beamStatus === 'running'}
                  style={{ alignSelf: 'flex-end' }}
                >
                  {beamStatus === 'running' ? '⏳ Simulating...' : '▶ Run Beam (B)'}
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <SteeringJoystick
                    theta={beamConfig.steering.theta}
                    phi={beamConfig.steering.phi}
                    onChange={(steering) => scheduleBeamSim({ ...beamConfigRef.current, steering })}
                  />
                </div>
                <div>
                  {beamResult?.heatmap ? (
                    (() => {
                      const t0 = performance.now()
                      const pixels = mapHeatmapToImageData(beamResult.heatmap, beamResult.width, beamResult.height)
                      const dt = performance.now() - t0
                      if (import.meta.env.DEV) {
                        beamFrameMsRef.current = dt
                      }
                      return (
                        <div>
                          <AdaptiveCanvas 
                            width={beamResult.width} 
                            height={beamResult.height} 
                            pixels={pixels} 
                            label={`Mode: ${beamConfig.renderMode}`} 
                          />
                          {beamFrameMsRef.current ? (
                            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                              Render: {beamFrameMsRef.current.toFixed(2)} ms
                            </span>
                          ) : null}
                        </div>
                      )
                    })()
                  ) : (
                    <div style={{ 
                      aspectRatio: '1', 
                      background: 'var(--bg-dark)', 
                      borderRadius: 'var(--radius-md)', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center',
                      color: 'var(--text-muted)',
                      fontSize: '12px'
                    }}>
                      Run beam simulation to visualize
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Parameter Sidebar placeholder */}
        <div className="param-sidebar" style={{ padding: '16px' }}>
          <div className="param-section open">
            <div className="param-section-header">
              <h3>⏱️ Delays & Phases</h3>
            </div>
            <div className="param-section-content">
              <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Adjust element delays and phases for beam steering</p>
            </div>
          </div>
          <div className="param-section">
            <div className="param-section-header">
              <h3>📶 Frequencies</h3>
              <span className="chevron">▶</span>
            </div>
          </div>
          <div className="param-section">
            <div className="param-section-header">
              <h3>🎯 Scenarios</h3>
              <span className="chevron">▶</span>
            </div>
          </div>
          <div className="param-section">
            <div className="param-section-header">
              <h3>⚙️ Algorithm</h3>
              <span className="chevron">▶</span>
            </div>
          </div>
        </div>
      </main>

      {/* Measurements Ribbon */}
      <MeasurementsRibbon measurements={measurements} />

      {/* Status Bar */}
      <StatusBar
        fourierStatus={outputStatus[1] === 'mixing' ? 'processing' : outputImages[1] ? 'ready' : 'idle'}
        beamStatus={beamStatus === 'running' ? 'processing' : beamResult ? 'ready' : 'idle'}
        systemLoad={systemLoad}
        memoryUsage={memoryUsage}
        time={new Date()}
        onHelpClick={() => pushToast({ id: crypto.randomUUID(), type: 'info', message: 'Press R to mix, B for beam sim, C to toggle spectrum' })}
      />
    </div>
  )
}
