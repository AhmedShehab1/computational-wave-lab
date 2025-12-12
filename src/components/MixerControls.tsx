import { useGlobalStore } from '@/state/globalStore'

const weightLabels = ['A', 'B', 'C', 'D']

export function MixerControls() {
  const mixerConfig = useGlobalStore((s) => s.mixerConfig)
  const setMixerConfig = useGlobalStore((s) => s.setMixerConfig)
  const brightnessConfig = useGlobalStore((s) => s.brightnessConfig)
  const setBrightnessConfig = useGlobalStore((s) => s.setBrightnessConfig)

  const updateWeight = (idx: number, value: number) => {
    const next = mixerConfig.values.length ? [...mixerConfig.values] : [1, 1, 1, 1]
    next[idx] = value
    setMixerConfig({ ...mixerConfig, values: next })
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ fontWeight: 600 }}>Weights</span>
        <button
          type="button"
          title="Lock weight symmetry"
          onClick={() => setMixerConfig({ ...mixerConfig, locked: !mixerConfig.locked })}
          style={{ fontSize: 12 }}
        >
          {mixerConfig.locked ? '🔒' : '🔓'}
        </button>
      </div>
      {weightLabels.map((label, idx) => (
        <div key={label} style={{ display: 'grid', gap: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
            <span>Channel {label}</span>
            <input
              type="number"
              step={0.05}
              value={mixerConfig.values[idx] ?? 1}
              onChange={(e) => updateWeight(idx, Number(e.target.value))}
              style={{ width: 64 }}
            />
          </div>
          <input
            type="range"
            min={-2}
            max={2}
            step={0.05}
            value={mixerConfig.values[idx] ?? 1}
            onChange={(e) => updateWeight(idx, Number(e.target.value))}
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
