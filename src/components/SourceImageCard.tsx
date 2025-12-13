import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { ImageProcessor } from '@/dsp/ImageProcessor';
import type { FFTHistogramResult } from '@/workers/fft-histogram.worker';

export type FTComponentView = 'magnitude' | 'phase' | 'real' | 'imag';

export interface RegionRect {
  x: number;      // percentage 0-100
  y: number;      // percentage 0-100  
  width: number;  // percentage 0-100
  height: number; // percentage 0-100
}

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
  regionRect?: RegionRect | null;
  onRegionChange?: (region: RegionRect) => void;
  isLoading?: boolean;
}

const SLOT_LABELS = ['Input A (FFT)', 'Input B (Wavelet)', 'Reference C (STFT)', 'Noise D (Gaussian)'];
const COMPONENT_TABS: { key: FTComponentView; label: string }[] = [
  { key: 'magnitude', label: 'Magnitude' },
  { key: 'phase', label: 'Phase' },
  { key: 'real', label: 'Real' },
  { key: 'imag', label: 'Imag' },
];

export const SourceImageCard: React.FC<SourceImageCardProps> = ({
  slot,
  slotIndex,
  onImageLoad,
  onBrightnessContrastChange,
  onComponentChange,
  regionRect,
  onRegionChange,
  isLoading = false,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageCanvasRef = useRef<HTMLCanvasElement>(null);
  const chartCanvasRef = useRef<HTMLCanvasElement>(null);
  const thumbnailCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0, brightness: 0, contrast: 1 });
  const [isResizingRegion, setIsResizingRegion] = useState(false);
  const [resizeHandle, setResizeHandle] = useState<string | null>(null);
  const [regionDragStart, setRegionDragStart] = useState<{ x: number; y: number; rect: RegionRect } | null>(null);

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

  // Handle brightness/contrast drag on image
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0 || !slot.grayscale) return;
    
    // Check if clicking on region handles
    if (regionRect && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const relX = ((e.clientX - rect.left) / rect.width) * 100;
      const relY = ((e.clientY - rect.top) / rect.height) * 100;
      
      const handleSize = 3; // percentage
      const { x, y, width, height } = regionRect;
      
      // Check corners for resize
      if (Math.abs(relX - (x + width)) < handleSize && Math.abs(relY - (y + height)) < handleSize) {
        setIsResizingRegion(true);
        setResizeHandle('se');
        setRegionDragStart({ x: e.clientX, y: e.clientY, rect: { ...regionRect } });
        return;
      }
      
      // Check if inside region for move
      if (relX >= x && relX <= x + width && relY >= y && relY <= y + height) {
        setIsResizingRegion(true);
        setResizeHandle('move');
        setRegionDragStart({ x: e.clientX, y: e.clientY, rect: { ...regionRect } });
        return;
      }
    }
    
    setIsDragging(true);
    setDragStart({
      x: e.clientX,
      y: e.clientY,
      brightness: slot.brightness,
      contrast: slot.contrast,
    });
  }, [slot.grayscale, slot.brightness, slot.contrast, regionRect]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isResizingRegion && regionDragStart && onRegionChange && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const deltaXPct = ((e.clientX - regionDragStart.x) / rect.width) * 100;
      const deltaYPct = ((e.clientY - regionDragStart.y) / rect.height) * 100;
      
      if (resizeHandle === 'se') {
        // Resize from bottom-right
        onRegionChange({
          ...regionDragStart.rect,
          width: Math.max(10, Math.min(100 - regionDragStart.rect.x, regionDragStart.rect.width + deltaXPct)),
          height: Math.max(10, Math.min(100 - regionDragStart.rect.y, regionDragStart.rect.height + deltaYPct)),
        });
      } else if (resizeHandle === 'move') {
        // Move the region
        const newX = Math.max(0, Math.min(100 - regionDragStart.rect.width, regionDragStart.rect.x + deltaXPct));
        const newY = Math.max(0, Math.min(100 - regionDragStart.rect.height, regionDragStart.rect.y + deltaYPct));
        onRegionChange({
          ...regionDragStart.rect,
          x: newX,
          y: newY,
        });
      }
      return;
    }
    
    if (!isDragging) return;
    
    const deltaX = e.clientX - dragStart.x;
    const deltaY = e.clientY - dragStart.y;
    
    const newContrast = Math.max(0.01, Math.min(3, dragStart.contrast + deltaX * 0.01));
    const newBrightness = Math.max(-100, Math.min(100, dragStart.brightness - deltaY * 0.5));
    
    onBrightnessContrastChange(slot.id, newBrightness, newContrast);
  }, [isDragging, isResizingRegion, dragStart, regionDragStart, resizeHandle, slot.id, onBrightnessContrastChange, onRegionChange]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setIsResizingRegion(false);
    setResizeHandle(null);
    setRegionDragStart(null);
  }, []);

  // Render source image with region overlay
  useEffect(() => {
    const canvas = imageCanvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    const w = rect.width;
    const h = rect.height;

    // Dark background
    ctx.fillStyle = '#0a0c14';
    ctx.fillRect(0, 0, w, h);

    if (slot.grayscale) {
      // Apply brightness/contrast
      const adjusted = ImageProcessor.applyBrightnessContrast(slot.grayscale, {
        brightness: slot.brightness,
        contrast: slot.contrast,
      });

      // Create temp canvas for image
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = slot.width;
      tempCanvas.height = slot.height;
      const tempCtx = tempCanvas.getContext('2d');
      
      if (tempCtx) {
        const imageData = ImageProcessor.grayscaleToImageData(adjusted, slot.width, slot.height);
        tempCtx.putImageData(imageData, 0, 0);
        
        // Scale to fit with padding
        const padding = 4;
        const availW = w - padding * 2;
        const availH = h - padding * 2;
        const scale = Math.min(availW / slot.width, availH / slot.height);
        const drawW = slot.width * scale;
        const drawH = slot.height * scale;
        const offsetX = (w - drawW) / 2;
        const offsetY = (h - drawH) / 2;
        
        ctx.drawImage(tempCanvas, offsetX, offsetY, drawW, drawH);
        
        // Draw region selection rectangle
        if (regionRect) {
          const rx = offsetX + (regionRect.x / 100) * drawW;
          const ry = offsetY + (regionRect.y / 100) * drawH;
          const rw = (regionRect.width / 100) * drawW;
          const rh = (regionRect.height / 100) * drawH;
          
          // Semi-transparent fill
          ctx.fillStyle = 'rgba(77, 208, 225, 0.15)';
          ctx.fillRect(rx, ry, rw, rh);
          
          // Border
          ctx.strokeStyle = 'rgba(77, 208, 225, 0.7)';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(rx, ry, rw, rh);
          
          // Resize handle (bottom-right corner)
          const handleSize = 6;
          ctx.fillStyle = 'rgba(77, 208, 225, 0.9)';
          ctx.fillRect(rx + rw - handleSize, ry + rh - handleSize, handleSize, handleSize);
        }
      }
    } else {
      // Empty state placeholder
      ctx.fillStyle = 'rgba(77, 208, 225, 0.1)';
      ctx.font = '10px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('Double-click to load', w / 2, h / 2);
    }
  }, [slot.grayscale, slot.width, slot.height, slot.brightness, slot.contrast, regionRect]);

  // Render chart/histogram
  useEffect(() => {
    const canvas = chartCanvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    const w = rect.width;
    const h = rect.height;

    // Background
    ctx.fillStyle = '#0a0c14';
    ctx.fillRect(0, 0, w, h);

    const histogram = slot.fftData?.histograms?.[slot.selectedComponent];
    
    if (histogram && histogram.bins.length > 0) {
      const bins = histogram.bins;
      const barWidth = w / bins.length;
      const maxBin = Math.max(...bins);
      
      // Draw filled area
      ctx.beginPath();
      ctx.moveTo(0, h);
      
      for (let i = 0; i < bins.length; i++) {
        const x = i * barWidth;
        const barH = maxBin > 0 ? (bins[i] / maxBin) * h * 0.85 : 0;
        ctx.lineTo(x, h - barH);
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      
      // Gradient fill
      const gradient = ctx.createLinearGradient(0, h, 0, 0);
      gradient.addColorStop(0, 'rgba(77, 208, 225, 0.05)');
      gradient.addColorStop(1, 'rgba(77, 208, 225, 0.25)');
      ctx.fillStyle = gradient;
      ctx.fill();
      
      // Draw line on top
      ctx.beginPath();
      for (let i = 0; i < bins.length; i++) {
        const x = i * barWidth + barWidth / 2;
        const barH = maxBin > 0 ? (bins[i] / maxBin) * h * 0.85 : 0;
        if (i === 0) ctx.moveTo(x, h - barH);
        else ctx.lineTo(x, h - barH);
      }
      ctx.strokeStyle = 'rgba(77, 208, 225, 0.6)';
      ctx.lineWidth = 1;
      ctx.stroke();
      
      // Draw region overlay on chart too
      if (regionRect) {
        const rx = (regionRect.x / 100) * w;
        const rw = (regionRect.width / 100) * w;
        
        ctx.fillStyle = 'rgba(77, 208, 225, 0.12)';
        ctx.fillRect(rx, 0, rw, h);
        
        ctx.strokeStyle = 'rgba(77, 208, 225, 0.5)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.strokeRect(rx, 0, rw, h);
        ctx.setLineDash([]);
      }
    } else {
      // Placeholder wave
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      for (let x = 0; x < w; x++) {
        const y = h / 2 + Math.sin(x * 0.05 + slotIndex) * (h * 0.2) * Math.exp(-x / (w * 0.7));
        ctx.lineTo(x, y);
      }
      ctx.strokeStyle = 'rgba(77, 208, 225, 0.2)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }, [slot.fftData, slot.selectedComponent, slotIndex, regionRect]);

  // Render thumbnail histogram in footer
  useEffect(() => {
    const canvas = thumbnailCanvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    const w = rect.width;
    const h = rect.height;

    ctx.fillStyle = '#0a0c14';
    ctx.fillRect(0, 0, w, h);

    // Draw a simple grayscale histogram from the image
    if (slot.grayscale) {
      const bins = new Array(32).fill(0);
      for (let i = 0; i < slot.grayscale.length; i++) {
        const bin = Math.floor(slot.grayscale[i] / 8);
        bins[Math.min(bin, 31)]++;
      }
      const maxBin = Math.max(...bins);
      
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let i = 0; i < bins.length; i++) {
        const x = (i / bins.length) * w;
        const bh = maxBin > 0 ? (bins[i] / maxBin) * h * 0.8 : 0;
        ctx.lineTo(x, h - bh);
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      
      const gradient = ctx.createLinearGradient(0, h, 0, 0);
      gradient.addColorStop(0, 'rgba(77, 208, 225, 0.1)');
      gradient.addColorStop(1, 'rgba(77, 208, 225, 0.4)');
      ctx.fillStyle = gradient;
      ctx.fill();
    }
  }, [slot.grayscale]);

  const displayLabel = useMemo(() => {
    return slot.label || SLOT_LABELS[slotIndex] || `Slot ${slotIndex + 1}`;
  }, [slot.label, slotIndex]);

  return (
    <div className={`source-card ${slot.grayscale ? 'loaded' : ''} ${isLoading ? 'loading' : ''}`}>
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/bmp,image/tiff"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
      
      {/* Main content row */}
      <div className="card-row">
        {/* Left: Image viewport */}
        <div 
          ref={containerRef}
          className={`image-viewport ${isDragging ? 'dragging' : ''}`}
          onDoubleClick={handleDoubleClick}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <canvas ref={imageCanvasRef} className="viewport-canvas" />
          {isLoading && (
            <div className="loading-spinner">
              <div className="spinner" />
            </div>
          )}
        </div>
        
        {/* Right: Chart with tabs */}
        <div className="chart-panel">
          <div className="chart-tabs">
            {COMPONENT_TABS.map(({ key, label }) => (
              <button
                key={key}
                className={`tab ${slot.selectedComponent === key ? 'active' : ''}`}
                onClick={() => onComponentChange(slot.id, key)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="chart-area">
            <canvas ref={chartCanvasRef} className="chart-canvas" />
          </div>
        </div>
      </div>
      
      {/* Footer label */}
      <div className="card-footer">
        <span className="label">{displayLabel}</span>
        <canvas ref={thumbnailCanvasRef} className="thumbnail-histogram" />
      </div>
    </div>
  );
};

export default SourceImageCard;
