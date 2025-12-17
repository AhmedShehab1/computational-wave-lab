/**
 * InterferenceCanvas.tsx
 * 
 * High-performance 2D interference pattern visualization.
 * Renders the wave field computed by the beam-simulator worker as a heatmap.
 * Uses HTML5 Canvas with putImageData for maximum performance.
 * 
 * OOP Compliance: Passes PhasedArrayConfig[] (units) to worker,
 * which uses the PhasedArray class for all physics calculations.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useBeamStore } from '@/state/beamStore';
import { mapIntensityToPixels, type ColormapName } from '@/utils/colormap';
import type { SimulationConfig, SimulationResult, WorkerMessage, WorkerResponse } from '@/workers/beam-simulator.worker';
import './InterferenceCanvas.css';

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_GRID_SIZE = 300; // 300x300 = 90,000 pixels (real-time capable)
const DEFAULT_FIELD_SIZE = 2; // 2 meters x 2 meters viewing area
const DEBOUNCE_MS = 50; // Debounce worker calls for smooth interaction

// ============================================================================
// COMPONENT
// ============================================================================

interface InterferenceCanvasProps {
  className?: string;
  colormap?: ColormapName;
  gridSize?: number;
  fieldSize?: number;
}

export const InterferenceCanvas: React.FC<InterferenceCanvasProps> = ({
  className = '',
  colormap = 'turbo',
  gridSize = DEFAULT_GRID_SIZE,
  fieldSize = DEFAULT_FIELD_SIZE,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const debounceRef = useRef<number | null>(null);
  const jobIdRef = useRef<string>('');
  
  // State
  const [isComputing, setIsComputing] = useState(false);
  const [computeTime, setComputeTime] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
  
  // Subscribe to beam store - use units array for OOP compliance
  const units = useBeamStore((s) => s.units);
  const medium = useBeamStore((s) => s.medium);
  const steeringAngle = useBeamStore((s) => s.steeringAngle);
  const wavelength = useBeamStore((s) => s.wavelength);
  
  // ============================================================================
  // RENDERING - Define before worker effect
  // ============================================================================
  
  const renderResult = useCallback((result: SimulationResult) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const { intensityMap, width, height } = result;
    
    // Set canvas size to match simulation grid
    canvas.width = width;
    canvas.height = height;
    
    // Map intensity to RGBA pixels using the colormap
    const pixels = mapIntensityToPixels(intensityMap, width, height, colormap, true);
    
    // Create ImageData and render
    const imageData = new ImageData(pixels, width, height);
    ctx.putImageData(imageData, 0, 0);
  }, [colormap]);
  
  // ============================================================================
  // WORKER MANAGEMENT
  // ============================================================================
  
  useEffect(() => {
    // Create worker
    workerRef.current = new Worker(
      new URL('@/workers/beam-simulator.worker.ts', import.meta.url),
      { type: 'module' }
    );
    
    // Handle worker messages
    workerRef.current.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const { type, jobId, result, progress: progressValue, error } = event.data;
      
      // Ignore messages from old jobs
      if (jobId !== jobIdRef.current) return;
      
      switch (type) {
        case 'PROGRESS':
          setProgress(progressValue || 0);
          break;
          
        case 'RESULT':
          if (result) {
            renderResult(result);
            setComputeTime(result.computeTimeMs);
          }
          setIsComputing(false);
          setProgress(100);
          break;
          
        case 'ERROR':
          console.error('Beam simulation error:', error);
          setIsComputing(false);
          break;
      }
    };
    
    return () => {
      // Clean up worker
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      workerRef.current?.terminate();
    };
  }, [renderResult]);
  
  // ============================================================================
  // SIMULATION
  // ============================================================================
  
  const runSimulation = useCallback(() => {
    if (!workerRef.current) return;
    
    // Create simulation config using units array (OOP path)
    // The worker will instantiate PhasedArray classes for each unit
    const config: SimulationConfig = {
      units: units.filter(u => u.enabled), // Pass enabled units to worker
      medium,
      gridSize: { width: gridSize, height: gridSize },
      wavelength,
      fieldSize: { width: fieldSize, height: fieldSize },
      normalize: true,
    };
    
    // Generate unique job ID
    const jobId = `sim-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    jobIdRef.current = jobId;
    
    // Send to worker
    setIsComputing(true);
    setProgress(0);
    
    workerRef.current.postMessage({
      type: 'SIMULATE',
      jobId,
      config,
    } as WorkerMessage);
  }, [units, medium, wavelength, gridSize, fieldSize]);
  
  // ============================================================================
  // DEBOUNCED UPDATE
  // ============================================================================
  
  useEffect(() => {
    // Debounce simulation requests
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    
    debounceRef.current = window.setTimeout(() => {
      runSimulation();
    }, DEBOUNCE_MS);
    
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [runSimulation, steeringAngle]); // Re-run when parameters change
  
  // ============================================================================
  // RENDER
  // ============================================================================
  
  return (
    <div 
      ref={containerRef}
      className={`interference-canvas-container ${className}`}
    >
      <canvas 
        ref={canvasRef}
        className="interference-canvas"
      />
      
      {/* Overlay info */}
      <div className="interference-overlay">
        {isComputing && (
          <div className="computing-indicator">
            <div className="progress-bar">
              <div 
                className="progress-fill" 
                style={{ width: `${progress}%` }}
              />
            </div>
            <span>Computing... {Math.round(progress)}%</span>
          </div>
        )}
        
        {!isComputing && computeTime !== null && (
          <div className="compute-time">
            Rendered in {computeTime.toFixed(1)}ms
          </div>
        )}
      </div>
      
      {/* Colorbar legend */}
      <div className="colorbar">
        <div className="colorbar-gradient" />
        <div className="colorbar-labels">
          <span>High</span>
          <span>Low</span>
        </div>
      </div>
      
      {/* Axis labels */}
      <div className="axis-labels">
        <span className="axis-x">X (m)</span>
        <span className="axis-y">Y (m)</span>
      </div>
    </div>
  );
};

export default InterferenceCanvas;
