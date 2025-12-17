/**
 * beam-simulator.worker.ts
 * 
 * High-performance Web Worker for computing 2D wave interference patterns.
 * Uses the PhasedArray class for all physics calculations (OOP compliant).
 * 
 * Physics: V_total(x,y) = Σ A_i * e^(j(k*d_i + φ_i))
 * where:
 *   - k = 2π/λ (wave number)
 *   - d_i = distance from point (x,y) to sensor i
 *   - φ_i = phase offset of sensor i
 *   - A_i = amplitude of sensor i
 * 
 * OOP Compliance: All math is delegated to the PhasedArray class.
 */

import { PhasedArray } from '@/classes/PhasedArray';
import type { PhasedArrayConfig } from '@/classes/PhasedArray';

// ============================================================================
// TYPES
// ============================================================================

export interface Transmitter {
  x: number;        // Position in meters
  y: number;        // Position in meters
  phaseOffset: number;  // Phase in radians
  amplitude: number;    // Amplitude (0-1)
}

export interface SimulationConfig {
  // Legacy format (for backward compatibility)
  transmitters?: Transmitter[];
  // New OOP format (preferred)
  units?: PhasedArrayConfig[];
  medium?: string;
  // Common fields
  gridSize: { width: number; height: number };
  wavelength: number;      // In meters
  fieldSize: { width: number; height: number };  // Physical size in meters
  normalize: boolean;      // Normalize output to 0-1 range
}

export interface SimulationResult {
  intensityMap: Float32Array;
  width: number;
  height: number;
  maxIntensity: number;
  minIntensity: number;
  computeTimeMs: number;
}

export interface WorkerMessage {
  type: 'SIMULATE' | 'CANCEL';
  jobId: string;
  config?: SimulationConfig;
}

export interface WorkerResponse {
  type: 'RESULT' | 'PROGRESS' | 'ERROR';
  jobId: string;
  result?: SimulationResult;
  progress?: number;
  error?: string;
}

// ============================================================================
// STATE
// ============================================================================

let currentJobId: string | null = null;
let shouldCancel = false;

// ============================================================================
// HELPER: Convert PhasedArrayConfig[] to Transmitter[] using PhasedArray class
// ============================================================================

function unitsToTransmitters(units: PhasedArrayConfig[], medium: string = 'air'): Transmitter[] {
  const transmitters: Transmitter[] = [];
  
  for (const unitConfig of units) {
    if (!unitConfig.enabled) continue;
    
    // Instantiate PhasedArray class - ALL math is in the class
    const phasedArray = PhasedArray.fromConfig(unitConfig, medium);
    
    // Get element positions (computed by the class)
    const elements = phasedArray.getElementPositions();
    
    for (const element of elements) {
      transmitters.push({
        x: element.x,
        y: element.y,
        phaseOffset: element.phaseOffset,
        amplitude: element.amplitude,
      });
    }
  }
  
  return transmitters;
}

// ============================================================================
// PHYSICS COMPUTATION (Using PhasedArray for multi-array support)
// ============================================================================

/**
 * Compute the 2D interference pattern using the Superposition Principle.
 * For each pixel, sum the complex phasors from all transmitters.
 * 
 * Supports both legacy transmitters array and new units[] (PhasedArrayConfig[]).
 */
function computeInterferenceField(config: SimulationConfig): SimulationResult {
  const startTime = performance.now();
  
  const { gridSize, wavelength, fieldSize, normalize, units, medium } = config;
  const { width, height } = gridSize;
  
  // Convert units to transmitters if provided (OOP path)
  // Otherwise use legacy transmitters array
  const transmitters = units && units.length > 0
    ? unitsToTransmitters(units, medium)
    : config.transmitters || [];
  
  // Wave number k = 2π/λ
  const k = (2 * Math.PI) / wavelength;
  
  // Output buffer
  const intensityMap = new Float32Array(width * height);
  
  // Physical step size per pixel
  const dx = fieldSize.width / width;
  const dy = fieldSize.height / height;
  
  // Center offset (so field is centered at origin)
  const offsetX = fieldSize.width / 2;
  const offsetY = fieldSize.height / 2;
  
  let maxIntensity = 0;
  let minIntensity = Infinity;
  
  // Progress reporting interval
  const progressInterval = Math.floor(height / 10);
  
  // Iterate over each pixel
  for (let py = 0; py < height; py++) {
    // Check for cancellation periodically
    if (shouldCancel) {
      return {
        intensityMap: new Float32Array(0),
        width: 0,
        height: 0,
        maxIntensity: 0,
        minIntensity: 0,
        computeTimeMs: performance.now() - startTime,
      };
    }
    
    // Physical Y coordinate
    const y = py * dy - offsetY;
    
    for (let px = 0; px < width; px++) {
      // Physical X coordinate
      const x = px * dx - offsetX;
      
      // Sum complex phasors from all transmitters
      let realSum = 0;
      let imagSum = 0;
      
      for (let i = 0; i < transmitters.length; i++) {
        const tx = transmitters[i];
        
        // Distance from this point to transmitter
        const distX = x - tx.x;
        const distY = y - tx.y;
        const distance = Math.sqrt(distX * distX + distY * distY);
        
        // Phase: k * distance + transmitter phase offset
        const phase = k * distance + tx.phaseOffset;
        
        // Add phasor: A * e^(j*phase) = A * (cos(phase) + j*sin(phase))
        realSum += tx.amplitude * Math.cos(phase);
        imagSum += tx.amplitude * Math.sin(phase);
      }
      
      // Intensity = |V_total|^2 = real^2 + imag^2
      const intensity = realSum * realSum + imagSum * imagSum;
      
      const idx = py * width + px;
      intensityMap[idx] = intensity;
      
      if (intensity > maxIntensity) maxIntensity = intensity;
      if (intensity < minIntensity) minIntensity = intensity;
    }
    
    // Report progress
    if (py % progressInterval === 0) {
      const progress = (py / height) * 100;
      self.postMessage({
        type: 'PROGRESS',
        jobId: currentJobId,
        progress,
      } as WorkerResponse);
    }
  }
  
  // Normalize to 0-1 range if requested
  if (normalize && maxIntensity > minIntensity) {
    const range = maxIntensity - minIntensity;
    for (let i = 0; i < intensityMap.length; i++) {
      intensityMap[i] = (intensityMap[i] - minIntensity) / range;
    }
    // Update min/max after normalization
    minIntensity = 0;
    maxIntensity = 1;
  }
  
  const computeTimeMs = performance.now() - startTime;
  
  return {
    intensityMap,
    width,
    height,
    maxIntensity,
    minIntensity,
    computeTimeMs,
  };
}

// ============================================================================
// MESSAGE HANDLER
// ============================================================================

self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const { type, jobId, config } = event.data;
  
  switch (type) {
    case 'SIMULATE':
      if (!config) {
        self.postMessage({
          type: 'ERROR',
          jobId,
          error: 'No simulation config provided',
        } as WorkerResponse);
        return;
      }
      
      // Set current job
      currentJobId = jobId;
      shouldCancel = false;
      
      try {
        const result = computeInterferenceField(config);
        
        // Only send result if not cancelled
        if (!shouldCancel) {
          self.postMessage({
            type: 'RESULT',
            jobId,
            result,
          } as WorkerResponse);
        }
      } catch (error) {
        self.postMessage({
          type: 'ERROR',
          jobId,
          error: error instanceof Error ? error.message : 'Unknown error',
        } as WorkerResponse);
      }
      
      currentJobId = null;
      break;
      
    case 'CANCEL':
      if (currentJobId === jobId) {
        shouldCancel = true;
      }
      break;
  }
};

// TypeScript: Mark as module
export {};
