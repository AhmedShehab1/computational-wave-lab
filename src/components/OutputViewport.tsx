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
  brightness?: number
  contrast?: number
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

export function OutputViewport({ title, image, loading, showSpectrum, spectrumData, safeMode, brightness = 0, contrast = 1 }: OutputViewportProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const spectrumRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    if (!image || !canvasRef.current) return
    const ctx = canvasRef.current.getContext('2d')
    if (!ctx) return
    
    // Convert grayscale to RGBA if needed
    let rgbaPixels: Uint8ClampedArray<ArrayBuffer>
    if (image.pixels.length === image.width * image.height) {
      // Grayscale data - expand to RGBA
      rgbaPixels = new Uint8ClampedArray(image.width * image.height * 4)
      for (let i = 0; i < image.pixels.length; i++) {
        const v = image.pixels[i]
        rgbaPixels[i * 4] = v      // R
        rgbaPixels[i * 4 + 1] = v  // G
        rgbaPixels[i * 4 + 2] = v  // B
        rgbaPixels[i * 4 + 3] = 255 // A
      }
    } else {
      // Already RGBA - copy to ensure regular ArrayBuffer backing
      rgbaPixels = new Uint8ClampedArray(image.pixels.length)
      rgbaPixels.set(image.pixels)
    }
    
    const frame = new ImageData(rgbaPixels, image.width, image.height)
    ctx.putImageData(frame, 0, 0)
  }, [image])

  useEffect(() => {
    if (!showSpectrum || !spectrumData || !spectrumRef.current) return
    const canvas = spectrumRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const w = canvas.width
    const h = canvas.height
    
    // Clear and draw dark background
    ctx.fillStyle = 'rgba(8, 10, 15, 0.95)'
    ctx.fillRect(0, 0, w, h)
    
    // Draw grid lines
    ctx.strokeStyle = 'rgba(77, 208, 225, 0.1)'
    ctx.lineWidth = 1
    const gridStep = 16
    for (let x = 0; x <= w; x += gridStep) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, h)
      ctx.stroke()
    }
    for (let y = 0; y <= h; y += gridStep) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(w, y)
      ctx.stroke()
    }
    
    // Draw center cross for DC component reference
    ctx.strokeStyle = 'rgba(255, 136, 0, 0.3)'
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.moveTo(w / 2, 0)
    ctx.lineTo(w / 2, h)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(0, h / 2)
    ctx.lineTo(w, h / 2)
    ctx.stroke()
    ctx.setLineDash([])
    
    // Find max for normalization (use log scale for better visibility)
    const logData = new Float32Array(spectrumData.length)
    let maxLog = -Infinity
    for (let i = 0; i < spectrumData.length; i++) {
      logData[i] = Math.log1p(spectrumData[i])
      if (logData[i] > maxLog) maxLog = logData[i]
    }
    if (maxLog <= 0) maxLog = 1
    
    // Draw spectrum line with gradient
    const gradient = ctx.createLinearGradient(0, h, 0, 0)
    gradient.addColorStop(0, 'rgba(0, 170, 255, 0.3)')
    gradient.addColorStop(0.5, 'rgba(77, 208, 225, 0.8)')
    gradient.addColorStop(1, 'rgba(255, 136, 0, 1)')
    
    // Fill area under curve
    ctx.beginPath()
    ctx.moveTo(0, h)
    for (let i = 0; i < logData.length; i++) {
      const x = (i / (logData.length - 1 || 1)) * w
      const y = h - (logData[i] / maxLog) * (h - 4)
      ctx.lineTo(x, y)
    }
    ctx.lineTo(w, h)
    ctx.closePath()
    ctx.fillStyle = 'rgba(77, 208, 225, 0.15)'
    ctx.fill()
    
    // Draw line
    ctx.strokeStyle = gradient
    ctx.lineWidth = 2
    ctx.beginPath()
    for (let i = 0; i < logData.length; i++) {
      const x = (i / (logData.length - 1 || 1)) * w
      const y = h - (logData[i] / maxLog) * (h - 4)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
    
    // Draw label
    ctx.fillStyle = 'rgba(230, 237, 243, 0.7)'
    ctx.font = '9px system-ui'
    ctx.fillText('Freq →', w - 38, h - 4)
  }, [showSpectrum, spectrumData])

  const dims = useMemo(() => ({ width: image?.width ?? 0, height: image?.height ?? 0 }), [image])

  // Calculate crosshair position from brightness/contrast
  // Brightness: -1 to 1 maps to X: 0% to 100%
  // Contrast: 0 to 2 maps to Y: 100% to 0%
  const crosshairX = ((brightness + 1) / 2) * 100
  const crosshairY = ((2 - contrast) / 2) * 100

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
      
      {/* Brightness/Contrast Crosshair Indicator */}
      {image && (
        <div
          style={{
            position: 'absolute',
            left: 12,
            top: 32,
            width: 50,
            height: 50,
            background: 'rgba(0, 0, 0, 0.5)',
            borderRadius: 4,
            border: '1px solid rgba(77, 208, 225, 0.3)',
            overflow: 'hidden',
          }}
          title={`Brightness: ${brightness.toFixed(2)}, Contrast: ${contrast.toFixed(2)}`}
        >
          {/* Grid background */}
          <div style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: 'linear-gradient(rgba(77, 208, 225, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(77, 208, 225, 0.1) 1px, transparent 1px)',
            backgroundSize: '10px 10px',
          }} />
          
          {/* Horizontal crosshair line */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: `${crosshairY}%`,
              height: 1,
              background: 'rgba(255, 136, 0, 0.6)',
              transform: 'translateY(-50%)',
            }}
          />
          
          {/* Vertical crosshair line */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: `${crosshairX}%`,
              width: 1,
              background: 'rgba(0, 170, 255, 0.6)',
              transform: 'translateX(-50%)',
            }}
          />
          
          {/* Crosshair dot */}
          <div
            style={{
              position: 'absolute',
              left: `${crosshairX}%`,
              top: `${crosshairY}%`,
              width: 6,
              height: 6,
              background: '#4dd0e1',
              borderRadius: '50%',
              transform: 'translate(-50%, -50%)',
              boxShadow: '0 0 6px rgba(77, 208, 225, 0.8)',
            }}
          />
          
          {/* Labels */}
          <span style={{ position: 'absolute', bottom: 1, left: 2, fontSize: 7, color: 'rgba(230, 237, 243, 0.5)' }}>B</span>
          <span style={{ position: 'absolute', top: 1, right: 2, fontSize: 7, color: 'rgba(230, 237, 243, 0.5)' }}>C</span>
        </div>
      )}
      
      {showSpectrum && spectrumData ? (
        <div style={{ 
          position: 'absolute', 
          right: 8, 
          bottom: 8, 
          width: 160, 
          height: 80, 
          background: 'rgba(8, 10, 15, 0.9)', 
          borderRadius: 6, 
          padding: 4,
          border: '1px solid rgba(77, 208, 225, 0.3)',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
        }}>
          <div style={{ 
            fontSize: 9, 
            color: 'rgba(77, 208, 225, 0.8)', 
            marginBottom: 2,
            fontWeight: 500,
            letterSpacing: '0.05em',
          }}>
            OUTPUT SPECTRUM
          </div>
          <canvas
            ref={spectrumRef}
            width={150}
            height={60}
            style={{ width: '100%', height: 'calc(100% - 14px)' }}
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
