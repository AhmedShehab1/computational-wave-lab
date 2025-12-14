import { useGlobalStore } from '@/state/globalStore'
import type { ImageSlotId } from '@/types'

const CHANNEL_LABELS: Record<ImageSlotId, string> = {
  A: 'Channel A',
  B: 'Channel B',
  C: 'Channel C',
  D: 'Channel D',
}

export function MixerControls() {
  const mixerConfig = useGlobalStore((s) => s.mixerConfig)
  const updateMixerChannel = useGlobalStore((s) => s.updateMixerChannel)
  const toggleChannelLock = useGlobalStore((s) => s.toggleChannelLock)
  const brightnessConfig = useGlobalStore((s) => s.brightnessConfig)
  const setBrightnessConfig = useGlobalStore((s) => s.setBrightnessConfig)

  // Handle legacy store data that might not have channels array
  const channels = mixerConfig.channels ?? []

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ fontWeight: 600 }}>Weights</span>
      </div>
      {channels.map((channel) => (
        <div key={channel.id} style={{ display: 'grid', gap: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, alignItems: 'center' }}>
            <span>{CHANNEL_LABELS[channel.id]}</span>
            <button
              type="button"
              title={channel.locked ? 'Unlock weights' : 'Lock weights together'}
              onClick={() => toggleChannelLock(channel.id)}
              style={{ fontSize: 12, marginRight: 8 }}
            >
              {channel.locked ? '🔒' : '🔓'}
            </button>
            <input
              type="number"
              step={0.05}
              value={channel.weight1}
              onChange={(e) => updateMixerChannel(channel.id, { weight1: Number(e.target.value) })}
              style={{ width: 64 }}
            />
          </div>
          <input
            type="range"
            min={-2}
            max={2}
            step={0.05}
            value={channel.weight1}
            onChange={(e) => updateMixerChannel(channel.id, { weight1: Number(e.target.value) })}
          />
        </div>
      ))}
      <label title="Adjust brightness in spatial or FT domain" style={{ display: 'grid', gap: 4 }}>
        Brightness ({brightnessConfig.target})
        <input
          type="range"
          min={-128}
          max={128}
          step={1}
          value={brightnessConfig.value}
          onChange={(e) => setBrightnessConfig({ ...brightnessConfig, value: Number(e.target.value) })}
        />
      </label>
      <label style={{ display: 'grid', gap: 4 }}>
        Contrast
        <input
          type="range"
          min={0.1}
          max={4}
          step={0.05}
          value={brightnessConfig.contrast}
          onChange={(e) =>
            setBrightnessConfig({ ...brightnessConfig, contrast: Number(e.target.value) })
          }
        />
      </label>
    </div>
  )
}
