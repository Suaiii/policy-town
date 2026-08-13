import type { CSSProperties } from 'react'
import type { MapProjectVisualState, MapSnapshot } from '../../../packages/contracts/src'
import type { MapViewMode } from './HefeiMapBoard'

type ArtworkAnchor = { x: number; y: number }

const districtAnchors: Record<string, ArtworkAnchor> = {
  xinzhan: { x: 63, y: 29 },
  jingkai: { x: 35, y: 50 },
  gaoxin: { x: 31, y: 38 },
  binhu: { x: 57, y: 66 },
}

const industrySprites: Record<string, string> = {
  新型显示: '/sprites/display-factory.svg',
  新能源: '/sprites/auto-plant.svg',
  新能源汽车: '/sprites/auto-plant.svg',
  集成电路装备: '/sprites/quantum-center.svg',
  量子信息: '/sprites/quantum-center.svg',
}

const districtLabels: Record<string, string> = {
  xinzhan: '新站高新区',
  jingkai: '经开区',
  gaoxin: '高新区',
  binhu: '滨湖新区',
}

function getAnchor(project: MapProjectVisualState): ArtworkAnchor {
  return districtAnchors[project.districtId] ?? {
    x: 20 + project.position.x * 60,
    y: 16 + project.position.y * 68,
  }
}

export function MapArtworkLayer({
  snapshot,
  selectedId,
  viewMode,
  onSelect,
}: {
  snapshot: MapSnapshot
  selectedId?: string
  viewMode: MapViewMode
  onSelect: (id: string) => void
}) {
  const selected = snapshot.projects.find((project) => project.id === selectedId) ?? snapshot.projects[0]
  const focus = selected ? getAnchor(selected) : { x: 50, y: 48 }
  const style = {
    '--focus-x': `${focus.x}%`,
    '--focus-y': `${focus.y}%`,
  } as CSSProperties

  return (
    <div className={`map-artwork-camera is-${viewMode}`} style={style} aria-label="合肥 2.5D 产业地图">
      <div className="map-artboard">
        <img className="map-base-art" src="/art/hefei-isometric-map-v1.png" alt="合肥产业地图底图" draggable={false} />

        <span className="art-geo-label chaohu-label">巢湖</span>
        <span className="art-geo-label core-label">主城产业环</span>

        {snapshot.projects.map((project) => {
          const anchor = getAnchor(project)
          const active = project.id === selected?.id
          const warning = project.risk >= 70 || project.stage === 'stalled'
          const sprite = industrySprites[project.industry] ?? '/sprites/display-factory.svg'

          return (
            <button
              key={project.id}
              className={`art-project-node ${active ? 'is-active' : ''} ${warning ? 'is-warning' : ''}`}
              style={{ left: `${anchor.x}%`, top: `${anchor.y}%` }}
              onClick={() => onSelect(project.id)}
              aria-pressed={active}
            >
              <span className="project-sprite"><img src={sprite} alt="" draggable={false} /></span>
              <span className="project-node-copy">
                <small>{districtLabels[project.districtId] ?? project.districtId}</small>
                <strong>{project.name}</strong>
                <i><b style={{ width: `${project.progress}%` }} /></i>
              </span>
              <em>{project.progress}%</em>
            </button>
          )
        })}
      </div>
    </div>
  )
}
