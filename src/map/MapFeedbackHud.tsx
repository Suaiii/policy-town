import type { MapSnapshot } from '../../packages/contracts/src'

export type TableMapView = 'overview' | 'district' | 'project'

export function MapFeedbackHud({
  snapshot,
  view,
  transition,
  onViewChange,
  onSkip,
}: {
  snapshot: MapSnapshot
  view: TableMapView
  transition: { active: boolean; remaining: number }
  onViewChange: (view: TableMapView) => void
  onSkip: () => void
}) {
  const active = snapshot.projects.filter((project) => project.lifecycle === 'active').length
  const averageBuilt = snapshot.projects.length
    ? Math.round(snapshot.projects.reduce((total, project) => total + project.builtProgress, 0) / snapshot.projects.length)
    : 0

  return (
    <div className="table-map-hud">
      <div className="table-map-summary">
        <small>HEFEI INDUSTRIAL SANDBOX · REV {snapshot.revision}</small>
        <strong>合肥城市响应沙盘</strong>
        <span>{active} 个活跃地块 · 综合建设 {averageBuilt}%</span>
      </div>

      <nav className="table-map-cameras" aria-label="沙盘镜头">
        {([
          ['overview', '全市'],
          ['district', '片区'],
          ['project', '项目'],
        ] as Array<[TableMapView, string]>).map(([id, label]) => (
          <button key={id} className={view === id ? 'is-active' : ''} onClick={() => onViewChange(id)}>{label}</button>
        ))}
      </nav>

      {transition.active && (
        <button className="table-map-transition" onClick={onSkip}>
          正在反馈 {transition.remaining} 个地块 <b>跳过</b>
        </button>
      )}

      <span className="table-map-attribution">© OpenStreetMap contributors · ODbL · 演示简化</span>
    </div>
  )
}
