import { useEffect, useRef } from 'react'

interface SteeringJoystickProps {
  theta: number
  phi: number
  onChange: (steering: { theta: number; phi: number }) => void
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

export const SteeringJoystick = ({ theta, phi, onChange }: SteeringJoystickProps) => {
  const ref = useRef<HTMLDivElement | null>(null)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
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
      handle(evt)
    }
    const end = () => {
      active = false
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
  }, [onChange])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const step = 2
    const onKey = (evt: KeyboardEvent) => {
      const key = evt.key.toLowerCase()
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
  }, [onChange, phi, theta])

  const markerStyle: React.CSSProperties = {
    transform: `translate(${(phi / 180) * 50}%, ${(-theta / 90) * 50}%)`
  }

  return (
    <div className="steering-joystick" ref={ref} tabIndex={0} role="slider" aria-valuetext={`theta ${theta.toFixed(1)}, phi ${phi.toFixed(1)}`}>
      <div className="steering-marker" style={markerStyle} />
      <div className="steering-label">θ {theta.toFixed(1)}°, φ {phi.toFixed(1)}°</div>
    </div>
  )
}

export default SteeringJoystick
