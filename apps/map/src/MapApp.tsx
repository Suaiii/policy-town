import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  MAP_CONTRACT_VERSION,
  isGlobalToMapMessage,
  type MapSnapshot,
  type MapToGlobalMessage,
  type ProjectStage,
} from '../../../packages/contracts/src'
import { FrameCorners } from '../../../src/components/ui/ParlorUI'
import { createCapacityDemoSnapshot, createDemoSnapshot } from './demoState'
import { HefeiMapBoard, type MapViewMode } from './HefeiMapBoard'

const stages: Array<{ id: ProjectStage; label: string }> = [
  { id: 'proposal', label: '立项' },
  { id: 'construction', label: '建设' },
  { id: 'ramp', label: '爬坡' },
  { id: 'operating', label: '投产' },
  { id: 'stalled', label: '停滞' },
]

function getParentOrigin() {
  if (!document.referrer) return null
  try {
    return new URL(document.referrer).origin
  } catch {
    return null
  }
}

function getAllowedGlobalOrigins() {
  const configured = import.meta.env.VITE_GLOBAL_ORIGIN as string | undefined
  return new Set(
    [configured, 'http://localhost:5173', `${window.location.protocol}//${window.location.hostname}:5173`].filter(
      (value): value is string => Boolean(value),
    ),
  )
}

export function MapApp() {
  const embedded = useMemo(() => new URLSearchParams(window.location.search).get('embed') === '1', [])
  const [snapshot, setSnapshot] = useState<MapSnapshot>(() => createDemoSnapshot())
  const [viewMode, setViewMode] = useState<MapViewMode>('overview')
  const [connected, setConnected] = useState(false)
  const [boardReady, setBoardReady] = useState(false)
  const [transitionState, setTransitionState] = useState({ active: false, remaining: 0 })
  const [skipToken, setSkipToken] = useState(0)
  const parentOrigin = useMemo(getParentOrigin, [])
  const handleTransitionStateChange = useCallback((active: boolean, remaining: number) => {
    setTransitionState((current) => current.active === active && current.remaining === remaining
      ? current
      : { active, remaining })
  }, [])

  useEffect(() => {
    const allowedOrigins = getAllowedGlobalOrigins()
    const onMessage = (event: MessageEvent<unknown>) => {
      if (!allowedOrigins.has(event.origin) || !isGlobalToMapMessage(event.data)) return
      const message = event.data

      if (message.type === 'MAP_SNAPSHOT') {
        setSnapshot(message.payload)
        setConnected(true)
      }
    }

    window.addEventListener('message', onMessage)

    if (window.parent !== window && parentOrigin && allowedOrigins.has(parentOrigin)) {
      const readyMessage: MapToGlobalMessage = {
        type: 'MAP_READY',
        payload: { schemaVersion: MAP_CONTRACT_VERSION },
      }
      window.parent.postMessage(readyMessage, parentOrigin)
    }

    return () => window.removeEventListener('message', onMessage)
  }, [parentOrigin])

  const industrialSummary = useMemo(() => {
    const projects = snapshot.projects
    const averageProgress = projects.length
      ? Math.round(projects.reduce((sum, project) => sum + project.builtProgress, 0) / projects.length)
      : 0
    return {
      averageProgress,
      operating: projects.filter((project) => project.stage === 'operating').length,
      building: projects.filter((project) => ['construction', 'ramp'].includes(project.stage)).length,
      warning: projects.filter((project) => project.stage === 'stalled' || project.risk >= 70).length,
    }
  }, [snapshot.projects])

  return (
    <main className={`map-shell ${embedded ? 'is-embedded' : ''}`}>
      {!embedded && (
        <header className="map-header map-framed-window">
          <FrameCorners />
          <div>
            <span className="eyebrow">HEFEI INDUSTRIAL RESPONSE MAP</span>
            <h1>合肥城市响应地图</h1>
          </div>
          <div className="connection-group">
            <span className={`connection-dot ${connected ? 'is-live' : ''}`} />
            <span>{connected ? '全局板块已接管' : '独立演示模式'}</span>
            <strong>{snapshot.simulationDate}</strong>
          </div>
        </header>
      )}

      <section className="map-stage">
        <HefeiMapBoard
          snapshot={snapshot}
          viewMode={viewMode}
          skipToken={skipToken}
          onTransitionStateChange={handleTransitionStateChange}
          onReady={() => setBoardReady(true)}
        />

        {transitionState.active && (
          <button className="map-transition-banner" onClick={() => setSkipToken((value) => value + 1)}>
            正在回放结算反馈 · 余 {transitionState.remaining} 个地块 <b>跳过动画</b>
          </button>
        )}

        <div className={`map-loading ${boardReady ? 'is-ready' : ''}`} role="status" aria-live="polite">
          <FrameCorners />
          <span className="map-loading-mark">HF</span>
          <strong>正在构建城市沙盘</strong>
          <small>INITIALIZING 3D MAP · INDUSTRIAL ASSETS · CAMERA</small>
          <i />
        </div>

        <div className="map-orbit-hint" aria-hidden="true">
          <FrameCorners inset />
          <span>↻</span>
          <div><strong>城市沙盘</strong><small>拖拽环绕 · 滚轮缩放 · 右键平移</small></div>
        </div>

        <nav className="map-view-switcher map-framed-window" aria-label="地图镜头">
          <FrameCorners />
          {([
            ['overview', '全桌', '横向沙盘'],
            ['district', '区域', '产业片区'],
            ['project', '园区', '制造底盘'],
          ] as Array<[MapViewMode, string, string]>).map(([id, label, hint]) => (
            <button key={id} className={viewMode === id ? 'is-active' : ''} onClick={() => setViewMode(id)}>
              <span>{label}</span><small>{hint}</small>
            </button>
          ))}
        </nav>

        <div className="map-legend" aria-label="地图指标">
          <article className="map-framed-card"><FrameCorners inset /><span>就业活跃</span><strong>{snapshot.city.employmentIndex}</strong></article>
          <article className="map-framed-card"><FrameCorners inset /><span>物流流量</span><strong>{snapshot.city.logisticsIndex}</strong></article>
          <article className={`map-framed-card ${snapshot.city.gridPressure >= 65 ? 'is-alert' : ''}`}>
            <FrameCorners inset alert={snapshot.city.gridPressure >= 65} /><span>能源压力</span><strong>{snapshot.city.gridPressure}</strong>
          </article>
          <article className={`map-framed-card ${snapshot.city.fiscalPressure >= 70 ? 'is-alert' : ''}`}>
            <FrameCorners inset alert={snapshot.city.fiscalPressure >= 70} /><span>财政压力</span><strong>{snapshot.city.fiscalPressure}</strong>
          </article>
        </div>

        <aside className="project-card city-status-card map-framed-window" aria-live="polite">
          <FrameCorners />
          <span className="project-kicker">ANONYMOUS PROJECT PARCELS · REV {snapshot.revision}</span>
          <h2>项目建设现场</h2>
          <div className="project-progress"><span style={{ width: `${industrialSummary.averageProgress}%` }} /></div>
          <dl>
            <div><dt>综合建设进度</dt><dd>{industrialSummary.averageProgress}%</dd></div>
            <div><dt>建设 / 爬坡</dt><dd>{industrialSummary.building}</dd></div>
            <div><dt>已投产</dt><dd>{industrialSummary.operating}</dd></div>
            <div><dt>风险片区</dt><dd>{industrialSummary.warning}</dd></div>
          </dl>
          <p>匿名地块保留决策因果和物理建设状态；企业身份仍留在全局推演与会谈板块。</p>
        </aside>

        {!connected && !embedded && (
          <nav className="stage-controls map-framed-window" aria-label="独立地图阶段预设">
            <FrameCorners />
            <span>产业情景预设</span>
            {stages.map((stage) => (
              <button
                key={stage.id}
                className={snapshot.projects[0]?.stage === stage.id ? 'is-active' : ''}
                onClick={() => setSnapshot((current) => createDemoSnapshot(stage.id, current.revision + 1, current))}
              >
                {stage.label}
              </button>
            ))}
            <button
              className={snapshot.projects.length === 9 ? 'is-active' : ''}
              onClick={() => setSnapshot((current) => createCapacityDemoSnapshot(current.revision + 1))}
            >
              九地块
            </button>
          </nav>
        )}
      </section>
    </main>
  )
}
