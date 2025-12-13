/**
 * ImageProcessor - Encapsulated DSP operations for image processing
 * Handles grayscale conversion, resizing, and FFT data extraction
 */

import { IMAGE_LIMITS } from '@/config/constants';

// Re-export for convenience
export const MAX_IMAGE_DIMENSION = IMAGE_LIMITS.maxDimension;

export interface ProcessedImageData {
  grayscale: Uint8ClampedArray;
  width: number;
  height: number;
  fftComponents?: {
    magnitude: Float32Array;
    phase: Float32Array;
    real: Float32Array;
    imag: Float32Array;
  };
}

export interface BrightnessContrastSettings {
  brightness: number; // -255 to 255
  contrast: number;   // 0.01 to 10
}

export interface HistogramData {
  bins: number[];
  min: number;
  max: number;
  mean: number;
  stdDev: number;
}

export class ImageProcessor {
  private canvas: OffscreenCanvas | HTMLCanvasElement;
  private ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

  constructor() {
    if (typeof OffscreenCanvas !== 'undefined') {
      this.canvas = new OffscreenCanvas(1, 1);
      this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
    } else {
      this.canvas = document.createElement('canvas');
      this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
    }
  }

  /**
   * Convert an image to grayscale using luminance formula
   */
  static toGrayscale(rgba: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
    const gray = new Uint8ClampedArray(width * height);
    for (let i = 0; i < width * height; i++) {
      const r = rgba[i * 4];
      const g = rgba[i * 4 + 1];
      const b = rgba[i * 4 + 2];
      // Luminance formula: 0.299*R + 0.587*G + 0.114*B
      gray[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    }
    return gray;
  }

  /**
   * Apply brightness and contrast adjustments to grayscale data
   */
  static applyBrightnessContrast(
    gray: Uint8ClampedArray,
    settings: BrightnessContrastSettings
  ): Uint8ClampedArray {
    const { brightness, contrast } = settings;
    const result = new Uint8ClampedArray(gray.length);
    const factor = (259 * (contrast * 255 + 255)) / (255 * (259 - contrast * 255));

    for (let i = 0; i < gray.length; i++) {
      let value = gray[i];
      // Apply contrast
      value = factor * (value - 128) + 128;
      // Apply brightness
      value += brightness;
      // Clamp to valid range
      result[i] = Math.max(0, Math.min(255, Math.round(value)));
    }
    return result;
  }

  /**
   * Resize an image to target dimensions using bilinear interpolation
   */
  async resizeImage(
    imageData: ImageData,
    targetWidth: number,
    targetHeight: number
  ): Promise<ImageData> {
    this.canvas.width = targetWidth;
    this.canvas.height = targetHeight;
    
    // Create temporary canvas for source
    const srcCanvas = typeof OffscreenCanvas !== 'undefined' 
      ? new OffscreenCanvas(imageData.width, imageData.height)
      : document.createElement('canvas');
    srcCanvas.width = imageData.width;
    srcCanvas.height = imageData.height;
    const srcCtx = srcCanvas.getContext('2d')!;
    srcCtx.putImageData(imageData, 0, 0);

    // Draw scaled
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = 'high';
    this.ctx.drawImage(srcCanvas as CanvasImageSource, 0, 0, targetWidth, targetHeight);

    return this.ctx.getImageData(0, 0, targetWidth, targetHeight);
  }

  /**
   * Load an image from a File with pre-emptive downscaling to prevent memory exhaustion.
   * Uses createImageBitmap for efficient browser-native resizing before any processing.
   * 
   * Memory calculation for a 3024x4032 image:
   * - 12.2M pixels × 2 (Real/Imag) × 8 bytes (Float64) ≈ 200MB per image
   * - With 4 images + FFT operations = potential gigabytes of RAM
   * 
   * Solution: Enforce soft cap (e.g., 1024px max dimension) before any processing.
   */
  async loadImageFile(
    file: File,
    maxDimension: number = MAX_IMAGE_DIMENSION
  ): Promise<{ imageData: ImageData; grayscale: Uint8ClampedArray; wasDownscaled: boolean; originalSize: { width: number; height: number } }> {
    // Use createImageBitmap for efficient, browser-native image loading and resizing
    const originalBitmap = await createImageBitmap(file);
    const originalWidth = originalBitmap.width;
    const originalHeight = originalBitmap.height;
    
    let bitmap = originalBitmap;
    let wasDownscaled = false;
    
    // Check if downscaling is needed
    if (originalWidth > maxDimension || originalHeight > maxDimension) {
      // Calculate scale factor to fit within maxDimension while preserving aspect ratio
      const scale = maxDimension / Math.max(originalWidth, originalHeight);
      const targetWidth = Math.round(originalWidth * scale);
      const targetHeight = Math.round(originalHeight * scale);
      
      // Use createImageBitmap with resizeWidth/resizeHeight for efficient downscaling
      // This happens at the browser level, before we allocate any large typed arrays
      bitmap = await createImageBitmap(file, {
        resizeWidth: targetWidth,
        resizeHeight: targetHeight,
        resizeQuality: 'high', // 'pixelated', 'low', 'medium', 'high'
      });
      
      wasDownscaled = true;
      console.log(
        `Image downscaled: ${originalWidth}×${originalHeight} → ${targetWidth}×${targetHeight} ` +
        `(${((originalWidth * originalHeight) / 1e6).toFixed(1)}MP → ${((targetWidth * targetHeight) / 1e6).toFixed(2)}MP)`
      );
      
      // Release the original bitmap to free memory immediately
      originalBitmap.close();
    }
    
    // Draw bitmap to canvas to get ImageData
    const width = bitmap.width;
    const height = bitmap.height;
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx.drawImage(bitmap, 0, 0);
    
    // Get image data and convert to grayscale
    const imageData = this.ctx.getImageData(0, 0, width, height);
    const grayscale = ImageProcessor.toGrayscale(imageData.data, width, height);
    
    // Release bitmap
    bitmap.close();
    
    return {
      imageData,
      grayscale,
      wasDownscaled,
      originalSize: { width: originalWidth, height: originalHeight },
    };
  }

  /**
   * Convert grayscale array back to RGBA ImageData for canvas rendering
   */
  static grayscaleToImageData(
    gray: Uint8ClampedArray,
    width: number,
    height: number
  ): ImageData {
    const rgba = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < gray.length; i++) {
      const v = gray[i];
      rgba[i * 4] = v;
      rgba[i * 4 + 1] = v;
      rgba[i * 4 + 2] = v;
      rgba[i * 4 + 3] = 255;
    }
    return new ImageData(rgba, width, height);
  }

  /**
   * Calculate histogram for a given data array
   */
  static calculateHistogram(data: Float32Array | Uint8ClampedArray, bins: number = 256): HistogramData {
    const histogram = new Array(bins).fill(0);
    let min = Infinity;
    let max = -Infinity;
    let sum = 0;

    // First pass: find range and sum
    for (let i = 0; i < data.length; i++) {
      const value = data[i];
      if (value < min) min = value;
      if (value > max) max = value;
      sum += value;
    }

    const mean = sum / data.length;
    const range = max - min || 1;

    // Second pass: calculate histogram and variance
    let variance = 0;
    for (let i = 0; i < data.length; i++) {
      const value = data[i];
      const binIndex = Math.min(bins - 1, Math.floor(((value - min) / range) * bins));
      histogram[binIndex]++;
      variance += (value - mean) ** 2;
    }

    const stdDev = Math.sqrt(variance / data.length);

    // Normalize histogram
    const maxCount = Math.max(...histogram);
    const normalizedBins = histogram.map(count => count / maxCount);

    return { bins: normalizedBins, min, max, mean, stdDev };
  }

  /**
   * Extract magnitude from FFT complex data
   */
  static extractMagnitude(real: Float32Array, imag: Float32Array): Float32Array {
    const magnitude = new Float32Array(real.length);
    for (let i = 0; i < real.length; i++) {
      magnitude[i] = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]);
    }
    return magnitude;
  }

  /**
   * Extract phase from FFT complex data
   */
  static extractPhase(real: Float32Array, imag: Float32Array): Float32Array {
    const phase = new Float32Array(real.length);
    for (let i = 0; i < real.length; i++) {
      phase[i] = Math.atan2(imag[i], real[i]);
    }
    return phase;
  }

  /**
   * Normalize array to 0-255 range for visualization
   */
  static normalizeToUint8(data: Float32Array): Uint8ClampedArray {
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < data.length; i++) {
      if (data[i] < min) min = data[i];
      if (data[i] > max) max = data[i];
    }
    const range = max - min || 1;
    const result = new Uint8ClampedArray(data.length);
    for (let i = 0; i < data.length; i++) {
      result[i] = Math.round(((data[i] - min) / range) * 255);
    }
    return result;
  }

  /**
   * Apply log scaling for better FFT visualization
   */
  static logScale(data: Float32Array): Float32Array {
    const result = new Float32Array(data.length);
    for (let i = 0; i < data.length; i++) {
      result[i] = Math.log1p(Math.abs(data[i]));
    }
    return result;
  }

  /**
   * Shift FFT data to center DC component
   */
  static fftShift(data: Float32Array, width: number, height: number): Float32Array {
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
}

export default ImageProcessor;
