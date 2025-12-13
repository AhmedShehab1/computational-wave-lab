import { useEffect, useRef } from 'react'

interface AdaptiveCanvasProps {
  width: number
  height: number
  pixels: Uint8ClampedArray | null
  label?: string
}

export const AdaptiveCanvas = ({ width, height, pixels, label }: AdaptiveCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    if (!pixels || !canvasRef.current) return
    const ctx = canvasRef.current.getContext('2d')
    if (!ctx) return
    // Convert grayscale to RGBA if needed
    let rgbaPixels: Uint8ClampedArray<ArrayBuffer>
    if (pixels.length === width * height) {
      rgbaPixels = new Uint8ClampedArray(width * height * 4)
      for (let i = 0; i < pixels.length; i++) {
        const v = pixels[i]
        rgbaPixels[i * 4] = v
        rgbaPixels[i * 4 + 1] = v
        rgbaPixels[i * 4 + 2] = v
        rgbaPixels[i * 4 + 3] = 255
      }
    } else {
      rgbaPixels = new Uint8ClampedArray(pixels.length)
      rgbaPixels.set(pixels)
    }
    const imageData = new ImageData(rgbaPixels, width, height)
    ctx.putImageData(imageData, 0, 0)
  }, [pixels, width, height])

  return (
    <div className="adaptive-canvas">
      {label ? <div className="canvas-label">{label}</div> : null}
      <canvas ref={canvasRef} width={width} height={height} />
    </div>
  )
}

export default AdaptiveCanvas
