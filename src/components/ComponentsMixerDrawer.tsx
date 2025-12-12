import React, { useState } from 'react';

export interface MixerChannel {
  id: string;
  name: string;
  weight: number;
  muted: boolean;
  solo: boolean;
  locked: boolean;
  warning?: boolean;
}

interface ComponentsMixerDrawerProps {
  channels: MixerChannel[];
  onWeightChange: (id: string, weight: number) => void;
  onMuteToggle: (id: string) => void;
  onSoloToggle: (id: string) => void;
  onLockToggle: (id: string) => void;
  showPhase?: boolean;
}

export const ComponentsMixerDrawer: React.FC<ComponentsMixerDrawerProps> = ({
  channels,
  onWeightChange,
  onMuteToggle,
  onSoloToggle,
  onLockToggle,
  showPhase = true
}) => {
  const [viewMode, setViewMode] = useState<'magnitude' | 'phase'>('magnitude');

  // Calculate if any solo is active (affects mute behavior)
  const soloActive = channels.some(c => c.solo);
  
  // Calculate total weight
  const totalWeight = channels.reduce((sum, c) => sum + (c.muted ? 0 : c.weight), 0);

  return (
    <div className="mixer-drawer">
      <div className="mixer-drawer-header">
        <h3>🎚️ Components Mixer</h3>
        {showPhase && (
          <div className="mixer-view-toggle">
            <button
              className={viewMode === 'magnitude' ? 'active' : ''}
              onClick={() => setViewMode('magnitude')}
              aria-pressed={viewMode === 'magnitude'}
            >
              Mag
            </button>
            <button
              className={viewMode === 'phase' ? 'active' : ''}
              onClick={() => setViewMode('phase')}
              aria-pressed={viewMode === 'phase'}
            >
              Phase
            </button>
          </div>
        )}
      </div>

      <div className="mixer-channels">
        {channels.map(channel => (
          <MixerChannelRow
            key={channel.id}
            channel={channel}
            soloActive={soloActive}
            onWeightChange={(weight) => onWeightChange(channel.id, weight)}
            onMuteToggle={() => onMuteToggle(channel.id)}
            onSoloToggle={() => onSoloToggle(channel.id)}
            onLockToggle={() => onLockToggle(channel.id)}
          />
        ))}
      </div>

      <div className="mixer-footer">
        <span>Total: {(totalWeight * 100).toFixed(0)}%</span>
        <span>{channels.length} channels</span>
      </div>
    </div>
  );
};

interface MixerChannelRowProps {
  channel: MixerChannel;
  soloActive: boolean;
  onWeightChange: (weight: number) => void;
  onMuteToggle: () => void;
  onSoloToggle: () => void;
  onLockToggle: () => void;
}

const MixerChannelRow: React.FC<MixerChannelRowProps> = ({
  channel,
  soloActive,
  onWeightChange,
  onMuteToggle,
  onSoloToggle,
  onLockToggle
}) => {
  // Determine if this channel is effectively muted
  const effectivelyMuted = channel.muted || (soloActive && !channel.solo);

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (channel.locked) return;
    onWeightChange(Number(e.target.value));
  };

  return (
    <div 
      className={`mixer-channel ${effectivelyMuted ? 'muted' : ''}`}
      style={{ opacity: effectivelyMuted ? 0.5 : 1 }}
    >
      <span className="channel-name">{channel.name}</span>
      
      <div className="channel-slider">
        <div 
          className="fill" 
          style={{ width: `${channel.weight * 100}%` }} 
        />
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={channel.weight}
          onChange={handleSliderChange}
          disabled={channel.locked}
          aria-label={`${channel.name} weight`}
        />
      </div>

      <button
        className={`channel-btn ${channel.muted ? 'active' : ''}`}
        onClick={onMuteToggle}
        aria-pressed={channel.muted}
        title="Mute (M)"
      >
        M
      </button>

      <button
        className={`channel-btn ${channel.solo ? 'active' : ''}`}
        onClick={onSoloToggle}
        aria-pressed={channel.solo}
        title="Solo (S)"
        style={channel.solo ? { background: 'var(--warn-amber)', borderColor: 'var(--warn-amber)' } : undefined}
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

      <span className="channel-value">
        {(channel.weight * 100).toFixed(0)}%
      </span>

      {channel.warning && (
        <span className="channel-warning" title="Clipping detected">⚠️</span>
      )}
    </div>
  );
};

export default ComponentsMixerDrawer;
