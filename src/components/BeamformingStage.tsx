/**
 * BeamformingStage.tsx
 * 
 * Main visualization stage for the Beamforming Simulator.
 * Contains tabs for different visualization modes:
 * - Interference Map (2D Heatmap)
 * - Beam Slice (Polar Plot)
 * - Array Geometry (Sensor Layout)
 */

import React, { useState, useMemo } from 'react';
import { PolarPlot } from './viz/PolarPlot';
import { InterferenceCanvas } from './viz/InterferenceCanvas';
import { MeasurementsRibbon, createDefaultMeasurements } from './MeasurementsRibbon';
import { useBeamStore } from '@/state/beamStore';
import './BeamformingStage.css';

// ============================================================================
// TYPES
// ============================================================================

type VisualizationMode = 'interference' | 'beam-slice' | 'array-geometry';

interface TabConfig {
  id: VisualizationMode;
  label: string;
  icon: string;
}

const TABS: TabConfig[] = [
  { id: 'interference', label: 'Interference Map', icon: '📡' },
  { id: 'beam-slice', label: 'Beam Slice', icon: '📊' },
  { id: 'array-geometry', label: 'Array Geometry', icon: '⬡' },
];

// ============================================================================
// TOOLBAR COMPONENT
// ============================================================================

interface ToolbarProps {
  onAction: (action: string) => void;
}

const Toolbar: React.FC<ToolbarProps> = ({ onAction }) => {
  return (
    <div className="stage-toolbar">
      <div className="toolbar-group">
        <button 
          className="toolbar-btn" 
          onClick={() => onAction('rotate')}
          title="Rotate View"
        >
          <span className="toolbar-icon">↻</span>
          <span>Rotate</span>
        </button>
        <button 
          className="toolbar-btn" 
          onClick={() => onAction('zoom')}
          title="Zoom"
        >
          <span className="toolbar-icon">🔍</span>
          <span>Zoom</span>
        </button>
        <button 
          className="toolbar-btn" 
          onClick={() => onAction('pan')}
          title="Pan"
        >
          <span className="toolbar-icon">✋</span>
          <span>Pan</span>
        </button>
      </div>
      <div className="toolbar-group">
        <button 
          className="toolbar-btn" 
          onClick={() => onAction('reset')}
          title="Reset View"
        >
          <span className="toolbar-icon">⟲</span>
          <span>Reset</span>
        </button>
        <button 
          className="toolbar-btn" 
          onClick={() => onAction('export')}
          title="Export Image"
        >
          <span className="toolbar-icon">📤</span>
          <span>Export</span>
        </button>
      </div>
    </div>
  );
};

// ============================================================================
// ARRAY GEOMETRY COMPONENT (Placeholder)
// ============================================================================

const ArrayGeometryView: React.FC = () => {
  const sensorCount = useBeamStore((s) => s.sensorCount);
  const geometry = useBeamStore((s) => s.geometry);
  const sensorSpacing = useBeamStore((s) => s.sensorSpacing);
  
  return (
    <div className="array-geometry-view">
      <div className="geometry-canvas">
        <svg viewBox="-100 -100 200 200" className="geometry-svg">
          {/* Background grid */}
          <defs>
            <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(51, 65, 85, 0.3)" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect x="-100" y="-100" width="200" height="200" fill="url(#grid)" />
          
          {/* Center cross */}
          <line x1="-100" y1="0" x2="100" y2="0" stroke="rgba(51, 65, 85, 0.5)" strokeWidth="1" />
          <line x1="0" y1="-100" x2="0" y2="100" stroke="rgba(51, 65, 85, 0.5)" strokeWidth="1" />
          
          {/* Sensor elements */}
          {geometry === 'linear' ? (
            // Linear array
            Array.from({ length: sensorCount }).map((_, i) => {
              const spacing = 80 / Math.max(sensorCount - 1, 1);
              const x = -40 + i * spacing;
              return (
                <g key={i}>
                  <circle 
                    cx={x} 
                    cy={0} 
                    r={8} 
                    fill="rgba(0, 240, 255, 0.2)" 
                    stroke="#00F0FF" 
                    strokeWidth={2}
                  />
                  <circle cx={x} cy={0} r={3} fill="#00F0FF" />
                  <text 
                    x={x} 
                    y={20} 
                    textAnchor="middle" 
                    fill="rgba(230, 237, 243, 0.6)" 
                    fontSize={8}
                  >
                    {i + 1}
                  </text>
                </g>
              );
            })
          ) : (
            // Circular array
            Array.from({ length: sensorCount }).map((_, i) => {
              const angle = (2 * Math.PI * i) / sensorCount - Math.PI / 2;
              const r = 50;
              const x = r * Math.cos(angle);
              const y = r * Math.sin(angle);
              return (
                <g key={i}>
                  <circle 
                    cx={x} 
                    cy={y} 
                    r={8} 
                    fill="rgba(0, 240, 255, 0.2)" 
                    stroke="#00F0FF" 
                    strokeWidth={2}
                  />
                  <circle cx={x} cy={y} r={3} fill="#00F0FF" />
                </g>
              );
            })
          )}
        </svg>
      </div>
      <div className="geometry-info">
        <div className="info-item">
          <span className="info-label">Array Type</span>
          <span className="info-value">{geometry === 'linear' ? 'Uniform Linear Array (ULA)' : 'Circular Array'}</span>
        </div>
        <div className="info-item">
          <span className="info-label">Element Count</span>
          <span className="info-value">{sensorCount}</span>
        </div>
        <div className="info-item">
          <span className="info-label">Element Spacing</span>
          <span className="info-value">{(sensorSpacing * 100).toFixed(2)} cm</span>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// INTERFERENCE MAP COMPONENT - Real 2D Heatmap
// ============================================================================

const InterferenceMapView: React.FC = () => {
  return (
    <div className="interference-map-view">
      <InterferenceCanvas 
        className="main-interference-canvas"
        colormap="turbo"
        gridSize={300}
        fieldSize={2}
      />
    </div>
  );
};

// ============================================================================
// MAIN STAGE COMPONENT
// ============================================================================

export const BeamformingStage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<VisualizationMode>('beam-slice');
  const [_toolMode, setToolMode] = useState<string>('pan');
  
  const steeringAngle = useBeamStore((s) => s.steeringAngle);
  const sensorCount = useBeamStore((s) => s.sensorCount);
  const frequency = useBeamStore((s) => s.frequency);
  const wavelength = useBeamStore((s) => s.wavelength);
  
  // Create measurements for the ribbon
  const measurements = useMemo(() => {
    // Calculate approximate beam metrics from array parameters
    const snr = 10 + Math.log10(sensorCount) * 10; // SNR scales with array gain
    const directivity = 10 * Math.log10(sensorCount); // Directivity in dBi
    const beamwidth = (51 / sensorCount) * (wavelength / 0.01); // Approx 3dB beamwidth
    const sidelobeLevel = -13.3 - 10 * Math.log10(sensorCount / 8); // First sidelobe level
    
    return createDefaultMeasurements(snr, directivity, beamwidth, Math.abs(sidelobeLevel));
  }, [sensorCount, wavelength]);
  
  const handleToolAction = (action: string) => {
    setToolMode(action);
    // Tool actions will be implemented in future phases
    console.log('Tool action:', action);
  };
  
  const renderVisualization = () => {
    switch (activeTab) {
      case 'interference':
        return <InterferenceMapView />;
      case 'beam-slice':
        return <PolarPlot className="main-polar-plot" />;
      case 'array-geometry':
        return <ArrayGeometryView />;
      default:
        return null;
    }
  };
  
  return (
    <div className="beamforming-stage">
      {/* Header with Tabs */}
      <div className="stage-header">
        <div className="stage-tabs">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={`stage-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="tab-icon">{tab.icon}</span>
              <span className="tab-label">{tab.label}</span>
            </button>
          ))}
        </div>
        <Toolbar onAction={handleToolAction} />
      </div>
      
      {/* Visualization Area */}
      <div className="stage-content">
        {renderVisualization()}
      </div>
      
      {/* Info Bar */}
      <div className="stage-info-bar">
        <div className="info-group">
          <span className="info-badge">
            <span className="badge-label">Steering</span>
            <span className="badge-value">{steeringAngle}°</span>
          </span>
          <span className="info-badge">
            <span className="badge-label">Elements</span>
            <span className="badge-value">{sensorCount}</span>
          </span>
          <span className="info-badge">
            <span className="badge-label">Frequency</span>
            <span className="badge-value">{(frequency / 1000).toFixed(1)} kHz</span>
          </span>
          <span className="info-badge">
            <span className="badge-label">λ</span>
            <span className="badge-value">{(wavelength * 100).toFixed(2)} cm</span>
          </span>
        </div>
        <div className="info-group">
          <span className="status-indicator online">
            <span className="status-dot"></span>
            Live
          </span>
        </div>
      </div>
      
      {/* Measurements Ribbon - Docked inside Part B */}
      <MeasurementsRibbon measurements={measurements} compact />
    </div>
  );
};

export default BeamformingStage;
