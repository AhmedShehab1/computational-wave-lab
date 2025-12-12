import { useGlobalStore } from '@/state/globalStore'

export function MixerControls() {
  const mixerConfig = useGlobalStore((s) => s.mixerConfig)
  const setMixerConfig = useGlobalStore((s) => s.setMixerConfig)
  const brightnessConfig = useGlobalStore((s) => s.brightnessConfig)
  const setBrightnessConfig = useGlobalStore((s) => s.setBrightnessConfig)

  const updateWeights = (value: number) => {
    const next = mixerConfig.values.length ? mixerConfig.values.slice() : [1, 1, 1, 1]
    next[0] = value
    setMixerConfig({ ...mixerConfig, values: next })
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <label>
        Weight A
        <input
          type="number"
          step={0.1}
          value={mixerConfig.values[0] ?? 1}
          onChange={(e) => updateWeights(Number(e.target.value))}
        />
      </label>
      <label>
        Brightness
        <input
          type="range"
          min={-1}
          max={1}
          step={0.05}
          value={brightnessConfig.value}
          onChange={(e) => setBrightnessConfig({ ...brightnessConfig, value: Number(e.target.value) })}
        />
      </label>
      <label>
        Contrast
        <input
          type="range"
          min={0}
          max={2}
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
