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
    const imageData = new ImageData(pixels, width, height)
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
