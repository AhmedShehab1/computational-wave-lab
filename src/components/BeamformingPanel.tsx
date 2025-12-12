import React, { useRef, useEffect, useState } from 'react';

export type BeamTabType = 'interactive' | 'interference' | 'slice' | 'geometry';

interface BeamformingPanelProps {
  activeTab: BeamTabType;
  onTabChange: (tab: BeamTabType) => void;
  steerAngle: number;
  steerRadius: number;
  onSteeringChange: (angle: number, radius: number) => void;
  polarData: ImageData | null;
  heatmapData: ImageData | null;
  sliceData?: number[];
  arrayGeometry?: { x: number; y: number; active: boolean }[];
  loading?: boolean;
  renderMode?: 'polar' | 'linear';
  onRenderModeChange?: (mode: 'polar' | 'linear') => void;
}

export const BeamformingPanel: React.FC<BeamformingPanelProps> = ({
  activeTab,
  onTabChange,
  steerAngle,
  steerRadius,
  onSteeringChange,
  polarData,
  heatmapData,
  sliceData,
  arrayGeometry = [],
  loading = false,
  renderMode = 'polar',
  onRenderModeChange
}) => {
  const tabs: { id: BeamTabType; label: string }[] = [
    { id: 'interactive', label: 'Interactive Canvas' },
    { id: 'interference', label: 'Interference Map' },
    { id: 'slice', label: 'Beam Slice' },
    { id: 'geometry', label: 'Array Geometry' }
  ];

  return (
    <div className="panel beam-panel">
      <div className="panel-header">
        <h2>
          <span className="part-label">Part B</span>
          <span className="accent">Beamforming Simulator</span>
        </h2>
      </div>

      <div className="beam-tabs">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`beam-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => onTabChange(tab.id)}
            aria-selected={activeTab === tab.id}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="panel-content">
        {activeTab === 'interactive' && (
          <InteractiveCanvas
            steerAngle={steerAngle}
            steerRadius={steerRadius}
            onSteeringChange={onSteeringChange}
            polarData={polarData}
            loading={loading}
            renderMode={renderMode}
            onRenderModeChange={onRenderModeChange}
          />
        )}

        {activeTab === 'interference' && (
          <InterferenceMap heatmapData={heatmapData} loading={loading} />
        )}

        {activeTab === 'slice' && (
          <BeamSlice data={sliceData} angle={steerAngle} />
        )}

        {activeTab === 'geometry' && (
          <ArrayGeometry elements={arrayGeometry} />
        )}
      </div>
    </div>
  );
};

// Interactive Canvas with polar plot
interface InteractiveCanvasProps {
  steerAngle: number;
  steerRadius: number;
  onSteeringChange: (angle: number, radius: number) => void;
  polarData: ImageData | null;
  loading?: boolean;
  renderMode?: 'polar' | 'linear';
  onRenderModeChange?: (mode: 'polar' | 'linear') => void;
}

const InteractiveCanvas: React.FC<InteractiveCanvasProps> = ({
  steerAngle,
  steerRadius,
  onSteeringChange,
  polarData,
  loading,
  renderMode,
  onRenderModeChange
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = canvas.width;
    const center = size / 2;

    // Clear
    ctx.fillStyle = '#0d1018';
    ctx.fillRect(0, 0, size, size);

    // Draw polar grid
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    
    // Concentric circles
    for (let r = 0.2; r <= 1; r += 0.2) {
      ctx.beginPath();
      ctx.arc(center, center, r * (size / 2 - 10), 0, Math.PI * 2);
      ctx.stroke();
    }

    // Radial lines
    for (let a = 0; a < 360; a += 30) {
      const rad = (a * Math.PI) / 180;
      ctx.beginPath();
      ctx.moveTo(center, center);
      ctx.lineTo(
        center + Math.cos(rad) * (size / 2 - 10),
        center - Math.sin(rad) * (size / 2 - 10)
      );
      ctx.stroke();
    }

    // Draw beam pattern data if available
    if (polarData) {
      ctx.putImageData(polarData, 0, 0);
    }

    // Draw steering indicator
    const steerRad = (steerAngle * Math.PI) / 180;
    const indicatorDist = steerRadius * (size / 2 - 20);
    const indicatorX = center + Math.cos(steerRad) * indicatorDist;
    const indicatorY = center - Math.sin(steerRad) * indicatorDist;

    // Main lobe direction line
    ctx.strokeStyle = '#4dd0e1';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(center, center);
    ctx.lineTo(indicatorX, indicatorY);
    ctx.stroke();

    // Steering indicator circle
    ctx.fillStyle = '#4dd0e1';
    ctx.beginPath();
    ctx.arc(indicatorX, indicatorY, 8, 0, Math.PI * 2);
    ctx.fill();

    // Center dot
    ctx.fillStyle = '#2fe0c7';
    ctx.beginPath();
    ctx.arc(center, center, 4, 0, Math.PI * 2);
    ctx.fill();

  }, [polarData, steerAngle, steerRadius]);

  const handleInteraction = (clientX: number, clientY: number) => {
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const x = clientX - rect.left - centerX;
    const y = -(clientY - rect.top - centerY);

    const radius = Math.min(1, Math.sqrt(x * x + y * y) / (rect.width / 2 - 20));
    let angle = Math.atan2(y, x) * (180 / Math.PI);
    if (angle < 0) angle += 360;

    onSteeringChange(Math.round(angle), Number(radius.toFixed(2)));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    handleInteraction(e.clientX, e.clientY);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      handleInteraction(e.clientX, e.clientY);
    };
    const handleMouseUp = () => setIsDragging(false);

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  // Initialize canvas size
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const size = Math.min(container.offsetWidth, 320);
    canvas.width = size * window.devicePixelRatio;
    canvas.height = size * window.devicePixelRatio;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  }, []);

  return (
    <div>
      <div 
        ref={containerRef}
        className="polar-canvas-container"
        onMouseDown={handleMouseDown}
        role="slider"
        aria-label="Beam steering control"
        aria-valuetext={`Angle: ${steerAngle}°, Radius: ${steerRadius}`}
        tabIndex={0}
      >
        {loading && (
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.5)',
            borderRadius: '50%',
            color: 'var(--accent-cyan)',
            fontSize: '12px'
          }}>
            Calculating...
          </div>
        )}
        
        <canvas ref={canvasRef} />
        
        <span className="angle-label" style={{ top: '10px', left: '50%', transform: 'translateX(-50%)' }}>90°</span>
        <span className="angle-label" style={{ right: '10px', top: '50%', transform: 'translateY(-50%)' }}>0°</span>
        <span className="angle-label" style={{ bottom: '10px', left: '50%', transform: 'translateX(-50%)' }}>270°</span>
        <span className="angle-label" style={{ left: '10px', top: '50%', transform: 'translateY(-50%)' }}>180°</span>

        <div className="polar-controls">
          <button 
            className={`polar-control-btn ${renderMode === 'polar' ? 'active' : ''}`}
            onClick={() => onRenderModeChange?.('polar')}
            title="Polar view"
          >
            ◎
          </button>
          <button 
            className={`polar-control-btn ${renderMode === 'linear' ? 'active' : ''}`}
            onClick={() => onRenderModeChange?.('linear')}
            title="Linear view"
          >
            ☰
          </button>
        </div>

        <div 
          className="steering-indicator"
          style={{
            bottom: '8px',
            left: '8px'
          }}
        >
          θ = {steerAngle}° | r = {steerRadius.toFixed(2)}
        </div>
      </div>
    </div>
  );
};

// Interference Map visualization
interface InterferenceMapProps {
  heatmapData: ImageData | null;
  loading?: boolean;
}

const InterferenceMap: React.FC<InterferenceMapProps> = ({ heatmapData, loading }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (heatmapData) {
      canvas.width = heatmapData.width;
      canvas.height = heatmapData.height;
      ctx.putImageData(heatmapData, 0, 0);
    }
  }, [heatmapData]);

  return (
    <div style={{ position: 'relative' }}>
      {loading && (
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(0,0,0,0.7)',
          color: 'var(--accent-cyan)'
        }}>
          Computing interference pattern...
        </div>
      )}
      <div style={{
        aspectRatio: '16/10',
        background: 'var(--bg-dark)',
        borderRadius: 'var(--radius-sm)',
        overflow: 'hidden'
      }}>
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
      </div>
    </div>
  );
};

// Beam Slice 1D view
interface BeamSliceProps {
  data?: number[];
  angle: number;
}

const BeamSlice: React.FC<BeamSliceProps> = ({ data = [], angle }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data.length) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Clear
    ctx.fillStyle = '#0d1018';
    ctx.fillRect(0, 0, width, height);

    // Draw grid
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    for (let y = 0; y <= 1; y += 0.2) {
      const py = height - y * height;
      ctx.beginPath();
      ctx.moveTo(0, py);
      ctx.lineTo(width, py);
      ctx.stroke();
    }

    // Draw data
    ctx.strokeStyle = '#4dd0e1';
    ctx.lineWidth = 2;
    ctx.beginPath();
    
    const step = width / data.length;
    for (let i = 0; i < data.length; i++) {
      const x = i * step;
      const y = height - data[i] * height;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Draw labels
    ctx.fillStyle = 'var(--text-muted)';
    ctx.font = '10px system-ui';
    ctx.fillText('0 dB', 4, 14);
    ctx.fillText('-60 dB', 4, height - 4);
    ctx.fillText(`Slice at ${angle}°`, width / 2 - 30, height - 4);

  }, [data, angle]);

  return (
    <div style={{ padding: '12px 0' }}>
      <canvas
        ref={canvasRef}
        width={400}
        height={150}
        style={{
          width: '100%',
          height: '150px',
          background: 'var(--bg-dark)',
          borderRadius: 'var(--radius-sm)'
        }}
      />
    </div>
  );
};

// Array Geometry visualization
interface ArrayGeometryProps {
  elements: { x: number; y: number; active: boolean }[];
}

const ArrayGeometry: React.FC<ArrayGeometryProps> = ({ elements }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = canvas.width;
    
    // Clear
    ctx.fillStyle = '#0d1018';
    ctx.fillRect(0, 0, size, size);

    // Draw grid
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    const gridSize = size / 10;
    for (let i = 0; i <= 10; i++) {
      ctx.beginPath();
      ctx.moveTo(i * gridSize, 0);
      ctx.lineTo(i * gridSize, size);
      ctx.moveTo(0, i * gridSize);
      ctx.lineTo(size, i * gridSize);
      ctx.stroke();
    }

    // Draw elements
    elements.forEach(el => {
      const x = (el.x + 0.5) * size;
      const y = (0.5 - el.y) * size;

      ctx.fillStyle = el.active ? '#4dd0e1' : '#2a3142';
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fill();

      if (el.active) {
        ctx.strokeStyle = 'rgba(77, 208, 225, 0.3)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, 12, 0, Math.PI * 2);
        ctx.stroke();
      }
    });

  }, [elements]);

  // Default ULA geometry if no elements provided
  useEffect(() => {
    if (elements.length === 0) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const size = canvas.width;
      ctx.fillStyle = '#0d1018';
      ctx.fillRect(0, 0, size, size);

      // Draw default 8-element ULA
      ctx.fillStyle = '#4dd0e1';
      for (let i = 0; i < 8; i++) {
        const x = (0.2 + i * 0.086) * size;
        const y = size / 2;
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = 'var(--text-muted)';
      ctx.font = '11px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('8-element Uniform Linear Array', size / 2, size - 10);
    }
  }, [elements]);

  return (
    <div style={{ padding: '12px 0' }}>
      <canvas
        ref={canvasRef}
        width={300}
        height={200}
        style={{
          width: '100%',
          maxWidth: '300px',
          margin: '0 auto',
          display: 'block',
          background: 'var(--bg-dark)',
          borderRadius: 'var(--radius-sm)'
        }}
      />
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        gap: '16px',
        marginTop: '12px',
        fontSize: '11px',
        color: 'var(--text-muted)'
      }}>
        <span>Elements: {elements.length || 8}</span>
        <span>Spacing: λ/2</span>
        <span>Type: ULA</span>
      </div>
    </div>
  );
};

export default BeamformingPanel;
