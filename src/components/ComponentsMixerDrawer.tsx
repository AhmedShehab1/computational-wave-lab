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
  const updateMixerChannel = useGlobalStore((s) => s.updateMixerChannel);
  const setMixerMode = useGlobalStore((s) => s.setMixerMode);
  const toggleChannelMute = useGlobalStore((s) => s.toggleChannelMute);
  const toggleChannelSolo = useGlobalStore((s) => s.toggleChannelSolo);
  const toggleChannelLock = useGlobalStore((s) => s.toggleChannelLock);

  // Filter channels to only show those with loaded images (Reactive UX)
  // Note: allChannels logic is inside useMemo to avoid dependency issues
  const activeChannels = useMemo(
    () => {
      const allChannels = mixerConfig.channels ?? [];
      return allChannels.filter((ch) => images[ch.id] !== null);
    },
    [mixerConfig.channels, images]
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
        updateMixerChannel(id, { weight1: value });
      });
    },
    [updateMixerChannel]
  );

  const handleWeight2Change = useCallback(
    (id: ImageSlotId, value: number) => {
      startTransition(() => {
        updateMixerChannel(id, { weight2: value });
      });
    },
    [updateMixerChannel]
  );

  const handleModeToggle = useCallback(() => {
    const newMode: MixerMode = mixerConfig.mode === 'mag-phase' ? 'real-imag' : 'mag-phase';
    setMixerMode(newMode);
  }, [mixerConfig.mode, setMixerMode]);

  // -------------------------------------------------------------------------
  // Compute warnings (clipping detection)
  // -------------------------------------------------------------------------
  const channelWarnings = useMemo(() => {
    const warnings = new Map<ImageSlotId, boolean>();
    for (const ch of activeChannels) {
      // Warn if weight exceeds reasonable bounds
      const hasWarning = ch.weight1 > 1.5 || ch.weight2 > 1.5 || ch.weight1 < 0 || ch.weight2 < 0;
      warnings.set(ch.id, hasWarning);
    }
    return warnings;
  }, [activeChannels]);

  // Check if we have any loaded images
  const hasActiveChannels = activeChannels.length > 0;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className={`components-mixer-drawer ${className || ''}`} data-pending={isPending}>
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
                {/* Weight 1 Slider (Magnitude / Real) */}
                <div className="slider-container">
                  <button
                    className={`lock-btn ${channel.locked ? 'locked' : ''}`}
                    onClick={() => toggleChannelLock(channel.id)}
                    title={channel.locked ? 'Unlock weights' : 'Lock weights together'}
                    aria-pressed={channel.locked}
                  >
                    {channel.locked ? '🔒' : '🔓'}
                  </button>
                  <div className="slider-track">
                    <div
                      className="slider-fill"
                      style={{ width: `${Math.min(100, Math.max(0, channel.weight1 * 50))}%` }}
                    />
                    <input
                      type="range"
                      min="-2"
                      max="2"
                      step="0.01"
                      value={channel.weight1}
                      onChange={(e) => handleWeight1Change(channel.id, parseFloat(e.target.value))}
                      className="slider-input"
                      aria-label={`${CHANNEL_LABELS[channel.id]} ${mixerConfig.mode === 'mag-phase' ? 'magnitude' : 'real'} weight`}
                    />
                    <div
                      className="slider-thumb"
                      style={{ left: `${((channel.weight1 + 2) / 4) * 100}%` }}
                    />
                  </div>
                </div>

                {/* Weight 2 Slider (Phase / Imaginary) - Only visible when unlocked */}
                {!channel.locked && (
                  <div className="slider-container secondary">
                    <div className="slider-track phase">
                      <div
                        className="slider-fill"
                        style={{ width: `${Math.min(100, Math.max(0, channel.weight2 * 50))}%` }}
                      />
                      <input
                        type="range"
                        min="-2"
                        max="2"
                        step="0.01"
                        value={channel.weight2}
                        onChange={(e) => handleWeight2Change(channel.id, parseFloat(e.target.value))}
                        className="slider-input"
                        aria-label={`${CHANNEL_LABELS[channel.id]} ${mixerConfig.mode === 'mag-phase' ? 'phase' : 'imaginary'} weight`}
                      />
                      <div
                        className="slider-thumb phase"
                        style={{ left: `${((channel.weight2 + 2) / 4) * 100}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Control Buttons */}
              <div className="channel-controls">
                <button
                  className={`control-btn mute ${channel.muted ? 'active' : ''}`}
                  onClick={() => toggleChannelMute(channel.id)}
                  title="Mute channel"
                  aria-pressed={channel.muted}
                >
                  Mute
                </button>
                <button
                  className={`control-btn solo ${channel.solo ? 'active' : ''}`}
                  onClick={() => toggleChannelSolo(channel.id)}
                  title="Solo channel"
                  aria-pressed={channel.solo}
                >
                  Solo
                </button>
                <button
                  className={`control-btn lock ${channel.locked ? 'active' : ''}`}
                  onClick={() => toggleChannelLock(channel.id)}
                  title={channel.locked ? 'Unlock weights' : 'Lock weights'}
                  aria-pressed={channel.locked}
                >
                  🔒
                </button>
              </div>

              {/* Numeric Input */}
              <input
                type="number"
                className="weight-input"
                min="-2"
                max="2"
                step="0.01"
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

      {/* Footer Info */}
      <div className="mixer-footer">
        <span className="footer-info">
          🔵 IFFT Duration: ~12ms (Depends on FFT Size)
        </span>
      </div>
    </div>
  );
};

export default ComponentsMixerDrawer;
