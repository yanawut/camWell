import { useRef, useState } from 'react'
import { COLORS, drawFloorPlan, drawHeatmap, fitCanvas, PERSON_MARKERS, type PersonMarker } from './drawLive'
import { useLiveDraw, useYoloLive } from './useYoloLive'
import type { ObjectClass, PersonState } from './types'

function StatRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="yc-stat-row">
      <span className="dc-muted">{label}</span>
      <span className={`yc-stat-value ${accent ? 'yc-accent' : ''}`}>{value}</span>
    </div>
  )
}

export function StatsPanel() {
  const stats = useYoloLive((s) => s.panel?.stats ?? null)
  const badge = useYoloLive((s) => s.panel?.badge ?? null)
  const state = useYoloLive((s) => s.status.state)
  const showBadge = badge && (state === 'running' || state === 'paused' || state === 'holding')
  const ratio = stats?.chairs ? stats.chairsOccupied / stats.chairs : 0
  return (
    <div className="dc-card dc-pad">
      <div className="dc-card-head">
        <h2 className="dc-h2">สถิติ</h2>
        {showBadge && <span className="dc-tag yc-live-tag">{badge}</span>}
      </div>
      <StatRow label="People detected" value={String(stats?.people ?? 0)} accent />
      <StatRow label="Sitting / Standing / Walking" value={`${stats?.sitting ?? 0} / ${stats?.standing ?? 0} / ${stats?.walking ?? 0}`} />
      <div className="yc-stat-row yc-stat-col">
        <div className="yc-stat-line">
          <span className="dc-muted">Chair utilisation</span>
          <span className="yc-stat-value yc-accent">{stats?.chairsOccupied ?? 0}/{stats?.chairs ?? 0}</span>
        </div>
        <div className="yc-meter"><i style={{ width: `${ratio * 100}%` }} /></div>
      </div>
      <StatRow label="Tables / Monitors / Laptops" value={`${stats?.tables ?? 0} / ${stats?.monitors ?? 0} / ${stats?.laptops ?? 0}`} />
      <StatRow label="Walking speed (max)" value={`${(stats?.maxSpeed ?? 0).toFixed(2)} m/s`} accent />
      <StatRow label="Busiest zone" value={`${stats?.busiestZone ?? '-'} (${stats?.busiestCount ?? 0})`} />
      <StatRow label="Avg dwell in zone" value={`${(stats?.avgDwell ?? 0).toFixed(0)} s`} accent />
    </div>
  )
}

export function HeatmapCard() {
  const ref = useRef<HTMLCanvasElement>(null)
  useLiveDraw(ref, (canvas, live) => {
    const fit = fitCanvas(canvas)
    if (!fit) return
    if (live.snapshot) drawHeatmap(fit.ctx, fit.width, fit.height, live.snapshot.floor, live.heat)
    else fit.ctx.clearRect(0, 0, fit.width, fit.height)
  })
  return (
    <div className="dc-card dc-pad">
      <div className="dc-card-head"><h2 className="dc-h2">Occupancy heatmap</h2></div>
      <canvas ref={ref} className="yc-panel-canvas yc-heat" role="img" aria-label="แผนที่ความหนาแน่นของคนในห้อง" />
    </div>
  )
}

export function FloorPlanCard() {
  const ref = useRef<HTMLCanvasElement>(null)
  const [showObjects, setShowObjects] = useState(true)
  const [marker, setMarker] = useState<PersonMarker>('dot')
  useLiveDraw(ref, (canvas, live) => {
    const fit = fitCanvas(canvas)
    if (!fit) return
    if (live.snapshot) drawFloorPlan(fit.ctx, fit.width, fit.height, live.snapshot, { showObjects, marker })
    else fit.ctx.clearRect(0, 0, fit.width, fit.height)
  })
  return (
    <div className="dc-card dc-pad">
      <div className="dc-card-head yc-wrap-head">
        <h2 className="dc-h2">Floor plan</h2>
        <div className="yc-row yc-tight">
          <button
            type="button"
            aria-pressed={showObjects}
            className={`dc-toggle dc-toggle-sm ${showObjects ? 'on' : ''}`}
            onClick={() => setShowObjects((v) => !v)}
          >
            สิ่งของ
          </button>
          <div className="dc-segment" role="radiogroup" aria-label="รูปแบบตำแหน่งคนบนผัง">
            {(Object.entries(PERSON_MARKERS) as [PersonMarker, string][]).map(([key, text]) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={marker === key}
                className={marker === key ? 'active' : ''}
                onClick={() => setMarker(key)}
              >
                {text}
              </button>
            ))}
          </div>
        </div>
      </div>
      <canvas ref={ref} className="yc-panel-canvas yc-floormap" role="img" aria-label="แผนผังพื้นห้องและตำแหน่งคน" />
    </div>
  )
}

const LEGEND: [string, PersonState | ObjectClass][] = [
  ['Person - sitting', 'sitting'],
  ['Person - standing', 'standing'],
  ['Person - walking', 'walking'],
  ['Chair', 'chair'],
  ['Table', 'table'],
  ['Monitor', 'monitor'],
  ['Laptop', 'laptop'],
]

export function LegendCard() {
  return (
    <div className="dc-card dc-pad">
      <div className="dc-card-head"><h2 className="dc-h2">Legend</h2></div>
      <div className="yc-legend">
        {LEGEND.map(([text, key]) => (
          <span key={key}>
            <i className="yc-swatch" style={{ borderColor: COLORS[key] }} />
            {text}
          </span>
        ))}
        <span>
          <i className="yc-swatch yc-swatch-trail" />
          Trajectory / Tracking
        </span>
      </div>
    </div>
  )
}
