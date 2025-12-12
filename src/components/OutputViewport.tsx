import { useEffect, useMemo, useRef } from 'react'
import type React from 'react'
import type { ImageDataPayload } from '@/types'

interface OutputViewportProps {
  title: string
  image?: ImageDataPayload | null
  loading?: boolean
  showSpectrum?: boolean
  spectrumData?: Float32Array | null
  safeMode?: boolean
}

const spinnerStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'grid',
  placeItems: 'center',
  background: 'rgba(0,0,0,0.35)',
  color: 'white',
  fontSize: 12,
  backdropFilter: 'blur(2px)',
}

export function OutputViewport({ title, image, loading, showSpectrum, spectrumData, safeMode }: OutputViewportProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const spectrumRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    if (!image || !canvasRef.current) return
    const ctx = canvasRef.current.getContext('2d')
    if (!ctx) return
    const frame = new ImageData(new Uint8ClampedArray(image.pixels), image.width, image.height)
    ctx.putImageData(frame, 0, 0)
  }, [image])

  useEffect(() => {
    if (!showSpectrum || !spectrumData || !spectrumRef.current) return
    const canvas = spectrumRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const w = canvas.width
    const h = canvas.height
    ctx.clearRect(0, 0, w, h)
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'
    ctx.lineWidth = 1
    for (let x = 0; x <= w; x += 16) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, h)
      ctx.stroke()
    }
    for (let y = 0; y <= h; y += 16) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(w, y)
      ctx.stroke()
    }
    const max = Math.max(...spectrumData) || 1
    ctx.strokeStyle = 'var(--accent, #4dd0e1)'
    ctx.beginPath()
    spectrumData.forEach((v, i) => {
      const x = (i / (spectrumData.length - 1 || 1)) * w
      const y = h - (v / max) * h
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.stroke()
  }, [showSpectrum, spectrumData])

  const dims = useMemo(() => ({ width: image?.width ?? 0, height: image?.height ?? 0 }), [image])

  return (
    <div style={{ position: 'relative', border: '1px solid var(--panel-border)', borderRadius: 8, padding: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span>{title}</span>
        {safeMode ? <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Safe Mode</span> : null}
      </div>
      <canvas
        ref={canvasRef}
        width={dims.width}
        height={dims.height}
        style={{ width: '100%', background: '#0b1020' }}
        aria-label={`${title} output canvas`}
        role="img"
      />
      {showSpectrum && spectrumData ? (
        <div style={{ position: 'absolute', right: 8, bottom: 8, width: 140, height: 70, background: 'rgba(0,0,0,0.4)', borderRadius: 4, padding: 4 }}>
          <canvas
            ref={spectrumRef}
            width={132}
            height={62}
            style={{ width: '100%', height: '100%' }}
            aria-label="Spectrum inset"
            role="img"
          />
        </div>
      ) : null}
      {loading ? <div style={spinnerStyle}>Processing…</div> : null}
      {!image && !loading ? (
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: 'var(--text-muted)' }}>
          No output yet
        </div>
      ) : null}
    </div>
  )
}

export default OutputViewport
