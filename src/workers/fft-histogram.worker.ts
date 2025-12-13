/// <reference lib="webworker" />

import type { WorkerMessageEnvelope } from './types';

/**
 * FFT Histogram Worker
 * Computes FFT and histogram data for source images off the main thread
 */

export interface FFTHistogramPayload {
  grayscale: Uint8ClampedArray;
  width: number;
  height: number;
  component: 'magnitude' | 'phase' | 'real' | 'imag';
}

export interface FFTHistogramResult {
  histogram: {
    bins: number[];
    min: number;
    max: number;
    mean: number;
    stdDev: number;
  };
  componentData: Uint8ClampedArray; // Normalized for visualization
  width: number;
  height: number;
}

declare const self: DedicatedWorkerGlobalScope;

// Import fft.js dynamically in worker context
let FFT: any = null;

async function loadFFT() {
  if (!FFT) {
    const fftModule = await import('fft.js');
    FFT = fftModule.default;
  }
  return FFT;
}

// Power of two helpers
function isPowerOfTwo(n: number): boolean {
  return n > 0 && (n & (n - 1)) === 0;
}

function nextPowerOfTwo(n: number): number {
  if (n <= 1) return 2;
  n--;
  n |= n >> 1;
  n |= n >> 2;
  n |= n >> 4;
  n |= n >> 8;
  n |= n >> 16;
  return n + 1;
}

// Pad array to power of two
function padToPow2(data: Float32Array, width: number, height: number, paddedW: number, paddedH: number): Float32Array {
  const padded = new Float32Array(paddedW * paddedH);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      padded[y * paddedW + x] = data[y * width + x];
    }
  }
  return padded;
}

// Perform 2D FFT
async function fft2d(grayscale: Uint8ClampedArray, width: number, height: number): Promise<{ real: Float32Array; imag: Float32Array }> {
  const FFTCtor = await loadFFT();
  
  const paddedW = isPowerOfTwo(width) ? width : nextPowerOfTwo(width);
  const paddedH = isPowerOfTwo(height) ? height : nextPowerOfTwo(height);
  
  // Convert to float and pad
  const input = new Float32Array(width * height);
  for (let i = 0; i < grayscale.length; i++) {
    input[i] = grayscale[i];
  }
  const padded = padToPow2(input, width, height, paddedW, paddedH);
  
  const fftW = new FFTCtor(paddedW);
  const fftH = new FFTCtor(paddedH);
  
  // Row-wise FFT
  const rowsRe = new Float32Array(paddedW * paddedH);
  const rowsIm = new Float32Array(paddedW * paddedH);
  
  for (let y = 0; y < paddedH; y++) {
    const rowIn = fftW.createComplexArray();
    const rowOut = fftW.createComplexArray();
    
    for (let x = 0; x < paddedW; x++) {
      rowIn[2 * x] = padded[y * paddedW + x];
      rowIn[2 * x + 1] = 0;
    }
    
    fftW.transform(rowOut, rowIn);
    
    for (let x = 0; x < paddedW; x++) {
      rowsRe[y * paddedW + x] = rowOut[2 * x];
      rowsIm[y * paddedW + x] = rowOut[2 * x + 1];
    }
  }
  
  // Column-wise FFT
  const real = new Float32Array(paddedW * paddedH);
  const imag = new Float32Array(paddedW * paddedH);
  
  for (let x = 0; x < paddedW; x++) {
    const colIn = fftH.createComplexArray();
    const colOut = fftH.createComplexArray();
    
    for (let y = 0; y < paddedH; y++) {
      colIn[2 * y] = rowsRe[y * paddedW + x];
      colIn[2 * y + 1] = rowsIm[y * paddedW + x];
    }
    
    fftH.transform(colOut, colIn);
    
    for (let y = 0; y < paddedH; y++) {
      real[y * paddedW + x] = colOut[2 * y];
      imag[y * paddedW + x] = colOut[2 * y + 1];
    }
  }
  
  // Unpad to original size
  const resultRe = new Float32Array(width * height);
  const resultIm = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      resultRe[y * width + x] = real[y * paddedW + x];
      resultIm[y * width + x] = imag[y * paddedW + x];
    }
  }
  
  return { real: resultRe, imag: resultIm };
}

// FFT shift to center DC
function fftShift(data: Float32Array, width: number, height: number): Float32Array {
  const result = new Float32Array(data.length);
  const halfW = Math.floor(width / 2);
  const halfH = Math.floor(height / 2);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const srcX = (x + halfW) % width;
      const srcY = (y + halfH) % height;
      result[y * width + x] = data[srcY * width + srcX];
    }
  }
  return result;
}

// Calculate histogram
function calculateHistogram(data: Float32Array, bins: number = 256) {
  const histogram = new Array(bins).fill(0);
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;

  for (let i = 0; i < data.length; i++) {
    const value = data[i];
    if (value < min) min = value;
    if (value > max) max = value;
    sum += value;
  }

  const mean = sum / data.length;
  const range = max - min || 1;

  let variance = 0;
  for (let i = 0; i < data.length; i++) {
    const value = data[i];
    const binIndex = Math.min(bins - 1, Math.floor(((value - min) / range) * bins));
    histogram[binIndex]++;
    variance += (value - mean) ** 2;
  }

  const stdDev = Math.sqrt(variance / data.length);
  const maxCount = Math.max(...histogram);
  const normalizedBins = histogram.map((count: number) => count / maxCount);

  return { bins: normalizedBins, min, max, mean, stdDev };
}

// Normalize to uint8
function normalizeToUint8(data: Float32Array, applyLog: boolean = false): Uint8ClampedArray {
  let processed = data;
  if (applyLog) {
    processed = new Float32Array(data.length);
    for (let i = 0; i < data.length; i++) {
      processed[i] = Math.log1p(Math.abs(data[i]));
    }
  }

  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < processed.length; i++) {
    if (processed[i] < min) min = processed[i];
    if (processed[i] > max) max = processed[i];
  }
  const range = max - min || 1;
  const result = new Uint8ClampedArray(processed.length);
  for (let i = 0; i < processed.length; i++) {
    result[i] = Math.round(((processed[i] - min) / range) * 255);
  }
  return result;
}

self.onmessage = async (event: MessageEvent<WorkerMessageEnvelope<FFTHistogramPayload>>) => {
  const { data } = event;
  if (!data) return;

  if (data.type !== 'JOB_START') return;

  const { jobId, payload } = data;
  if (!jobId || !payload) return;

  try {
    const { grayscale, width, height, component } = payload;
    
    // Perform FFT
    const { real, imag } = await fft2d(grayscale, width, height);
    
    // Extract requested component
    let componentData: Float32Array;
    let applyLog = false;
    
    switch (component) {
      case 'magnitude':
        componentData = new Float32Array(real.length);
        for (let i = 0; i < real.length; i++) {
          componentData[i] = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]);
        }
        applyLog = true; // Log scale for better visualization
        break;
      case 'phase':
        componentData = new Float32Array(real.length);
        for (let i = 0; i < real.length; i++) {
          componentData[i] = Math.atan2(imag[i], real[i]);
        }
        break;
      case 'real':
        componentData = real;
        break;
      case 'imag':
        componentData = imag;
        break;
      default:
        throw new Error(`Unknown component: ${component}`);
    }
    
    // Shift to center DC
    const shifted = fftShift(componentData, width, height);
    
    // Calculate histogram
    const histogram = calculateHistogram(shifted);
    
    // Normalize for visualization
    const visualData = normalizeToUint8(shifted, applyLog);
    
    const result: FFTHistogramResult = {
      histogram,
      componentData: visualData,
      width,
      height,
    };

    const envelope: WorkerMessageEnvelope = {
      type: 'JOB_COMPLETE',
      jobId,
      payload: result,
    };
    self.postMessage(envelope, [visualData.buffer]);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'FFT histogram worker error';
    const envelope: WorkerMessageEnvelope = {
      type: 'JOB_ERROR',
      jobId,
      error: message,
    };
    self.postMessage(envelope);
  }
};
