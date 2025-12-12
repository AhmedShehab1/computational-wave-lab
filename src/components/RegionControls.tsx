import { useGlobalStore } from '@/state/globalStore'
import type { RegionMask } from '@/types'

export function RegionControls() {
  const regionMask = useGlobalStore((s) => s.regionMask)
  const setRegionMask = useGlobalStore((s) => s.setRegionMask)

  const update = (patch: Partial<RegionMask>) => setRegionMask({ ...regionMask, ...patch })

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <label>
        Region mode
        <select
          value={regionMask.mode}
          onChange={(e) => update({ mode: e.target.value as RegionMask['mode'] })}
        >
          <option value="include">Include</option>
          <option value="exclude">Exclude</option>
        </select>
      </label>
      <label>
        Radius
        <input
          type="number"
          min={0.1}
          max={1}
          step={0.1}
          value={regionMask.radius ?? 1}
          onChange={(e) => update({ radius: Number(e.target.value) })}
        />
      </label>
    </div>
  )
}
