import { useEffect, useRef, useState, useCallback } from 'react'

interface SteeringJoystickProps {
  theta: number
  phi: number
  onChange: (steering: { theta: number; phi: number }) => void
  visible?: boolean
  onClose?: () => void
  position?: 'bottom-right' | 'bottom-left' | 'center'
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

export const SteeringJoystick = ({ 
  theta, 
  phi, 
  onChange, 
  visible = true,
  onClose,
  position = 'bottom-right'
}: SteeringJoystickProps) => {
  const ref = useRef<HTMLDivElement | null>(null)
  const rafRef = useRef<number | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el || !visible) return
    let active = false

    const handle = (evt: MouseEvent | TouchEvent) => {
      if (!active) return
      const rect = el.getBoundingClientRect()
      const clientX = 'touches' in evt ? evt.touches[0]?.clientX ?? 0 : (evt as MouseEvent).clientX
      const clientY = 'touches' in evt ? evt.touches[0]?.clientY ?? 0 : (evt as MouseEvent).clientY
      const x = ((clientX - rect.left) / rect.width) * 2 - 1
      const y = ((clientY - rect.top) / rect.height) * 2 - 1
      const nextTheta = clamp(-y * 90, -90, 90)
      const nextPhi = clamp(x * 180, -180, 180)
      onChange({ theta: nextTheta, phi: nextPhi })
    }

    const start = (evt: MouseEvent | TouchEvent) => {
      active = true
      setIsDragging(true)
      handle(evt)
    }
    const end = () => {
      active = false
      setIsDragging(false)
    }

    el.addEventListener('mousedown', start)
    el.addEventListener('touchstart', start)
    window.addEventListener('mousemove', handle)
    window.addEventListener('touchmove', handle)
    window.addEventListener('mouseup', end)
    window.addEventListener('touchend', end)

    return () => {
      el.removeEventListener('mousedown', start)
      el.removeEventListener('touchstart', start)
      window.removeEventListener('mousemove', handle)
      window.removeEventListener('touchmove', handle)
      window.removeEventListener('mouseup', end)
      window.removeEventListener('touchend', end)
    }
  }, [onChange, visible])

  useEffect(() => {
    const el = ref.current
    if (!el || !visible) return
    const step = 2
    const onKey = (evt: KeyboardEvent) => {
      const key = evt.key.toLowerCase()
      
      // Escape to close
      if (key === 'escape' && onClose) {
        onClose()
        return
      }
      
      if (!['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'].includes(key)) return
      evt.preventDefault()
      const nextTheta = clamp(theta + (key === 'arrowup' || key === 'w' ? step : key === 'arrowdown' || key === 's' ? -step : 0), -90, 90)
      const nextPhi = clamp(phi + (key === 'arrowright' || key === 'd' ? step * 2 : key === 'arrowleft' || key === 'a' ? -step * 2 : 0), -180, 180)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(() => onChange({ theta: nextTheta, phi: nextPhi }))
    }
    el.addEventListener('keydown', onKey)
    return () => {
      el.removeEventListener('keydown', onKey)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [onChange, onClose, phi, theta, visible])

  // Global keyboard shortcut to toggle joystick (J key)
  useEffect(() => {
    const handleGlobalKey = (evt: KeyboardEvent) => {
      if (evt.key.toLowerCase() === 'j' && onClose) {
        // Only handle if not in input
        if (evt.target instanceof HTMLInputElement || evt.target instanceof HTMLTextAreaElement) return
        onClose()
      }
    }
    
    if (visible) {
      document.addEventListener('keydown', handleGlobalKey)
    }
    
    return () => document.removeEventListener('keydown', handleGlobalKey)
  }, [onClose, visible])

  const handleReset = useCallback(() => {
    onChange({ theta: 0, phi: 0 })
  }, [onChange])

  if (!visible) return null

  const markerStyle: React.CSSProperties = {
    transform: `translate(${(phi / 180) * 50}%, ${(-theta / 90) * 50}%)`
  }

  const positionClass = `joystick-${position}`

  return (
    <div className={`joystick-overlay ${positionClass}`}>
      {/* Close button */}
      {onClose && (
        <button 
          className="joystick-close" 
          onClick={onClose}
          title="Close (Esc or J)"
        >
          ✕
        </button>
      )}
      
      {/* Value display */}
      <div className="joystick-value">
        θ = {theta.toFixed(1)}° | φ = {phi.toFixed(1)}°
      </div>
      
      {/* Joystick track */}
      <div className="joystick-track">
        <div 
          className="steering-joystick" 
          ref={ref} 
          tabIndex={0} 
          role="slider" 
          aria-valuetext={`theta ${theta.toFixed(1)}, phi ${phi.toFixed(1)}`}
        >
          {/* Crosshair guides */}
          <div className="joystick-crosshair horizontal" />
          <div className="joystick-crosshair vertical" />
          
          {/* Handle */}
          <div 
            className={`joystick-handle ${isDragging ? 'dragging' : ''}`} 
            style={markerStyle} 
          />
        </div>
      </div>
      
      {/* Axis labels */}
      <div className="joystick-labels">
        <span className="top">+θ</span>
        <span className="bottom">-θ</span>
        <span className="left">-φ</span>
        <span className="right">+φ</span>
      </div>
      
      {/* Reset button */}
      <button className="joystick-reset" onClick={handleReset} title="Reset to center">
        ⟲
      </button>
    </div>
  )
}

// Hook to manage joystick visibility
export const useSteeringJoystick = () => {
  const [visible, setVisible] = useState(false)
  
  const toggle = useCallback(() => setVisible(v => !v), [])
  const show = useCallback(() => setVisible(true), [])
  const hide = useCallback(() => setVisible(false), [])
  
  return { visible, toggle, show, hide }
}

export default SteeringJoystick
