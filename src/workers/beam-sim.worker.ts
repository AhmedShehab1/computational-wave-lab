import type { BeamJobPayload, BeamResult } from '@/types'
import type { WorkerMessageEnvelope } from './types'

const DEFAULT_BOUNDS = { xMin: -1, xMax: 1, yMin: -1, yMax: 1 }

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

const normalizeVec = (x: number, y: number, z: number) => {
  const mag = Math.max(1e-6, Math.sqrt(x * x + y * y + z * z))
  return { x: x / mag, y: y / mag, z: z / mag }
}

const normalizeSteering = (theta: number, phi: number) => {
  const t = clamp(theta, -90, 90)
  const p = clamp(phi, -180, 180)
  return { theta: t, phi: p }
}

const renderGeometry = (arrays: BeamJobPayload['arrays'], resolution: number) => {
  const width = resolution
  const height = resolution
  const heatmap = new Float32Array(width * height)
  const bounds = DEFAULT_BOUNDS
  arrays.forEach((entity) => {
    const power = entity.config?.bandwidth ?? 1
    const pos = entity.position ?? { x: 0, y: 0 }
    const cx = ((pos.x - bounds.xMin) / (bounds.xMax - bounds.xMin)) * (width - 1)
    const cy = ((pos.y - bounds.yMin) / (bounds.yMax - bounds.yMin)) * (height - 1)
    const radius = Math.max(0.01, Math.min(0.2, power * 0.01))
    const rPx = Math.max(1, Math.round(radius * width))
    for (let dy = -rPx; dy <= rPx; dy++) {
      for (let dx = -rPx; dx <= rPx; dx++) {
        const px = Math.round(cx + dx)
        const py = Math.round(cy + dy)
        if (px < 0 || py < 0 || px >= width || py >= height) continue
        const idx = py * width + px
        const weight = 1 - Math.min(1, Math.sqrt(dx * dx + dy * dy) / rPx)
        heatmap[idx] = Math.max(heatmap[idx], power * weight)
      }
    }
  })
  return { heatmap, width, height }
}

const calcDelayAndSum = (
  arrays: BeamJobPayload['arrays'],
  thetaRad: number,
  widebandMode: BeamJobPayload['widebandMode'],
) => {
  const c = 3e8
  const elementCount = Math.max(1, arrays.length)
  const carriers = arrays.flatMap((a) => a.config?.frequencies || [])
  const carrierList = carriers.length ? carriers : [1e9]

  if (widebandMode === 'per-carrier') {
    let power = 0
    carrierList.forEach((freq) => {
      const k = (2 * Math.PI * freq) / c
      let re = 0
      let im = 0
      arrays.forEach((entity) => {
        const pos = entity.position ?? { x: 0, y: 0, z: 0 }
        const phase = k * (pos.x * Math.cos(thetaRad) + pos.y * Math.sin(thetaRad))
        re += Math.cos(phase)
        im += Math.sin(phase)
      })
      power += (re * re + im * im) / (elementCount * elementCount)
    })
    return power / carrierList.length
  }

  let re = 0
  let im = 0
  carrierList.forEach((freq) => {
    const k = (2 * Math.PI * freq) / c
    arrays.forEach((entity) => {
      const pos = entity.position ?? { x: 0, y: 0, z: 0 }
      const phase = k * (pos.x * Math.cos(thetaRad) + pos.y * Math.sin(thetaRad))
      re += Math.cos(phase)
      im += Math.sin(phase)
    })
  })
  return (re * re + im * im) / (elementCount * elementCount)
}

const buildResult = (payload: BeamJobPayload, shouldCancel: () => boolean = () => false): BeamResult => {
  const bounds = payload.bounds ?? DEFAULT_BOUNDS
  const width = payload.resolution
  const height = payload.resolution
  const { theta, phi } = normalizeSteering(payload.steering.theta, payload.steering.phi)
  const steeringVec = normalizeVec(
    Math.cos((phi * Math.PI) / 180) * Math.cos((theta * Math.PI) / 180),
    Math.sin((phi * Math.PI) / 180) * Math.cos((theta * Math.PI) / 180),
    Math.sin((theta * Math.PI) / 180),
  )

  if (payload.renderMode === 'array-geometry') {
    const geometry = renderGeometry(payload.arrays, payload.resolution)
    return { heatmap: geometry.heatmap, width: geometry.width, height: geometry.height, geometry: payload.arrays }
  }

  const heatmap = new Float32Array(width * height)
  const { xMin, xMax, yMin, yMax } = bounds
  const dx = (xMax - xMin) / (width - 1 || 1)
  const dy = (yMax - yMin) / (height - 1 || 1)
  let maxPower = 1e-6

  for (let j = 0; j < height; j++) {
    if (shouldCancel()) break
    const y = yMin + j * dy
    for (let i = 0; i < width; i++) {
      const x = xMin + i * dx
      const thetaRad = ((i / Math.max(1, width - 1)) - 0.5) * Math.PI
      const dir = normalizeVec(x, y, 1)
      let value = 0
      if (payload.arrays.length) {
        value = calcDelayAndSum(payload.arrays, thetaRad, payload.widebandMode)
      } else if (payload.renderMode === 'beam-slice') {
        const phase = Math.cos(y * Math.PI * 0.5 + steeringVec.y * 0.5)
        value = 0.5 + 0.5 * phase
      } else {
        const phase = Math.sin((dir.x + dir.y) * Math.PI + steeringVec.x * 0.1 + steeringVec.y * 0.05)
        const envelope = Math.exp(-(x * x + y * y) * 2)
        value = envelope * (0.5 + 0.5 * phase)
      }
      maxPower = Math.max(maxPower, value)
      heatmap[j * width + i] = value
    }
  }

  if (maxPower > 0) {
    for (let idx = 0; idx < heatmap.length; idx += 1) {
      heatmap[idx] = clamp(heatmap[idx] / maxPower, 0, 1)
    }
  }

  return {
    heatmap,
    width,
    height,
    beamSlice: payload.renderMode === 'beam-slice' ? heatmap.slice() : undefined,
  }
}

const ctx: DedicatedWorkerGlobalScope =
  typeof self !== 'undefined' ? (self as unknown as DedicatedWorkerGlobalScope) : ({} as DedicatedWorkerGlobalScope)

const canceledJobs = new Set<string>()

ctx.onmessage = (event: MessageEvent<WorkerMessageEnvelope<BeamJobPayload>>) => {
  const { data } = event
  if (!data) return
  if (data.type === 'JOB_CANCEL' && data.jobId) {
    canceledJobs.add(data.jobId)
    return
  }
  if (data.type !== 'JOB_START' || !data.payload || !data.jobId) return

  const { jobId, payload } = data
  try {
    const result = buildResult(payload, () => canceledJobs.has(jobId))
    if (canceledJobs.has(jobId)) {
      canceledJobs.delete(jobId)
      return
    }
    const envelope: WorkerMessageEnvelope = { type: 'JOB_COMPLETE', jobId, payload: result }
    const transfers: Transferable[] = result.heatmap ? [result.heatmap.buffer] : []
    ctx.postMessage(envelope, transfers)
  } catch (err) {
    const envelope: WorkerMessageEnvelope = {
      type: 'JOB_ERROR',
      jobId,
      error: err instanceof Error ? err.message : 'Beam worker error',
    }
    ctx.postMessage(envelope)
  } finally {
    canceledJobs.delete(jobId)
  }
}

export { buildResult } // surface for tests
