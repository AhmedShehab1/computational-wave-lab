import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { ImageProcessor } from '@/dsp/ImageProcessor';
import type { FFTHistogramResult } from '@/workers/fft-histogram.worker';

export type FTComponentView = 'magnitude' | 'phase' | 'real' | 'imag';

export interface ImageSlotData {
  id: string;
  label: string;
  rawImageData: ImageData | null;
  grayscale: Uint8ClampedArray | null;
  width: number;
  height: number;
  brightness: number;
  contrast: number;
  fftData?: {
    magnitude: Uint8ClampedArray;
    phase: Uint8ClampedArray;
    real: Uint8ClampedArray;
    imag: Uint8ClampedArray;
    histograms: {
      magnitude: FFTHistogramResult['histogram'];
      phase: FFTHistogramResult['histogram'];
      real: FFTHistogramResult['histogram'];
      imag: FFTHistogramResult['histogram'];
    };
  };
  selectedComponent: FTComponentView;
}

interface SourceImageCardProps {
  slot: ImageSlotData;
  slotIndex: number;
  onImageLoad: (slotId: string, file: File) => void;
  onBrightnessContrastChange: (slotId: string, brightness: number, contrast: number) => void;
  onComponentChange: (slotId: string, component: FTComponentView) => void;
  regionSelection?: { x: number; y: number; width: number; height: number } | null;
  onRegionChange?: (region: { x: number; y: number; width: number; height: number }) => void;
  isLoading?: boolean;
}

const SLOT_LABELS = ['Input A (FFT)', 'Input B (Wavelet)', 'Reference C (STFT)', 'Noise D (Gaussian)'];
const COMPONENT_TABS: FTComponentView[] = ['magnitude', 'phase', 'real', 'imag'];

export const SourceImageCard: React.FC<SourceImageCardProps> = ({
  slot,
  slotIndex,
  onImageLoad,
  onBrightnessContrastChange,
  onComponentChange,
  regionSelection,
  isLoading = false,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sourceCanvasRef = useRef<HTMLCanvasElement>(null);
  const ftCanvasRef = useRef<HTMLCanvasElement>(null);
  const histogramCanvasRef = useRef<HTMLCanvasElement>(null);
  
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0, brightness: 0, contrast: 1 });
  const [isHovering, setIsHovering] = useState(false);

  // Handle double-click to trigger file picker
  const handleDoubleClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // Handle file selection
  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      onImageLoad(slot.id, file);
    }
    // Reset input so same file can be selected again
    e.target.value = '';
  }, [slot.id, onImageLoad]);

  // Handle drag events for file drop
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      onImageLoad(slot.id, file);
    }
  }, [slot.id, onImageLoad]);

  // Handle brightness/contrast drag
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    setDragStart({
      x: e.clientX,
      y: e.clientY,
      brightness: slot.brightness,
      contrast: slot.contrast,
    });
  }, [slot.brightness, slot.contrast]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    
    const deltaX = e.clientX - dragStart.x;
    const deltaY = e.clientY - dragStart.y;
    
    // Horizontal drag = contrast (scaled to reasonable range)
    const newContrast = Math.max(0.01, Math.min(3, dragStart.contrast + deltaX * 0.01));
    // Vertical drag = brightness (inverted - up increases brightness)
    const newBrightness = Math.max(-100, Math.min(100, dragStart.brightness - deltaY * 0.5));
    
    onBrightnessContrastChange(slot.id, newBrightness, newContrast);
  }, [isDragging, dragStart, slot.id, onBrightnessContrastChange]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Render source image with brightness/contrast
  useEffect(() => {
    const canvas = sourceCanvasRef.current;
    if (!canvas || !slot.grayscale) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = slot.width;
    canvas.height = slot.height;

    // Apply brightness/contrast
    const adjusted = ImageProcessor.applyBrightnessContrast(slot.grayscale, {
      brightness: slot.brightness,
      contrast: slot.contrast,
    });

    // Convert to ImageData
    const imageData = ImageProcessor.grayscaleToImageData(adjusted, slot.width, slot.height);
    ctx.putImageData(imageData, 0, 0);

    // Draw region selection overlay if present
    if (regionSelection) {
      ctx.strokeStyle = 'rgba(77, 208, 225, 0.8)';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(
        regionSelection.x,
        regionSelection.y,
        regionSelection.width,
        regionSelection.height
      );
      ctx.fillStyle = 'rgba(77, 208, 225, 0.1)';
      ctx.fillRect(
        regionSelection.x,
        regionSelection.y,
        regionSelection.width,
        regionSelection.height
      );
    }
  }, [slot.grayscale, slot.width, slot.height, slot.brightness, slot.contrast, regionSelection]);

  // Render FT component visualization
  useEffect(() => {
    const canvas = ftCanvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    const width = rect.width;
    const height = rect.height;

    // Dark background
    ctx.fillStyle = '#0a0c14';
    ctx.fillRect(0, 0, width, height);

    const componentData = slot.fftData?.[slot.selectedComponent];
    
    if (componentData && slot.fftData) {
      // Render actual FT component data
      const imgWidth = slot.width;
      const imgHeight = slot.height;
      
      // Create temporary canvas for the FFT data
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = imgWidth;
      tempCanvas.height = imgHeight;
      const tempCtx = tempCanvas.getContext('2d');
      
      if (tempCtx) {
        const imageData = ImageProcessor.grayscaleToImageData(componentData, imgWidth, imgHeight);
        tempCtx.putImageData(imageData, 0, 0);
        
        // Scale to fit
        const scale = Math.min(width / imgWidth, height / imgHeight) * 0.9;
        const offsetX = (width - imgWidth * scale) / 2;
        const offsetY = (height - imgHeight * scale) / 2;
        
        ctx.drawImage(tempCanvas, offsetX, offsetY, imgWidth * scale, imgHeight * scale);
      }
    } else {
      // Placeholder visualization - frequency domain placeholder
      const centerX = width / 2;
      const centerY = height / 2;
      
      // Draw frequency rings
      ctx.strokeStyle = 'rgba(77, 208, 225, 0.15)';
      ctx.lineWidth = 0.5;
      for (let r = 15; r < Math.min(width, height) / 2; r += 15) {
        ctx.beginPath();
        ctx.arc(centerX, centerY, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      
      // Cross lines
      ctx.beginPath();
      ctx.moveTo(0, centerY);
      ctx.lineTo(width, centerY);
      ctx.moveTo(centerX, 0);
      ctx.lineTo(centerX, height);
      ctx.stroke();
      
      // Center dot
      ctx.fillStyle = '#4dd0e1';
      ctx.beginPath();
      ctx.arc(centerX, centerY, 3, 0, Math.PI * 2);
      ctx.fill();
      
      // Label
      ctx.fillStyle = 'rgba(107, 122, 148, 0.6)';
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Waiting for FFT...', centerX, height - 10);
    }
  }, [slot.fftData, slot.selectedComponent, slot.width, slot.height]);

  // Render histogram
  useEffect(() => {
    const canvas = histogramCanvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    const width = rect.width;
    const height = rect.height;

    // Dark background with subtle grid
    ctx.fillStyle = '#0b0d15';
    ctx.fillRect(0, 0, width, height);
    
    // Grid lines
    ctx.strokeStyle = 'rgba(77, 208, 225, 0.05)';
    ctx.lineWidth = 0.5;
    for (let y = 0; y < height; y += 10) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    const histogram = slot.fftData?.histograms?.[slot.selectedComponent];
    
    if (histogram && histogram.bins.length > 0) {
      const bins = histogram.bins;
      const barWidth = width / bins.length;
      
      // Draw histogram bars with gradient
      const gradient = ctx.createLinearGradient(0, height, 0, 0);
      gradient.addColorStop(0, 'rgba(77, 208, 225, 0.3)');
      gradient.addColorStop(1, 'rgba(77, 208, 225, 0.8)');
      ctx.fillStyle = gradient;
      
      for (let i = 0; i < bins.length; i++) {
        const barHeight = bins[i] * height * 0.9;
        ctx.fillRect(i * barWidth, height - barHeight, barWidth - 0.5, barHeight);
      }
      
      // Draw envelope line
      ctx.strokeStyle = '#4dd0e1';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < bins.length; i++) {
        const x = i * barWidth + barWidth / 2;
        const y = height - bins[i] * height * 0.9;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      
      // Stats overlay
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(4, 4, 80, 36);
      ctx.fillStyle = '#8892a6';
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`μ: ${histogram.mean.toFixed(1)}`, 8, 16);
      ctx.fillText(`σ: ${histogram.stdDev.toFixed(1)}`, 8, 28);
      ctx.fillText(`[${histogram.min.toFixed(0)}, ${histogram.max.toFixed(0)}]`, 8, 40);
    } else {
      // Placeholder waveform
      ctx.strokeStyle = 'rgba(77, 208, 225, 0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      for (let x = 0; x < width; x++) {
        const y = height / 2 + Math.sin(x * 0.08 + slotIndex * 1.5) * (height * 0.25);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }, [slot.fftData, slot.selectedComponent, slotIndex]);

  // Computed display label
  const displayLabel = useMemo(() => {
    return slot.label || SLOT_LABELS[slotIndex] || `Slot ${slotIndex + 1}`;
  }, [slot.label, slotIndex]);

  return (
    <div 
      className={`source-image-card ${slot.grayscale ? 'has-image' : 'empty'} ${isLoading ? 'loading' : ''}`}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => { setIsHovering(false); setIsDragging(false); }}
    >
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/bmp,image/tiff"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
      
      {/* Component tabs */}
      <div className="component-tabs" role="tablist">
        {COMPONENT_TABS.map((comp) => (
          <button
            key={comp}
            className={`component-tab ${slot.selectedComponent === comp ? 'active' : ''}`}
            onClick={() => onComponentChange(slot.id, comp)}
            role="tab"
            aria-selected={slot.selectedComponent === comp}
          >
            {comp.charAt(0).toUpperCase() + comp.slice(1)}
          </button>
        ))}
      </div>

      {/* Main dual-pane content */}
      <div className="card-content">
        {/* Left pane - Source image */}
        <div 
          className={`source-pane ${isDragging ? 'dragging' : ''}`}
          onDoubleClick={handleDoubleClick}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          title="Double-click to load image. Drag to adjust brightness (↕) / contrast (↔)"
        >
          {slot.grayscale ? (
            <canvas ref={sourceCanvasRef} className="source-canvas" />
          ) : (
            <div className="placeholder">
              <div className="placeholder-icon">📷</div>
              <div className="placeholder-text">Double-click or drop image</div>
            </div>
          )}
          
          {/* Brightness/Contrast indicator */}
          {isHovering && slot.grayscale && (
            <div className="bc-indicator">
              <span>B: {slot.brightness.toFixed(0)}</span>
              <span>C: {slot.contrast.toFixed(2)}</span>
            </div>
          )}
          
          {isLoading && (
            <div className="loading-overlay">
              <div className="spinner" />
              <span>Processing...</span>
            </div>
          )}
        </div>

        {/* Right pane - FT visualization */}
        <div className="ft-pane">
          <canvas ref={ftCanvasRef} className="ft-canvas" />
        </div>
      </div>

      {/* Histogram strip */}
      <div className="histogram-strip">
        <canvas ref={histogramCanvasRef} className="histogram-canvas" />
      </div>

      {/* Label bar */}
      <div className="card-label">
        <span className="slot-id">{['A', 'B', 'C', 'D'][slotIndex]}</span>
        <span className="label-text">{displayLabel}</span>
        {slot.grayscale && (
          <span className="dimensions">{slot.width}×{slot.height}</span>
        )}
      </div>
    </div>
  );
};

export default SourceImageCard;
