import React, { useState, useRef, useEffect } from 'react';

export interface MixerChannel {
  id: string;
  name: string;
  magnitudeWeight: number;
  phaseWeight: number;
  muted: boolean;
  solo: boolean;
  locked: boolean;
  warning?: boolean;
  color?: string;
}

export interface RegionConfig {
  type: 'circle' | 'ring' | 'sector';
  innerRadius: number;
  outerRadius: number;
  startAngle: number;
  endAngle: number;
}

interface ComponentsMixerDrawerProps {
  channels: MixerChannel[];
  onWeightChange: (id: string, type: 'magnitude' | 'phase', weight: number) => void;
  onMuteToggle: (id: string) => void;
  onSoloToggle: (id: string) => void;
  onLockToggle: (id: string) => void;
  regionConfig: RegionConfig;
  onRegionChange: (config: RegionConfig) => void;
  showPhase?: boolean;
}

export const ComponentsMixerDrawer: React.FC<ComponentsMixerDrawerProps> = ({
  channels,
  onWeightChange,
  onMuteToggle,
  onSoloToggle,
  onLockToggle,
  regionConfig,
  onRegionChange,
  showPhase = true
}) => {
  const [viewMode, setViewMode] = useState<'magnitude' | 'phase' | 'both'>('both');
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Calculate if any solo is active (affects mute behavior)
  const soloActive = channels.some(c => c.solo);
  
  // Calculate total weight
  const totalMagWeight = channels.reduce((sum, c) => sum + (c.muted ? 0 : c.magnitudeWeight), 0);
  const totalPhaseWeight = channels.reduce((sum, c) => sum + (c.muted ? 0 : c.phaseWeight), 0);

  return (
    <div className={`mixer-drawer ${isCollapsed ? 'collapsed' : ''}`}>
      <div className="mixer-drawer-header">
        <h3>
          <span className="icon">🎚️</span>
          Components Mixer
        </h3>
        <div className="mixer-header-controls">
          {showPhase && (
            <div className="mixer-view-toggle">
              <button
                className={viewMode === 'magnitude' ? 'active' : ''}
                onClick={() => setViewMode('magnitude')}
                aria-pressed={viewMode === 'magnitude'}
                title="Magnitude only"
              >
                Mag
              </button>
              <button
                className={viewMode === 'phase' ? 'active' : ''}
                onClick={() => setViewMode('phase')}
                aria-pressed={viewMode === 'phase'}
                title="Phase only"
              >
                Pha
              </button>
              <button
                className={viewMode === 'both' ? 'active' : ''}
                onClick={() => setViewMode('both')}
                aria-pressed={viewMode === 'both'}
                title="Both"
              >
                Both
              </button>
            </div>
          )}
          <button
            className="collapse-btn"
            onClick={() => setIsCollapsed(!isCollapsed)}
            aria-expanded={!isCollapsed}
            title={isCollapsed ? 'Expand' : 'Collapse'}
          >
            {isCollapsed ? '▼' : '▲'}
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <>
          {/* Matrix header */}
          <div className="mixer-matrix-header">
            <span className="matrix-label">Image</span>
            {(viewMode === 'magnitude' || viewMode === 'both') && (
              <span className="matrix-col">Mag</span>
            )}
            {(viewMode === 'phase' || viewMode === 'both') && (
              <span className="matrix-col">Phase</span>
            )}
            <span className="matrix-col-controls">M</span>
            <span className="matrix-col-controls">S</span>
            <span className="matrix-col-controls">🔒</span>
          </div>

          <div className="mixer-channels">
            {channels.map(channel => (
              <MixerChannelRow
                key={channel.id}
                channel={channel}
                viewMode={viewMode}
                soloActive={soloActive}
                onMagWeightChange={(weight) => onWeightChange(channel.id, 'magnitude', weight)}
                onPhaseWeightChange={(weight) => onWeightChange(channel.id, 'phase', weight)}
                onMuteToggle={() => onMuteToggle(channel.id)}
                onSoloToggle={() => onSoloToggle(channel.id)}
                onLockToggle={() => onLockToggle(channel.id)}
              />
            ))}
          </div>

          {/* Region selector preview */}
          <div className="region-preview-section">
            <div className="region-preview-header">
              <span>Frequency Region</span>
              <div className="region-type-tabs">
                <button
                  className={regionConfig.type === 'circle' ? 'active' : ''}
                  onClick={() => onRegionChange({ ...regionConfig, type: 'circle' })}
                >
                  ◯
                </button>
                <button
                  className={regionConfig.type === 'ring' ? 'active' : ''}
                  onClick={() => onRegionChange({ ...regionConfig, type: 'ring' })}
                >
                  ◎
                </button>
                <button
                  className={regionConfig.type === 'sector' ? 'active' : ''}
                  onClick={() => onRegionChange({ ...regionConfig, type: 'sector' })}
                >
                  ◔
                </button>
              </div>
            </div>
            <RegionPreview config={regionConfig} onChange={onRegionChange} />
          </div>

          <div className="mixer-footer">
            <div className="mixer-totals">
              <span>Mag: {(totalMagWeight * 100).toFixed(0)}%</span>
              <span>Phase: {(totalPhaseWeight * 100).toFixed(0)}%</span>
            </div>
            <span className="channel-count">{channels.length} sources</span>
          </div>
        </>
      )}
    </div>
  );
};

interface MixerChannelRowProps {
  channel: MixerChannel;
  viewMode: 'magnitude' | 'phase' | 'both';
  soloActive: boolean;
  onMagWeightChange: (weight: number) => void;
  onPhaseWeightChange: (weight: number) => void;
  onMuteToggle: () => void;
  onSoloToggle: () => void;
  onLockToggle: () => void;
}

const MixerChannelRow: React.FC<MixerChannelRowProps> = ({
  channel,
  viewMode,
  soloActive,
  onMagWeightChange,
  onPhaseWeightChange,
  onMuteToggle,
  onSoloToggle,
  onLockToggle
}) => {
  // Determine if this channel is effectively muted
  const effectivelyMuted = channel.muted || (soloActive && !channel.solo);

  const handleMagSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (channel.locked) return;
    onMagWeightChange(Number(e.target.value));
  };

  const handlePhaseSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (channel.locked) return;
    onPhaseWeightChange(Number(e.target.value));
  };

  const channelColors = ['#4dd0e1', '#7c4dff', '#2fe0c7', '#ff6b9d'];
  const color = channel.color || channelColors[parseInt(channel.id.slice(-1)) % 4];

  return (
    <div 
      className={`mixer-channel ${effectivelyMuted ? 'muted' : ''} ${channel.locked ? 'locked' : ''}`}
      style={{ 
        opacity: effectivelyMuted ? 0.5 : 1,
        borderLeft: `3px solid ${color}`
      }}
    >
      <span className="channel-name" title={channel.name}>
        {channel.name}
      </span>
      
      {(viewMode === 'magnitude' || viewMode === 'both') && (
        <div className="channel-slider-container">
          <div className="channel-slider">
            <div 
              className="fill" 
              style={{ 
                width: `${channel.magnitudeWeight * 100}%`,
                background: `linear-gradient(90deg, ${color}66, ${color})` 
              }} 
            />
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={channel.magnitudeWeight}
              onChange={handleMagSliderChange}
              disabled={channel.locked}
              aria-label={`${channel.name} magnitude weight`}
            />
          </div>
          <span className="slider-value">{(channel.magnitudeWeight * 100).toFixed(0)}</span>
        </div>
      )}

      {(viewMode === 'phase' || viewMode === 'both') && (
        <div className="channel-slider-container">
          <div className="channel-slider phase">
            <div 
              className="fill" 
              style={{ 
                width: `${channel.phaseWeight * 100}%`,
                background: `linear-gradient(90deg, #7c4dff66, #7c4dff)` 
              }} 
            />
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={channel.phaseWeight}
              onChange={handlePhaseSliderChange}
              disabled={channel.locked}
              aria-label={`${channel.name} phase weight`}
            />
          </div>
          <span className="slider-value">{(channel.phaseWeight * 100).toFixed(0)}</span>
        </div>
      )}

      <button
        className={`channel-btn mute ${channel.muted ? 'active' : ''}`}
        onClick={onMuteToggle}
        aria-pressed={channel.muted}
        title="Mute (M)"
      >
        M
      </button>

      <button
        className={`channel-btn solo ${channel.solo ? 'active' : ''}`}
        onClick={onSoloToggle}
        aria-pressed={channel.solo}
        title="Solo (S)"
      >
        S
      </button>

      <button
        className={`channel-lock ${channel.locked ? 'locked' : ''}`}
        onClick={onLockToggle}
        aria-pressed={channel.locked}
        title={channel.locked ? 'Unlock' : 'Lock'}
      >
        {channel.locked ? '🔒' : '🔓'}
      </button>

      {channel.warning && (
        <span className="channel-warning" title="Clipping detected">⚠️</span>
      )}
    </div>
  );
};

// Region Preview Canvas Component
interface RegionPreviewProps {
  config: RegionConfig;
  onChange: (config: RegionConfig) => void;
}

const RegionPreview: React.FC<RegionPreviewProps> = ({ config, onChange }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvas.getBoundingClientRect();
    canvas.width = width * window.devicePixelRatio;
    canvas.height = height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    const cx = width / 2;
    const cy = height / 2;
    const maxR = Math.min(cx, cy) - 4;

    // Background
    ctx.fillStyle = '#0a0c12';
    ctx.fillRect(0, 0, width, height);

    // Grid circles
    ctx.strokeStyle = 'rgba(77, 208, 225, 0.1)';
    ctx.lineWidth = 0.5;
    for (let r = maxR * 0.25; r <= maxR; r += maxR * 0.25) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Draw region based on type
    ctx.fillStyle = 'rgba(77, 208, 225, 0.2)';
    ctx.strokeStyle = '#4dd0e1';
    ctx.lineWidth = 1.5;

    const innerR = config.innerRadius * maxR;
    const outerR = config.outerRadius * maxR;

    if (config.type === 'circle') {
      ctx.beginPath();
      ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (config.type === 'ring') {
      ctx.beginPath();
      ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
      ctx.arc(cx, cy, innerR, 0, Math.PI * 2, true);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
      ctx.stroke();
    } else if (config.type === 'sector') {
      const startA = (config.startAngle * Math.PI) / 180;
      const endA = (config.endAngle * Math.PI) / 180;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, outerR, startA, endA);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // Center dot
    ctx.fillStyle = '#4dd0e1';
    ctx.beginPath();
    ctx.arc(cx, cy, 2, 0, Math.PI * 2);
    ctx.fill();
  }, [config]);

  const handleMouseDown = () => setIsDragging(true);
  const handleMouseUp = () => setIsDragging(false);
  
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    const r = Math.sqrt(x * x + y * y) / (Math.min(rect.width, rect.height) / 2 - 4);
    
    onChange({
      ...config,
      outerRadius: Math.max(0.1, Math.min(1, r))
    });
  };

  return (
    <div className="region-preview-canvas-container">
      <canvas 
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseUp}
      />
      <div className="region-size-label">
        R: {(config.outerRadius * 100).toFixed(0)}%
      </div>
    </div>
  );
};

export default ComponentsMixerDrawer;
