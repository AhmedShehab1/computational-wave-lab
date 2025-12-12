import React, { useRef, useEffect, useState } from 'react';

export type ViewMode = 'magnitude' | 'phase' | 'real' | 'imag';

export interface SourceImage {
  id: string;
  label: string;
  imageData: ImageData | null;
  waveformData?: number[];
  active?: boolean;
}

interface SourceImageGridProps {
  sources: SourceImage[];
  onSourceClick?: (id: string) => void;
  onViewModeChange?: (id: string, mode: ViewMode) => void;
}

export const SourceImageGrid: React.FC<SourceImageGridProps> = ({
  sources,
  onSourceClick,
  onViewModeChange
}) => {
  return (
    <div className="source-grid">
      {sources.map(source => (
        <SourceCard
          key={source.id}
          source={source}
          onClick={() => onSourceClick?.(source.id)}
          onViewModeChange={(mode) => onViewModeChange?.(source.id, mode)}
        />
      ))}
    </div>
  );
};

interface SourceCardProps {
  source: SourceImage;
  onClick?: () => void;
  onViewModeChange?: (mode: ViewMode) => void;
}

const SourceCard: React.FC<SourceCardProps> = ({
  source,
  onClick,
  onViewModeChange
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const waveformRef = useRef<HTMLCanvasElement>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('magnitude');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !source.imageData) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = source.imageData.width;
    canvas.height = source.imageData.height;
    ctx.putImageData(source.imageData, 0, 0);
  }, [source.imageData]);

  useEffect(() => {
    const canvas = waveformRef.current;
    if (!canvas || !source.waveformData?.length) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvas.getBoundingClientRect();
    canvas.width = width * window.devicePixelRatio;
    canvas.height = height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    // Draw waveform
    ctx.fillStyle = '#131620';
    ctx.fillRect(0, 0, width, height);
    
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
  }, [source.waveformData]);

  const handleViewChange = (mode: ViewMode) => {
    setViewMode(mode);
    onViewModeChange?.(mode);
  };

  return (
    <div
      className={`source-card ${source.active ? 'active' : ''}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label={`Source image: ${source.label}`}
      onKeyDown={(e) => e.key === 'Enter' && onClick?.()}
    >
      <div className="view-tabs">
        {(['magnitude', 'phase', 'real', 'imag'] as ViewMode[]).map((mode) => (
          <button
            key={mode}
            className={`view-tab ${viewMode === mode ? 'active' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              handleViewChange(mode);
            }}
            aria-pressed={viewMode === mode}
          >
            {mode.slice(0, 3).toUpperCase()}
          </button>
        ))}
      </div>

      <div className="image-container">
        {source.imageData ? (
          <canvas ref={canvasRef} />
        ) : (
          <div className="placeholder">
            <span>Drop image or click to upload</span>
          </div>
        )}
      </div>

      <div className="waveform">
        <canvas ref={waveformRef} style={{ width: '100%', height: '100%' }} />
      </div>

      <div className="image-label">
        <span>{source.label}</span>
      </div>
    </div>
  );
};

export default SourceImageGrid;
