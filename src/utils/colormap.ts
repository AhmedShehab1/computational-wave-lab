export const viridis = (t: number) => {
  const clamped = Math.max(0, Math.min(1, t))
  const r = Math.round(255 * (0.267 + clamped * (0.993 - 0.267)))
  const g = Math.round(255 * (0.004 + clamped * (0.906 - 0.004)))
  const b = Math.round(255 * (0.329 + clamped * (0.635 - 0.329)))
  return [r, g, b] as const
}

/**
 * Turbo colormap - Perceptually uniform rainbow colormap
 * Goes: Dark Blue -> Cyan -> Green -> Yellow -> Red
 * Better than jet for scientific visualization
 */
export const turbo = (t: number): readonly [number, number, number] => {
  const clamped = Math.max(0, Math.min(1, t))
  
  // Turbo colormap polynomial approximation
  const r = Math.round(255 * Math.max(0, Math.min(1,
    0.13572138 + clamped * (4.61539260 + clamped * (-42.66032258 + clamped * (132.13108234 + clamped * (-152.94239396 + clamped * 59.28637943))))
  )))
  const g = Math.round(255 * Math.max(0, Math.min(1,
    0.09140261 + clamped * (2.19418839 + clamped * (4.84296658 + clamped * (-14.18503333 + clamped * (4.27729857 + clamped * 2.82956604))))
  )))
  const b = Math.round(255 * Math.max(0, Math.min(1,
    0.10667330 + clamped * (12.64194608 + clamped * (-60.58204836 + clamped * (110.36276771 + clamped * (-89.90310912 + clamped * 27.34824973))))
  )))
  
  return [r, g, b] as const
}

/**
 * Jet colormap - Classic MATLAB-style rainbow
 * Goes: Blue -> Cyan -> Green -> Yellow -> Red
 */
export const jet = (t: number): readonly [number, number, number] => {
  const clamped = Math.max(0, Math.min(1, t))
  
  let r: number, g: number, b: number
  
  if (clamped < 0.125) {
    r = 0
    g = 0
    b = 0.5 + clamped * 4
  } else if (clamped < 0.375) {
    r = 0
    g = (clamped - 0.125) * 4
    b = 1
  } else if (clamped < 0.625) {
    r = (clamped - 0.375) * 4
    g = 1
    b = 1 - (clamped - 0.375) * 4
  } else if (clamped < 0.875) {
    r = 1
    g = 1 - (clamped - 0.625) * 4
    b = 0
  } else {
    r = 1 - (clamped - 0.875) * 4
    g = 0
    b = 0
  }
  
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)] as const
}

/**
 * Plasma colormap - Warm perceptually uniform colormap
 * Goes: Purple -> Pink -> Orange -> Yellow
 */
export const plasma = (t: number): readonly [number, number, number] => {
  const clamped = Math.max(0, Math.min(1, t))
  
  const r = Math.round(255 * Math.max(0, Math.min(1,
    0.050383 + clamped * (2.023298 + clamped * (-1.780477 + clamped * 0.678548))
  )))
  const g = Math.round(255 * Math.max(0, Math.min(1,
    0.029803 + clamped * (-0.385320 + clamped * (2.107687 + clamped * -0.873498))
  )))
  const b = Math.round(255 * Math.max(0, Math.min(1,
    0.527975 + clamped * (0.488290 + clamped * (-2.650259 + clamped * 1.689541))
  )))
  
  return [r, g, b] as const
}

/**
 * Inferno colormap - Dark to bright colormap
 * Goes: Black -> Purple -> Red -> Yellow -> White
 */
export const inferno = (t: number): readonly [number, number, number] => {
  const clamped = Math.max(0, Math.min(1, t))
  
  const r = Math.round(255 * Math.max(0, Math.min(1,
    -0.022861 + clamped * (0.874837 + clamped * (0.683716 + clamped * -0.478411))
  )))
  const g = Math.round(255 * Math.max(0, Math.min(1,
    0.003643 + clamped * (-0.080213 + clamped * (1.255893 + clamped * -0.270585))
  )))
  const b = Math.round(255 * Math.max(0, Math.min(1,
    0.014050 + clamped * (1.383840 + clamped * (-1.917809 + clamped * 0.611354))
  )))
  
  return [r, g, b] as const
}

/**
 * Cool-warm diverging colormap - Great for interference patterns
 * Goes: Blue -> White -> Red
 */
export const coolwarm = (t: number): readonly [number, number, number] => {
  const clamped = Math.max(0, Math.min(1, t))
  
  // Diverging colormap centered at 0.5
  const x = clamped * 2 - 1 // Map to -1 to 1
  
  let r: number, g: number, b: number
  
  if (x < 0) {
    // Blue side
    r = 0.230 + 0.549 * (1 + x)
    g = 0.299 + 0.560 * (1 + x)
    b = 0.754 - 0.224 * x
  } else {
    // Red side
    r = 0.706 + 0.255 * x
    g = 0.016 + 0.843 * (1 - x)
    b = 0.150 + 0.380 * (1 - x)
  }
  
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)] as const
}

export type ColormapName = 'viridis' | 'turbo' | 'jet' | 'plasma' | 'inferno' | 'coolwarm'

export const colormaps: Record<ColormapName, (t: number) => readonly [number, number, number]> = {
  viridis,
  turbo,
  jet,
  plasma,
  inferno,
  coolwarm,
}

export const getColormap = (name: ColormapName) => colormaps[name] || viridis

export const mapHeatmapToImageData = (heatmap: Float32Array, width: number, height: number) => {
  const pixels = new Uint8ClampedArray(width * height * 4)
  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < heatmap.length; i++) {
    const v = heatmap[i]
    if (v < min) min = v
    if (v > max) max = v
  }
  const range = max - min || 1
  for (let i = 0; i < heatmap.length; i++) {
    const tRaw = (heatmap[i] - min) / range
    const t = Math.max(0, Math.min(1, Number.isFinite(tRaw) ? tRaw : 0))
    const [r, g, b] = viridis(t)
    const idx = i * 4
    pixels[idx] = r
    pixels[idx + 1] = g
    pixels[idx + 2] = b
    pixels[idx + 3] = 255
  }
  return pixels
}

/**
 * Map a Float32Array heatmap to RGBA pixels using a specified colormap.
 * Optimized for real-time rendering with pre-normalized data.
 */
export const mapIntensityToPixels = (
  intensityMap: Float32Array,
  width: number,
  height: number,
  colormapName: ColormapName = 'turbo',
  preNormalized = false
): Uint8ClampedArray => {
  const pixels = new Uint8ClampedArray(width * height * 4)
  const colormap = getColormap(colormapName)
  
  let min = 0
  let max = 1
  
  // Find min/max if not pre-normalized
  if (!preNormalized) {
    min = Infinity
    max = -Infinity
    for (let i = 0; i < intensityMap.length; i++) {
      const v = intensityMap[i]
      if (v < min) min = v
      if (v > max) max = v
    }
  }
  
  const range = max - min || 1
  
  for (let i = 0; i < intensityMap.length; i++) {
    const t = preNormalized 
      ? intensityMap[i] 
      : (intensityMap[i] - min) / range
    
    const clamped = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0))
    const [r, g, b] = colormap(clamped)
    
    const idx = i * 4
    pixels[idx] = r
    pixels[idx + 1] = g
    pixels[idx + 2] = b
    pixels[idx + 3] = 255
  }
  
  return pixels
}
