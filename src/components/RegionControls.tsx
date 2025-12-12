import { useGlobalStore } from '@/state/globalStore'
import type { RegionMask } from '@/types'

export function RegionControls() {
  const regionMask = useGlobalStore((s) => s.regionMask)
  const setRegionMask = useGlobalStore((s) => s.setRegionMask)

  const update = (patch: Partial<RegionMask>) => setRegionMask({ ...regionMask, ...patch })

  return (
    <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
      <label style={{ display: 'grid', gap: 4 }}>
        Mode
        <select
          value={regionMask.mode}
          onChange={(e) => update({ mode: e.target.value as RegionMask['mode'] })}
        >
          <option value="include">Include</option>
          <option value="exclude">Exclude</option>
        </select>
      </label>
      <label style={{ display: 'grid', gap: 4 }}>
        Shape
        <select
          value={regionMask.shape}
          onChange={(e) => update({ shape: e.target.value as RegionMask['shape'] })}
        >
          <option value="circle">Circle</option>
          <option value="rect">Rectangle</option>
        </select>
      </label>
      {regionMask.shape === 'circle' ? (
        <label style={{ display: 'grid', gap: 4 }}>
          Radius (norm)
          <input
            type="number"
            min={0.05}
            max={1}
            step={0.05}
            value={regionMask.radius ?? 1}
            onChange={(e) => update({ radius: Number(e.target.value) })}
          />
        </label>
      ) : (
        <>
          <label style={{ display: 'grid', gap: 4 }}>
            Width (norm)
            <input
              type="number"
              min={0.05}
              max={1}
              step={0.05}
              value={regionMask.width ?? 1}
              onChange={(e) => update({ width: Number(e.target.value) })}
            />
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            Height (norm)
            <input
              type="number"
              min={0.05}
              max={1}
              step={0.05}
              value={regionMask.height ?? 1}
              onChange={(e) => update({ height: Number(e.target.value) })}
            />
          </label>
        </>
      )}
    </div>
  )
}
