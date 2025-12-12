import React, { useRef, useEffect, useState, useCallback } from 'react';

export type ViewMode = 'magnitude' | 'phase' | 'real' | 'imag';

export interface SourceImage {
  id: string;
  label: string;
  imageData: ImageData | null;
  ftData?: ImageData | null;
  waveformData?: number[];
  active?: boolean;
}

interface ZoomPanState {
  zoom: number;
  panX: number;
  panY: number;
}

interface SourceImageGridProps {
  sources: SourceImage[];
  onSourceClick?: (id: string) => void;
  onViewModeChange?: (id: string, mode: ViewMode) => void;
  onZoomPanChange?: (state: ZoomPanState) => void;
  linkedZoomPan?: boolean;
}

export const SourceImageGrid: React.FC<SourceImageGridProps> = ({
  sources,
  onSourceClick,
  onViewModeChange,
  onZoomPanChange,
  linkedZoomPan = true
}) => {
  const [globalZoomPan, setGlobalZoomPan] = useState<ZoomPanState>({
    zoom: 1,
    panX: 0,
    panY: 0
  });

  const handleZoomPanChange = useCallback((state: ZoomPanState) => {
    if (linkedZoomPan) {
      setGlobalZoomPan(state);
      onZoomPanChange?.(state);
    }
  }, [linkedZoomPan, onZoomPanChange]);

  return (
    <div className="source-grid" role="grid" aria-label="Source images grid">
      {sources.map((source, index) => (
        <SourceCard
          key={source.id}
          source={source}
          index={index}
          onClick={() => onSourceClick?.(source.id)}
          onViewModeChange={(mode) => onViewModeChange?.(source.id, mode)}
          zoomPan={linkedZoomPan ? globalZoomPan : undefined}
          onZoomPanChange={handleZoomPanChange}
        />
      ))}
    </div>
  );
};

interface SourceCardProps {
  source: SourceImage;
  index: number;
  onClick?: () => void;
  onViewModeChange?: (mode: ViewMode) => void;
  zoomPan?: ZoomPanState;
  onZoomPanChange?: (state: ZoomPanState) => void;
}

const SourceCard: React.FC<SourceCardProps> = ({
  source,
  index,
  onClick,
  onViewModeChange,
  zoomPan,
  onZoomPanChange
}) => {
  const sourceCanvasRef = useRef<HTMLCanvasElement>(null);
  const ftCanvasRef = useRef<HTMLCanvasElement>(null);
  const waveformRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [viewMode, setViewMode] = useState<ViewMode>('magnitude');
  const [localZoomPan, setLocalZoomPan] = useState<ZoomPanState>({ zoom: 1, panX: 0, panY: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  
  const currentZoomPan = zoomPan || localZoomPan;

  // Render source image
  useEffect(() => {
    const canvas = sourceCanvasRef.current;
    if (!canvas || !source.imageData) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { zoom, panX, panY } = currentZoomPan;
    const { width, height } = source.imageData;
    
    canvas.width = width;
    canvas.height = height;
    
    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.translate(width / 2 + panX, height / 2 + panY);
    ctx.scale(zoom, zoom);
    ctx.translate(-width / 2, -height / 2);
    ctx.putImageData(source.imageData, 0, 0);
    ctx.restore();
  }, [source.imageData, currentZoomPan]);

  // Render FT visualization
  useEffect(() => {
    const canvas = ftCanvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvas.getBoundingClientRect();
    canvas.width = width * window.devicePixelRatio;
    canvas.height = height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    // Dark background
    ctx.fillStyle = '#0a0c12';
    ctx.fillRect(0, 0, width, height);

    if (source.ftData) {
      // Render actual FT data with zoom/pan
      const { zoom, panX, panY } = currentZoomPan;
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = source.ftData.width;
      tempCanvas.height = source.ftData.height;
      const tempCtx = tempCanvas.getContext('2d');
      if (tempCtx) {
        tempCtx.putImageData(source.ftData, 0, 0);
        ctx.save();
        ctx.translate(width / 2 + panX * 0.5, height / 2 + panY * 0.5);
        ctx.scale(zoom, zoom);
        ctx.drawImage(tempCanvas, -source.ftData.width / 2, -source.ftData.height / 2);
        ctx.restore();
      }
    } else {
      // Placeholder visualization
      const centerX = width / 2;
      const centerY = height / 2;
      
      // Draw frequency grid
      ctx.strokeStyle = 'rgba(77, 208, 225, 0.1)';
      ctx.lineWidth = 0.5;
      for (let r = 20; r < Math.min(width, height) / 2; r += 20) {
        ctx.beginPath();
        ctx.arc(centerX, centerY, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      
      // Draw center point
      ctx.fillStyle = '#4dd0e1';
      ctx.beginPath();
      ctx.arc(centerX, centerY, 3, 0, Math.PI * 2);
      ctx.fill();
      
      // Mode indicator label
      ctx.fillStyle = '#6b7a94';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`FT: ${viewMode.toUpperCase()}`, centerX, height - 8);
    }
  }, [source.ftData, viewMode, currentZoomPan]);

  // Render waveform
  useEffect(() => {
    const canvas = waveformRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvas.getBoundingClientRect();
    canvas.width = width * window.devicePixelRatio;
    canvas.height = height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    ctx.fillStyle = '#131620';
    ctx.fillRect(0, 0, width, height);

    if (source.waveformData?.length) {
      ctx.strokeStyle = '#4dd0e1';
      ctx.lineWidth = 1;
      ctx.beginPath();
      
      const data = source.waveformData;
      const step = width / data.length;
      
      for (let i = 0; i < data.length; i++) {
        const x = i * step;
        const y = (1 - data[i]) * height;
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    } else {
      // Placeholder waveform
      ctx.strokeStyle = 'rgba(77, 208, 225, 0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      for (let x = 0; x < width; x++) {
        const y = height / 2 + Math.sin(x * 0.1 + index) * (height * 0.3);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }, [source.waveformData, index]);

  const handleViewChange = (mode: ViewMode) => {
    setViewMode(mode);
    onViewModeChange?.(mode);
  };

  // Zoom with mouse wheel
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.5, Math.min(5, currentZoomPan.zoom * delta));
    
    const newState = { ...currentZoomPan, zoom: newZoom };
    if (zoomPan) {
      onZoomPanChange?.(newState);
    } else {
      setLocalZoomPan(newState);
    }
  }, [currentZoomPan, zoomPan, onZoomPanChange]);

  // Pan with mouse drag
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0 && e.shiftKey) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - currentZoomPan.panX, y: e.clientY - currentZoomPan.panY });
    }
  }, [currentZoomPan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    
    const newState = {
      ...currentZoomPan,
      panX: e.clientX - dragStart.x,
      panY: e.clientY - dragStart.y
    };
    
    if (zoomPan) {
      onZoomPanChange?.(newState);
    } else {
      setLocalZoomPan(newState);
    }
  }, [isDragging, dragStart, currentZoomPan, zoomPan, onZoomPanChange]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const resetZoomPan = useCallback(() => {
    const newState = { zoom: 1, panX: 0, panY: 0 };
    if (zoomPan) {
      onZoomPanChange?.(newState);
    } else {
      setLocalZoomPan(newState);
    }
  }, [zoomPan, onZoomPanChange]);

  const slotLabels = ['A', 'B', 'C', 'D'];

  return (
    <div
      ref={containerRef}
      className={`source-card ${source.active ? 'active' : ''} animate-fadeIn`}
      onClick={onClick}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      role="gridcell"
      tabIndex={0}
      aria-label={`Source image ${slotLabels[index]}: ${source.label}`}
      onKeyDown={(e) => e.key === 'Enter' && onClick?.()}
    >
      {/* View mode tabs */}
      <div className="view-tabs" role="tablist" aria-label="View mode selection">
        {(['magnitude', 'phase', 'real', 'imag'] as ViewMode[]).map((mode) => (
          <button
            key={mode}
            className={`view-tab ${viewMode === mode ? 'active' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              handleViewChange(mode);
            }}
            role="tab"
            aria-selected={viewMode === mode}
            aria-label={`${mode} view`}
          >
            {mode.slice(0, 3).toUpperCase()}
          </button>
        ))}
      </div>

      {/* Dual pane container */}
      <div className="dual-pane">
        {/* Source image pane */}
        <div className="source-pane">
          <div className="pane-label">Source</div>
          {source.imageData ? (
            <canvas ref={sourceCanvasRef} />
          ) : (
            <div className="placeholder">
              <span className="placeholder-icon">📷</span>
              <span>Drop image</span>
            </div>
          )}
        </div>
        
        {/* FT pane */}
        <div className="ft-pane">
          <div className="pane-label">FT</div>
          <canvas ref={ftCanvasRef} />
        </div>
      </div>

      {/* Waveform strip */}
      <div className="waveform">
        <canvas ref={waveformRef} style={{ width: '100%', height: '100%' }} />
      </div>

      {/* Bottom label */}
      <div className="image-label">
        <span className="slot-badge">{slotLabels[index]}</span>
        <span className="label-text">{source.label || 'Empty'}</span>
        {currentZoomPan.zoom !== 1 && (
          <button 
            className="zoom-reset" 
            onClick={(e) => { e.stopPropagation(); resetZoomPan(); }}
            title="Reset zoom"
          >
            {Math.round(currentZoomPan.zoom * 100)}%
          </button>
        )}
      </div>
    </div>
  );
};

export default SourceImageGrid;

