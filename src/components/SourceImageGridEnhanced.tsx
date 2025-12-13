import React, { useCallback, useEffect, useState, useRef } from 'react';
import { SourceImageCard, type ImageSlotData, type FTComponentView } from './SourceImageCard';
import { ImageProcessor } from '@/dsp/ImageProcessor';
import { WorkerManager } from '@/workers/pool';
import type { FFTHistogramResult, FFTHistogramPayload } from '@/workers/fft-histogram.worker';
import './SourceImageGridEnhanced.css';

interface SourceImageGridEnhancedProps {
  onImagesChange?: (images: ImageSlotData[]) => void;
  initialImages?: ImageSlotData[];
  unifiedRegion?: { x: number; y: number; width: number; height: number } | null;
  onRegionChange?: (region: { x: number; y: number; width: number; height: number }) => void;
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

// Create worker for FFT histogram calculations
const createHistogramWorker = () =>
  new Worker(new URL('../workers/fft-histogram.worker.ts', import.meta.url), { type: 'module' });

export const SourceImageGridEnhanced: React.FC<SourceImageGridEnhancedProps> = ({
  onImagesChange,
  initialImages,
  unifiedRegion,
  onRegionChange,
}) => {
  const [slots, setSlots] = useState<ImageSlotData[]>(() =>
    initialImages || SLOT_IDS.map((id, i) => createEmptySlot(id, i))
  );
  const [loadingSlots, setLoadingSlots] = useState<Record<string, boolean>>({});
  const [normalizedSize, setNormalizedSize] = useState<{ width: number; height: number } | null>(null);
  
  const workerPoolRef = useRef<WorkerManager<FFTHistogramPayload> | null>(null);
  const imageProcessorRef = useRef<ImageProcessor>(new ImageProcessor());

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
      // Process all components
      for (const component of components) {
        const jobId = `fft-${slotId}-${component}-${Date.now()}`;
        const result = await workerPoolRef.current.enqueue({
          id: jobId,
          payload: { grayscale, width, height, component },
        }) as FFTHistogramResult;

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
      const { imageData, grayscale } = await processor.loadImageFile(file);
      
      // Get current loaded images to determine unified size
      const currentSlots = slots.map(s => 
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
              label: file.name.replace(/\.[^/.]+$/, ''),
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
  }, [slots, calculateUnifiedSize, processFFT]);

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

  return (
    <div className="source-image-grid-enhanced">
      {/* Header with info badge */}
      <div className="grid-header">
        <h3 className="grid-title">Source Image Grid</h3>
        {normalizedSize && (
          <div className="size-badge">
            <span className="badge-icon">📐</span>
            <span>Normalized: {normalizedSize.width}×{normalizedSize.height}</span>
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
            regionSelection={unifiedRegion}
            onRegionChange={onRegionChange}
            isLoading={loadingSlots[slot.id] ?? false}
          />
        ))}
      </div>

      {/* Instructions footer */}
      <div className="grid-footer">
        <span className="instruction">
          <kbd>Double-click</kbd> to load • <kbd>Drag</kbd> brightness/contrast
        </span>
      </div>
    </div>
  );
};

export default SourceImageGridEnhanced;
