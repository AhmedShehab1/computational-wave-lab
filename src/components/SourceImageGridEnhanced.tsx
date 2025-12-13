import React, { useCallback, useEffect, useState, useRef } from 'react';
import { SourceImageCard, type ImageSlotData, type FTComponentView, type RegionRect } from './SourceImageCard';
import { ImageProcessor } from '@/dsp/ImageProcessor';
import { WorkerManager } from '@/workers/pool';
import type { FFTHistogramResult, FFTHistogramPayload } from '@/workers/fft-histogram.worker';
import './SourceImageGridEnhanced.css';

interface SourceImageGridEnhancedProps {
  onImagesChange?: (images: ImageSlotData[]) => void;
  onRegionConfigChange?: (config: { rect: RegionRect; mode: 'inner' | 'outer' }) => void;
  initialImages?: ImageSlotData[];
}

const createEmptySlot = (id: string, _index: number): ImageSlotData => ({
  id,
  label: '',
  rawImageData: null,
  grayscale: null,
  width: 0,
  height: 0,
  brightness: 0,
  contrast: 1,
  selectedComponent: 'magnitude',
});

const SLOT_IDS = ['A', 'B', 'C', 'D'];

// Default region: centered 40% rectangle
const DEFAULT_REGION: RegionRect = { x: 30, y: 30, width: 40, height: 40 };

// Create worker for FFT histogram calculations
const createHistogramWorker = () =>
  new Worker(new URL('../workers/fft-histogram.worker.ts', import.meta.url), { type: 'module' });

export const SourceImageGridEnhanced: React.FC<SourceImageGridEnhancedProps> = ({
  onImagesChange,
  onRegionConfigChange,
  initialImages,
}) => {
  const [slots, setSlots] = useState<ImageSlotData[]>(() =>
    initialImages || SLOT_IDS.map((id, i) => createEmptySlot(id, i))
  );
  const [loadingSlots, setLoadingSlots] = useState<Record<string, boolean>>({});
  const [normalizedSize, setNormalizedSize] = useState<{ width: number; height: number } | null>(null);
  const [regionRect, setRegionRect] = useState<RegionRect>(DEFAULT_REGION);
  const [regionMode, setRegionMode] = useState<'inner' | 'outer'>('inner');
  
  const workerPoolRef = useRef<WorkerManager<FFTHistogramPayload> | null>(null);
  const imageProcessorRef = useRef<ImageProcessor>(new ImageProcessor());
  const slotsRef = useRef<ImageSlotData[]>(slots);

  // Keep ref in sync with state
  useEffect(() => {
    slotsRef.current = slots;
  }, [slots]);

  // Initialize worker pool
  useEffect(() => {
    workerPoolRef.current = new WorkerManager<FFTHistogramPayload>(createHistogramWorker, {
      poolSize: 2,
      warmupOnLoad: false,
      idleTimeout: 30000,
      maxQueueDepth: 8,
    });

    return () => {
      // Cleanup would go here if WorkerManager had a dispose method
    };
  }, []);

  // Notify parent of changes
  useEffect(() => {
    onImagesChange?.(slots);
  }, [slots, onImagesChange]);

  // Notify parent of region config changes
  useEffect(() => {
    onRegionConfigChange?.({ rect: regionRect, mode: regionMode });
  }, [regionRect, regionMode, onRegionConfigChange]);

  // Calculate unified size from loaded images
  const calculateUnifiedSize = useCallback((currentSlots: ImageSlotData[]) => {
    const loadedSlots = currentSlots.filter(s => s.grayscale !== null);
    if (loadedSlots.length === 0) {
      setNormalizedSize(null);
      return null;
    }
    
    const minWidth = Math.min(...loadedSlots.map(s => s.width));
    const minHeight = Math.min(...loadedSlots.map(s => s.height));
    
    setNormalizedSize({ width: minWidth, height: minHeight });
    return { width: minWidth, height: minHeight };
  }, []);

  // Process FFT for a slot
  const processFFT = useCallback(async (slotId: string, grayscale: Uint8ClampedArray, width: number, height: number) => {
    if (!workerPoolRef.current) return;

    const components: FTComponentView[] = ['magnitude', 'phase', 'real', 'imag'];
    const componentData: Record<string, Uint8ClampedArray> = {};
    const histogramData: Record<string, FFTHistogramResult['histogram']> = {};

    try {
      // Process all components in parallel for better performance
      const results = await Promise.all(
        components.map(async (component) => {
          const jobId = `fft-${slotId}-${component}-${Date.now()}-${Math.random()}`;
          const result = await workerPoolRef.current!.enqueue({
            id: jobId,
            payload: { grayscale, width, height, component },
          }) as FFTHistogramResult;
          return { component, result };
        })
      );

      for (const { component, result } of results) {
        componentData[component] = result.componentData;
        histogramData[component] = result.histogram;
      }

      // Build FFT data object
      const fftData: ImageSlotData['fftData'] = {
        magnitude: componentData.magnitude,
        phase: componentData.phase,
        real: componentData.real,
        imag: componentData.imag,
        histograms: {
          magnitude: histogramData.magnitude,
          phase: histogramData.phase,
          real: histogramData.real,
          imag: histogramData.imag,
        },
      };

      // Update slot with FFT data
      setSlots(prev => prev.map(s => 
        s.id === slotId 
          ? { ...s, fftData }
          : s
      ));
    } catch (err) {
      console.error(`FFT processing failed for slot ${slotId}:`, err);
    }
  }, []);

  // Handle image load for a slot
  const handleImageLoad = useCallback(async (slotId: string, file: File) => {
    setLoadingSlots(prev => ({ ...prev, [slotId]: true }));

    try {
      const processor = imageProcessorRef.current;
      const { imageData, grayscale, wasDownscaled, originalSize } = await processor.loadImageFile(file);
      
      // Log downscaling info for user awareness
      if (wasDownscaled) {
        console.info(
          `🖼️ Image "${file.name}" was automatically downscaled from ` +
          `${originalSize.width}×${originalSize.height} to ${imageData.width}×${imageData.height} ` +
          `to prevent memory exhaustion during FFT processing.`
        );
      }
      
      // Use ref to get current slots without stale closure
      const currentSlots = slotsRef.current.map(s => 
        s.id === slotId 
          ? { ...s, rawImageData: imageData, grayscale, width: imageData.width, height: imageData.height }
          : s
      );
      
      const unifiedSize = calculateUnifiedSize(currentSlots);
      
      // Resize if needed
      let finalGrayscale = grayscale;
      let finalWidth = imageData.width;
      let finalHeight = imageData.height;
      
      if (unifiedSize && (imageData.width !== unifiedSize.width || imageData.height !== unifiedSize.height)) {
        const resized = await processor.resizeImage(imageData, unifiedSize.width, unifiedSize.height);
        finalGrayscale = ImageProcessor.toGrayscale(resized.data, resized.width, resized.height);
        finalWidth = resized.width;
        finalHeight = resized.height;
      }
      
      // Update slot
      setSlots(prev => prev.map(s => 
        s.id === slotId 
          ? {
              ...s,
              label: file.name.replace(/\.[^/.]+$/, '') + (wasDownscaled ? ' (scaled)' : ''),
              rawImageData: imageData,
              grayscale: finalGrayscale,
              width: finalWidth,
              height: finalHeight,
              brightness: 0,
              contrast: 1,
              fftData: undefined, // Clear old FFT data
            }
          : s
      ));
      
      // Resize other loaded images if this changes the unified size
      if (unifiedSize) {
        const otherLoadedSlots = currentSlots.filter(s => s.id !== slotId && s.grayscale !== null);
        for (const otherSlot of otherLoadedSlots) {
          if (otherSlot.width !== unifiedSize.width || otherSlot.height !== unifiedSize.height) {
            if (otherSlot.rawImageData) {
              const resized = await processor.resizeImage(otherSlot.rawImageData, unifiedSize.width, unifiedSize.height);
              const resizedGray = ImageProcessor.toGrayscale(resized.data, resized.width, resized.height);
              
              setSlots(prev => prev.map(s =>
                s.id === otherSlot.id
                  ? { ...s, grayscale: resizedGray, width: resized.width, height: resized.height, fftData: undefined }
                  : s
              ));
              
              // Re-process FFT for resized image
              processFFT(otherSlot.id, resizedGray, resized.width, resized.height);
            }
          }
        }
      }
      
      // Process FFT for new image
      processFFT(slotId, finalGrayscale, finalWidth, finalHeight);
      
    } catch (err) {
      console.error(`Failed to load image for slot ${slotId}:`, err);
    } finally {
      setLoadingSlots(prev => ({ ...prev, [slotId]: false }));
    }
  }, [calculateUnifiedSize, processFFT]);

  // Handle brightness/contrast change
  const handleBrightnessContrastChange = useCallback((slotId: string, brightness: number, contrast: number) => {
    setSlots(prev => prev.map(s =>
      s.id === slotId
        ? { ...s, brightness, contrast }
        : s
    ));
  }, []);

  // Handle component view change
  const handleComponentChange = useCallback((slotId: string, component: FTComponentView) => {
    setSlots(prev => prev.map(s =>
      s.id === slotId
        ? { ...s, selectedComponent: component }
        : s
    ));
  }, []);

  // Handle region size change from slider
  const handleRegionSizeChange = useCallback((size: number) => {
    // Keep centered
    const half = size / 2;
    setRegionRect({
      x: 50 - half,
      y: 50 - half,
      width: size,
      height: size,
    });
  }, []);

  return (
    <div className="source-image-grid-enhanced">
      {/* Header with info badge */}
      <div className="grid-header">
        <h3 className="grid-title">Source Image Grid</h3>
        {normalizedSize && (
          <div className="size-badge">
            <span>{normalizedSize.width}×{normalizedSize.height}</span>
          </div>
        )}
      </div>

      {/* 2x2 Grid */}
      <div className="grid-container" role="grid" aria-label="Source images 2x2 grid">
        {slots.map((slot, index) => (
          <SourceImageCard
            key={slot.id}
            slot={slot}
            slotIndex={index}
            onImageLoad={handleImageLoad}
            onBrightnessContrastChange={handleBrightnessContrastChange}
            onComponentChange={handleComponentChange}
            regionRect={regionRect}
            onRegionChange={setRegionRect}
            isLoading={loadingSlots[slot.id] ?? false}
          />
        ))}
      </div>

      {/* Region Controls */}
      <div className="region-controls">
        <span className="region-label">Region Size:</span>
        <input
          type="range"
          className="region-slider"
          min={10}
          max={90}
          value={regionRect.width}
          onChange={(e) => handleRegionSizeChange(Number(e.target.value))}
        />
        <span className="region-value">{regionRect.width.toFixed(0)}%</span>
        <div className="region-toggle">
          <button
            className={`toggle-btn ${regionMode === 'inner' ? 'active' : ''}`}
            onClick={() => setRegionMode('inner')}
          >
            Inner
          </button>
          <button
            className={`toggle-btn ${regionMode === 'outer' ? 'active' : ''}`}
            onClick={() => setRegionMode('outer')}
          >
            Outer
          </button>
        </div>
      </div>

      {/* Instructions footer */}
      <div className="grid-footer">
        <span className="instruction">
          <kbd>Double-click</kbd> to load • <kbd>Drag</kbd> brightness/contrast • <kbd>Drag region</kbd> to move
        </span>
      </div>
    </div>
  );
};

export default SourceImageGridEnhanced;
