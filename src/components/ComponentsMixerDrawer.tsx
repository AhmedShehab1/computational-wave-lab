import React, { useMemo, useDeferredValue, useCallback, startTransition } from 'react';
import { useGlobalStore } from '@/state/globalStore';
import type { ImageSlotId, MixerMode } from '@/types';
import './ComponentsMixerDrawer.css';

// Channel display names
const CHANNEL_LABELS: Record<ImageSlotId, string> = {
  A: 'Input A',
  B: 'Input B',
  C: 'Reference C',
  D: 'Noise D',
};

// Channel accent colors (neon teal palette)
const CHANNEL_COLORS: Record<ImageSlotId, string> = {
  A: '#4dd0e1',
  B: '#26c6da',
  C: '#00bcd4',
  D: '#00acc1',
};

interface ComponentsMixerDrawerProps {
  className?: string;
}

export const ComponentsMixerDrawer: React.FC<ComponentsMixerDrawerProps> = ({ className }) => {
  // -------------------------------------------------------------------------
  // State from global store
  // -------------------------------------------------------------------------
  const mixerConfig = useGlobalStore((s) => s.mixerConfig);
  const images = useGlobalStore((s) => s.images);
  const activeRegionEdit = useGlobalStore((s) => s.activeRegionEdit);
  const innerChannels = useGlobalStore((s) => s.innerChannels);
  const outerChannels = useGlobalStore((s) => s.outerChannels);
  const setActiveRegionEdit = useGlobalStore((s) => s.setActiveRegionEdit);
  const updateRegionChannel = useGlobalStore((s) => s.updateRegionChannel);
  const setMixerMode = useGlobalStore((s) => s.setMixerMode);

  // Get the current channels based on active region
  const currentChannels = activeRegionEdit === 'inside' ? innerChannels : outerChannels;

  // Filter channels to only show those with loaded images (Reactive UX)
  const activeChannels = useMemo(
    () => currentChannels.filter((ch) => images[ch.id] !== null),
    [currentChannels, images]
  );

  // Defer heavy state updates for 60fps slider responsiveness
  const deferredChannels = useDeferredValue(activeChannels);
  const isPending = deferredChannels !== activeChannels;

  // Check if any channel has solo active (only among active channels)
  const soloActive = useMemo(
    () => activeChannels.some((ch) => ch.solo),
    [activeChannels]
  );

  // -------------------------------------------------------------------------
  // Handlers with startTransition for non-blocking updates
  // -------------------------------------------------------------------------
  const handleWeight1Change = useCallback(
    (id: ImageSlotId, value: number) => {
      startTransition(() => {
        updateRegionChannel(activeRegionEdit, id, { weight1: value });
      });
    },
    [updateRegionChannel, activeRegionEdit]
  );

  const handleWeight2Change = useCallback(
    (id: ImageSlotId, value: number) => {
      startTransition(() => {
        updateRegionChannel(activeRegionEdit, id, { weight2: value });
      });
    },
    [updateRegionChannel, activeRegionEdit]
  );

  const handleModeToggle = useCallback(() => {
    const newMode: MixerMode = mixerConfig.mode === 'mag-phase' ? 'real-imag' : 'mag-phase';
    setMixerMode(newMode);
  }, [mixerConfig.mode, setMixerMode]);

  const handleToggleMute = useCallback(
    (id: ImageSlotId) => {
      const channel = currentChannels.find((ch) => ch.id === id);
      if (channel) {
        updateRegionChannel(activeRegionEdit, id, { muted: !channel.muted });
      }
    },
    [updateRegionChannel, activeRegionEdit, currentChannels]
  );

  const handleToggleSolo = useCallback(
    (id: ImageSlotId) => {
      const channel = currentChannels.find((ch) => ch.id === id);
      if (channel) {
        updateRegionChannel(activeRegionEdit, id, { solo: !channel.solo });
      }
    },
    [updateRegionChannel, activeRegionEdit, currentChannels]
  );

  const handleToggleLock = useCallback(
    (id: ImageSlotId) => {
      const channel = currentChannels.find((ch) => ch.id === id);
      if (channel) {
        const newLocked = !channel.locked;
        updateRegionChannel(activeRegionEdit, id, { 
          locked: newLocked,
          ...(newLocked ? { weight2: channel.weight1 } : {})
        });
      }
    },
    [updateRegionChannel, activeRegionEdit, currentChannels]
  );

  // -------------------------------------------------------------------------
  // Compute warnings (clipping detection) - now for 0-1 range
  // -------------------------------------------------------------------------
  const channelWarnings = useMemo(() => {
    const warnings = new Map<ImageSlotId, boolean>();
    for (const ch of activeChannels) {
      // Warn if weight exceeds 1 or is negative
      const hasWarning = ch.weight1 > 1 || ch.weight2 > 1 || ch.weight1 < 0 || ch.weight2 < 0;
      warnings.set(ch.id, hasWarning);
    }
    return warnings;
  }, [activeChannels]);

  // Check if we have any loaded images
  const hasActiveChannels = activeChannels.length > 0;

  // Border color based on active region
  const regionBorderColor = activeRegionEdit === 'inside' ? '#00aaff' : '#ff8800';

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div 
      className={`components-mixer-drawer ${className || ''}`} 
      data-pending={isPending}
      style={{ '--region-border-color': regionBorderColor } as React.CSSProperties}
    >
      {/* Header */}
      <div className="mixer-header">
        <span className="mixer-title">COMPONENTS MIXER</span>
        <div className="mixer-mode-toggle">
          <span className={mixerConfig.mode === 'mag-phase' ? 'active' : ''}>
            Mag/Phase
          </span>
          <button
            className="toggle-switch"
            onClick={handleModeToggle}
            aria-pressed={mixerConfig.mode === 'real-imag'}
            title="Toggle mixer mode"
            disabled={!hasActiveChannels}
          >
            <span
              className="toggle-knob"
              style={{
                transform: mixerConfig.mode === 'real-imag' ? 'translateX(20px)' : 'translateX(0)',
              }}
            />
          </button>
          <span className={mixerConfig.mode === 'real-imag' ? 'active' : ''}>Real/Imag</span>
        </div>
      </div>

      {/* Region Toggle (Inner / Outer) */}
      <div className="region-toggle-container">
        <button
          className={`region-toggle-btn ${activeRegionEdit === 'inside' ? 'active inside' : ''}`}
          onClick={() => setActiveRegionEdit('inside')}
          aria-pressed={activeRegionEdit === 'inside'}
        >
          Inner
        </button>
        <button
          className={`region-toggle-btn ${activeRegionEdit === 'outside' ? 'active outside' : ''}`}
          onClick={() => setActiveRegionEdit('outside')}
          aria-pressed={activeRegionEdit === 'outside'}
        >
          Outer
        </button>
      </div>

      {/* Channel Rows or Empty State */}
      <div className="mixer-channels">
        {hasActiveChannels ? (
          activeChannels.map((channel) => {
          const isEffectivelyMuted = channel.muted || (soloActive && !channel.solo);
          const hasWarning = channelWarnings.get(channel.id) || false;
          const color = CHANNEL_COLORS[channel.id];

          return (
            <div
              key={channel.id}
              className={`mixer-channel-row ${isEffectivelyMuted ? 'muted' : ''} ${channel.locked ? 'locked' : ''}`}
              style={{ '--channel-color': color } as React.CSSProperties}
            >
              {/* Channel Label */}
              <span className="channel-label">{CHANNEL_LABELS[channel.id]}</span>

              {/* Dual Slider Track */}
              <div className="channel-sliders">
                {/* Weight 1 Slider (Magnitude / Real) - Range 0-1 */}
                <div className="slider-container">
                  <button
                    className={`lock-btn ${channel.locked ? 'locked' : ''}`}
                    onClick={() => handleToggleLock(channel.id)}
                    title={channel.locked ? 'Unlock weights' : 'Lock weights together'}
                    aria-pressed={channel.locked}
                  >
                    {channel.locked ? '🔒' : '🔓'}
                  </button>
                  <div className="slider-track">
                    <div
                      className="slider-fill"
                      style={{ width: `${Math.min(100, Math.max(0, channel.weight1 * 100))}%` }}
                    />
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={channel.weight1}
                      onChange={(e) => handleWeight1Change(channel.id, parseFloat(e.target.value))}
                      className="slider-input"
                      aria-label={`${CHANNEL_LABELS[channel.id]} ${mixerConfig.mode === 'mag-phase' ? 'magnitude' : 'real'} weight`}
                    />
                    <div
                      className="slider-thumb"
                      style={{ left: `${channel.weight1 * 100}%` }}
                    />
                  </div>
                </div>

                {/* Weight 2 Slider (Phase / Imaginary) - Only visible when unlocked */}
                {!channel.locked && (
                  <div className="slider-container secondary">
                    <div className="slider-track phase">
                      <div
                        className="slider-fill"
                        style={{ width: `${Math.min(100, Math.max(0, channel.weight2 * 100))}%` }}
                      />
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={channel.weight2}
                        onChange={(e) => handleWeight2Change(channel.id, parseFloat(e.target.value))}
                        className="slider-input"
                        aria-label={`${CHANNEL_LABELS[channel.id]} ${mixerConfig.mode === 'mag-phase' ? 'phase' : 'imaginary'} weight`}
                      />
                      <div
                        className="slider-thumb phase"
                        style={{ left: `${channel.weight2 * 100}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Control Buttons */}
              <div className="channel-controls">
                <button
                  className={`control-btn mute ${channel.muted ? 'active' : ''}`}
                  onClick={() => handleToggleMute(channel.id)}
                  title="Mute channel"
                  aria-pressed={channel.muted}
                >
                  Mute
                </button>
                <button
                  className={`control-btn solo ${channel.solo ? 'active' : ''}`}
                  onClick={() => handleToggleSolo(channel.id)}
                  title="Solo channel"
                  aria-pressed={channel.solo}
                >
                  Solo
                </button>
                <button
                  className={`control-btn lock ${channel.locked ? 'active' : ''}`}
                  onClick={() => handleToggleLock(channel.id)}
                  title={channel.locked ? 'Unlock weights' : 'Lock weights'}
                  aria-pressed={channel.locked}
                >
                  🔒
                </button>
              </div>

              {/* Numeric Input - Range 0-1 */}
              <input
                type="number"
                className="weight-input"
                min="0"
                max="1"
                step="0.05"
                value={channel.weight1.toFixed(2)}
                onChange={(e) => handleWeight1Change(channel.id, parseFloat(e.target.value) || 0)}
                aria-label={`${CHANNEL_LABELS[channel.id]} weight value`}
              />

              {/* Warning Indicator */}
              {hasWarning && (
                <span className="warning-indicator" title="Weight may cause clipping">
                  ⚠️
                </span>
              )}
            </div>
          );
        })
        ) : (
          /* Empty State Placeholder */
          <div className="mixer-empty-state">
            <div className="empty-icon">
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
            </div>
            <p className="empty-text">Load images in the grid to enable mixing controls.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ComponentsMixerDrawer;
