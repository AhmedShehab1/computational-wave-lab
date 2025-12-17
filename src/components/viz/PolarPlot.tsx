/**
 * PolarPlot.tsx
 * 
 * High-performance Canvas-based Polar Radar visualization for beamforming.
 * Renders concentric dB circles, radial angle lines, and the beam pattern
 * using the PhasedArray class for all physics calculations.
 * 
 * OOP Compliance: All math is delegated to the PhasedArray class.
 */

import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { useBeamStore } from '@/state/beamStore';
import { PhasedArray } from '@/classes/PhasedArray';
import type { PhasedArrayConfig } from '@/classes/PhasedArray';

// ============================================================================
// CONSTANTS
// ============================================================================

const COLORS = {
  background: '#0F111A',
  grid: '#334155',
  gridFaint: 'rgba(51, 65, 85, 0.4)',
  label: 'rgba(230, 237, 243, 0.6)',
  labelBright: 'rgba(230, 237, 243, 0.9)',
  beam: '#00F0FF',
  beamFill: 'rgba(0, 240, 255, 0.35)',
  beamStroke: 'rgba(0, 240, 255, 0.8)',
  beamGlow: 'rgba(0, 240, 255, 0.15)',
  sensorDot: '#00F0FF',
  sensorDotInner: '#0F111A',
  centerMarker: '#FF8800',
};

const DB_LEVELS = [0, -10, -20, -30]; // dB circles from outside to inside
const ANGLE_MARKERS = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];

// ============================================================================
// POLAR PLOT COMPONENT
// ============================================================================

interface PolarPlotProps {
  width?: number;
  height?: number;
  className?: string;
}

export const PolarPlot: React.FC<PolarPlotProps> = ({
  width: propWidth,
  height: propHeight,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  
  // Subscribe to beam store
  const steeringAngle = useBeamStore((s) => s.steeringAngle);
  const sensorCount = useBeamStore((s) => s.sensorCount);
  const spacingLambdaFraction = useBeamStore((s) => s.spacingLambdaFraction);
  const frequency = useBeamStore((s) => s.frequency);
  const medium = useBeamStore((s) => s.medium);
  const showGrid = useBeamStore((s) => s.showGrid);
  const showLabels = useBeamStore((s) => s.showLabels);
  const dynamicRange = useBeamStore((s) => s.dynamicRange);
  const units = useBeamStore((s) => s.units);
  const activeUnitId = useBeamStore((s) => s.activeUnitId);
  
  // Create PhasedArray instance from active unit (OOP: all math in class)
  const phasedArray = useMemo(() => {
    const activeUnit = units.find((u) => u.id === activeUnitId);
    if (!activeUnit) {
      // Fallback config if no active unit
      const fallbackConfig: PhasedArrayConfig = {
        id: 'fallback',
        name: 'Fallback',
        position: { x: 0, y: 0 },
        elements: sensorCount,
        pitch: spacingLambdaFraction * (343 / frequency),
        geometry: 'linear',
        curvatureRadius: 0,
        frequency,
        steeringAngle,
        enabled: true,
      };
      return new PhasedArray(fallbackConfig, medium);
    }
    return PhasedArray.fromConfig(activeUnit, medium);
  }, [units, activeUnitId, sensorCount, spacingLambdaFraction, frequency, steeringAngle, medium]);
  
  // ============================================================================
  // RENDERING
  // ============================================================================
  
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Get dimensions
    const width = propWidth || container.clientWidth;
    const height = propHeight || container.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    
    // Set canvas size (accounting for device pixel ratio)
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);
    
    // Calculate plot dimensions
    const centerX = width / 2;
    const centerY = height / 2;
    const margin = 50;
    const radius = Math.max(10, Math.min(width, height) / 2 - margin);
    
    // Guard: Skip rendering if dimensions are too small
    if (width < 100 || height < 100) {
      ctx.fillStyle = COLORS.background;
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = COLORS.label;
      ctx.font = '12px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Canvas too small', centerX, centerY);
      return;
    }
    
    // Clear canvas
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, width, height);
    
    // ========================================================================
    // DRAW GRID
    // ========================================================================
    
    if (showGrid) {
      // Draw concentric dB circles
      ctx.strokeStyle = COLORS.gridFaint;
      ctx.lineWidth = 1;
      
      DB_LEVELS.forEach((dB, _index) => {
        // Map dB to radius: 0dB = outer, -30dB = inner
        const ringRadius = radius * (1 - Math.abs(dB) / dynamicRange);
        
        if (ringRadius > 0) {
          ctx.beginPath();
          ctx.arc(centerX, centerY, ringRadius, 0, 2 * Math.PI);
          ctx.stroke();
          
          // Draw dB label
          if (showLabels) {
            ctx.fillStyle = COLORS.label;
            ctx.font = '10px Inter, sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(`${dB} dB`, centerX + ringRadius + 5, centerY);
          }
        }
      });
      
      // Draw radial angle lines
      ctx.strokeStyle = COLORS.gridFaint;
      ctx.lineWidth = 0.5;
      
      ANGLE_MARKERS.forEach((angle) => {
        const rad = ((angle - 90) * Math.PI) / 180; // -90 to put 0° at top
        const x1 = centerX;
        const y1 = centerY;
        const x2 = centerX + radius * Math.cos(rad);
        const y2 = centerY + radius * Math.sin(rad);
        
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        
        // Draw angle label
        if (showLabels) {
          const labelRadius = radius + 15;
          const labelX = centerX + labelRadius * Math.cos(rad);
          const labelY = centerY + labelRadius * Math.sin(rad);
          
          ctx.fillStyle = COLORS.label;
          ctx.font = '11px Inter, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`${angle}°`, labelX, labelY);
        }
      });
    }
    
    // ========================================================================
    // DRAW BEAM PATTERN (Using PhasedArray class - OOP compliant)
    // ========================================================================
    
    // Generate beam pattern using PhasedArray class
    const pattern = phasedArray.generateBeamPattern(0.5);
    
    // Draw filled beam shape
    ctx.save();
    
    // Create gradient for glow effect
    const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
    gradient.addColorStop(0, COLORS.beamGlow);
    gradient.addColorStop(0.5, COLORS.beamFill);
    gradient.addColorStop(1, 'rgba(0, 240, 255, 0.1)');
    
    ctx.beginPath();
    
    let isFirst = true;
    pattern.forEach(({ angle, dB }) => {
      // Convert dB to radius (0dB = outer, -40dB = center)
      const normalizedMag = Math.max(0, (dB + dynamicRange) / dynamicRange);
      const r = normalizedMag * radius;
      
      // Convert angle to canvas coordinates (0° at top, clockwise)
      const rad = ((angle - 90) * Math.PI) / 180;
      const x = centerX + r * Math.cos(rad);
      const y = centerY + r * Math.sin(rad);
      
      if (isFirst) {
        ctx.moveTo(x, y);
        isFirst = false;
      } else {
        ctx.lineTo(x, y);
      }
    });
    
    ctx.closePath();
    
    // Fill with semi-transparent teal
    ctx.fillStyle = gradient;
    ctx.globalAlpha = 0.5;
    ctx.fill();
    
    // Draw stroke
    ctx.globalAlpha = 1.0;
    ctx.strokeStyle = COLORS.beamStroke;
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Draw glow effect
    ctx.shadowColor = COLORS.beam;
    ctx.shadowBlur = 15;
    ctx.strokeStyle = COLORS.beam;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.shadowBlur = 0;
    
    ctx.restore();
    
    // ========================================================================
    // DRAW SENSOR ARRAY
    // ========================================================================
    
    // Draw sensors as dots at the center
    const sensorSpacing = 8; // Visual spacing in pixels
    const arrayWidth = (sensorCount - 1) * sensorSpacing;
    
    // Rotate array based on a fixed orientation (horizontal)
    ctx.save();
    ctx.translate(centerX, centerY);
    
    for (let i = 0; i < sensorCount; i++) {
      const dotX = -arrayWidth / 2 + i * sensorSpacing;
      const dotY = 0;
      
      // Outer glow
      ctx.beginPath();
      ctx.arc(dotX, dotY, 5, 0, 2 * Math.PI);
      ctx.fillStyle = 'rgba(0, 240, 255, 0.3)';
      ctx.fill();
      
      // Sensor dot
      ctx.beginPath();
      ctx.arc(dotX, dotY, 3, 0, 2 * Math.PI);
      ctx.fillStyle = COLORS.sensorDot;
      ctx.fill();
      
      // Inner dot
      ctx.beginPath();
      ctx.arc(dotX, dotY, 1.5, 0, 2 * Math.PI);
      ctx.fillStyle = COLORS.sensorDotInner;
      ctx.fill();
    }
    
    ctx.restore();
    
    // ========================================================================
    // DRAW CENTER MARKER
    // ========================================================================
    
    ctx.beginPath();
    ctx.arc(centerX, centerY, 6, 0, 2 * Math.PI);
    ctx.strokeStyle = COLORS.centerMarker;
    ctx.lineWidth = 2;
    ctx.stroke();
    
    ctx.beginPath();
    ctx.arc(centerX, centerY, 2, 0, 2 * Math.PI);
    ctx.fillStyle = COLORS.centerMarker;
    ctx.fill();
    
    // ========================================================================
    // DRAW STEERING INDICATOR
    // ========================================================================
    
    const steeringRad = ((steeringAngle - 90) * Math.PI) / 180;
    const indicatorLength = radius + 25;
    const indicatorX = centerX + indicatorLength * Math.cos(steeringRad);
    const indicatorY = centerY + indicatorLength * Math.sin(steeringRad);
    
    // Draw steering angle label
    ctx.fillStyle = COLORS.beam;
    ctx.font = 'bold 14px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${steeringAngle}°`, indicatorX, indicatorY);
    
  }, [phasedArray, steeringAngle, sensorCount, showGrid, showLabels, dynamicRange, propWidth, propHeight]);
  
  // ============================================================================
  // RESIZE OBSERVER
  // ============================================================================
  
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    
    const resizeObserver = new ResizeObserver(() => {
      // Cancel any pending animation frame
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      // Schedule render on next animation frame
      animationFrameRef.current = requestAnimationFrame(render);
    });
    
    resizeObserver.observe(container);
    
    // Initial render
    render();
    
    return () => {
      resizeObserver.disconnect();
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [render]);
  
  // Re-render when parameters change
  useEffect(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    animationFrameRef.current = requestAnimationFrame(render);
  }, [render]);
  
  return (
    <div 
      ref={containerRef} 
      className={`polar-plot-container ${className}`}
      style={{ 
        width: propWidth || '100%', 
        height: propHeight || '100%',
        position: 'relative',
      }}
    >
      <canvas 
        ref={canvasRef} 
        style={{ 
          display: 'block',
          width: '100%',
          height: '100%',
        }} 
      />
    </div>
  );
};

export default PolarPlot;
