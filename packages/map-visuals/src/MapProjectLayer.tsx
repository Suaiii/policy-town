import { Clone, RoundedBox, useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { Component, Suspense, useEffect, useMemo, useRef, useState, type ErrorInfo, type ReactNode } from 'react'
import * as THREE from 'three'
import type { MapSnapshot, PhysicalAssetVisualState, ProjectArchetype } from '../../contracts/src'
import { MAP_ASSET_CATALOG, validateAssetDependencies, type MapAssetDescriptor } from './assetCatalog'
import { PARCEL_LOCAL_ANCHORS } from './hefeiLayout'
import { deriveMapScene, type MapAssetScene, type MapParcelScene, type SceneBuilding, type SceneTransition } from './scene'

type WorldBounds = { width: number; depth: number }

export const PROJECT_VISUAL_PALETTES: Record<ProjectArchetype, { primary: string; secondary: string; accent: string }> = {
  'heavy-manufacturing': { primary: '#604d7e', secondary: '#c2b4d7', accent: '#b69ae3' },
  'energy-manufacturing': { primary: '#7d692f', secondary: '#cbb981', accent: '#e2b84f' },
  'rd-pilot': { primary: '#376783', secondary: '#a5bfce', accent: '#69bde4' },
}

class AssetErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[map-assets] GLB rendering failed; using colored fallback.', error, info.componentStack)
  }
  render() { return this.state.failed ? this.props.fallback : this.props.children }
}

function AssetFallback({ asset, position, level, inactive }: { asset: MapAssetDescriptor; position: [number, number, number]; level: number; inactive: boolean }) {
  const height = 0.46 + (level - 1) * 0.22
  return (
    <group position={position}>
      <RoundedBox args={[asset.footprint.width, height, asset.footprint.depth]} radius={0.035} smoothness={2} position={[0, height / 2, 0]} castShadow>
        <meshStandardMaterial color={inactive ? '#575c58' : asset.fallbackColor} roughness={0.84} />
      </RoundedBox>
      <mesh position={[0, height + 0.025, 0]}><boxGeometry args={[asset.footprint.width * 0.72, 0.05, asset.footprint.depth * 0.72]} /><meshStandardMaterial color="#c1b994" roughness={0.68} /></mesh>
      {Array.from({ length: level }, (_, index) => <mesh key={index} position={[-asset.footprint.width * 0.34 + index * 0.14, height + 0.07, 0]}>
        <boxGeometry args={[0.09, 0.08, 0.12]} /><meshStandardMaterial color="#4f6867" roughness={0.5} />
      </mesh>)}
    </group>
  )
}

function GltfAsset({ asset, position, level, inactive }: { asset: MapAssetDescriptor & { url: string }; position: [number, number, number]; level: number; inactive: boolean }) {
  const { scene } = useGLTF(asset.url)
  return <group position={position} scale={[0.55, 0.55 * (1 + (level - 1) * 0.16), 0.55]}>
    <Clone object={scene} castShadow receiveShadow />
    {inactive && <mesh position={[0, 0.5, 0]}><boxGeometry args={[1.6, 1.2, 1.1]} /><meshBasicMaterial color="#17201d" transparent opacity={0.28} depthWrite={false} /></mesh>}
  </group>
}

function ValidatedAsset({ building }: { building: SceneBuilding }) {
  const asset = MAP_ASSET_CATALOG[building.assetId]
  const [valid, setValid] = useState<boolean | null>(asset.url ? null : true)
  const anchor = PARCEL_LOCAL_ANCHORS[building.anchor]
  const position: [number, number, number] = [anchor[0], 0.06, anchor[1]]
  const inactive = building.status === 'abandoned'

  useEffect(() => {
    let active = true
    validateAssetDependencies(asset).then((result) => {
      if (!active) return
      setValid(result)
      if (!result) console.error(`[map-assets] Missing GLB or texture dependency for ${asset.id}.`)
    })
    return () => { active = false }
  }, [asset])

  if (!asset.url || building.assetId === 'rd-office-procedural') {
    const height = 0.48 + (building.level - 1) * 0.2
    return (
      <group position={position}>
        <RoundedBox args={[0.92, height, 0.62]} radius={0.055} smoothness={3} position={[0, height / 2, 0]} castShadow>
          <meshStandardMaterial color={inactive ? '#575d59' : '#6d817d'} roughness={0.62} />
        </RoundedBox>
        <mesh position={[0, height + 0.035, 0]}><boxGeometry args={[0.72, 0.07, 0.46]} /><meshStandardMaterial color="#b9b9a5" roughness={0.72} /></mesh>
        {[-0.28, 0, 0.28].map((x) => (
          <mesh key={x} position={[x, height * 0.56, 0.315]}><boxGeometry args={[0.15, 0.13, 0.02]} /><meshStandardMaterial color="#82aaa6" emissive="#294948" emissiveIntensity={0.42} /></mesh>
        ))}
        {Array.from({ length: building.level }, (_, index) => <mesh key={index} position={[-0.22 + index * 0.22, height + 0.1, -0.04]}>
          <boxGeometry args={[0.13, 0.1, 0.18]} /><meshStandardMaterial color="#3f5d5c" roughness={0.5} /></mesh>)}
      </group>
    )
  }

  const fallback = <AssetFallback asset={asset} position={position} level={building.level} inactive={inactive} />
  if (valid !== true) return fallback
  return (
    <AssetErrorBoundary fallback={fallback}>
      <Suspense fallback={fallback}><GltfAsset asset={asset as MapAssetDescriptor & { url: string }} position={position} level={building.level} inactive={inactive} /></Suspense>
    </AssetErrorBoundary>
  )
}

function SiteModel({ color }: { color: string }) {
  const posts = [-0.78, -0.26, 0.26, 0.78]
  return (
    <group>
      <mesh position={[0, 0.025, 0]} receiveShadow><boxGeometry args={[1.75, 0.05, 1.28]} /><meshStandardMaterial color="#5e6458" roughness={0.95} /></mesh>
      {posts.flatMap((x) => [-0.6, 0.6].map((z) => <mesh key={`${x}-${z}`} position={[x, 0.18, z]}><boxGeometry args={[0.025, 0.35, 0.025]} /><meshStandardMaterial color={color} /></mesh>))}
      <mesh position={[0, 0.18, -0.6]}><boxGeometry args={[1.58, 0.06, 0.025]} /><meshStandardMaterial color={color} /></mesh>
      <mesh position={[0, 0.18, 0.6]}><boxGeometry args={[1.58, 0.06, 0.025]} /><meshStandardMaterial color={color} /></mesh>
      <mesh position={[-0.78, 0.18, 0]}><boxGeometry args={[0.025, 0.06, 1.18]} /><meshStandardMaterial color={color} /></mesh>
      <mesh position={[0.78, 0.18, -0.22]}><boxGeometry args={[0.025, 0.06, 0.72]} /><meshStandardMaterial color={color} /></mesh>
    </group>
  )
}

function FrameModel({ builtProgress, color }: { builtProgress: number; color: string }) {
  const levels = builtProgress >= 48 ? 3 : builtProgress >= 32 ? 2 : 1
  return (
    <group>
      <SiteModel color="#b99b5d" />
      <mesh position={[-0.15, 0.08, -0.05]}><boxGeometry args={[1.22, 0.12, 0.78]} /><meshStandardMaterial color="#77766b" /></mesh>
      {[-0.68, -0.2, 0.28, 0.68].flatMap((x) => [-0.42, 0.34].map((z) => (
        <mesh key={`${x}-${z}`} position={[x, 0.48, z]}><boxGeometry args={[0.035, 0.82, 0.035]} /><meshStandardMaterial color={color} metalness={0.2} /></mesh>
      )))}
      {Array.from({ length: levels }, (_, index) => (
        <mesh key={index} position={[0, 0.23 + index * 0.25, -0.04]}><boxGeometry args={[1.42, 0.035, 0.82]} /><meshStandardMaterial color={color} metalness={0.15} /></mesh>
      ))}
      <group position={[0.7, 0, -0.4]}>
        <mesh position={[0, 0.62, 0]}><boxGeometry args={[0.035, 1.18, 0.035]} /><meshStandardMaterial color="#d2a14b" /></mesh>
        <mesh position={[-0.3, 1.18, 0]}><boxGeometry args={[0.62, 0.035, 0.035]} /><meshStandardMaterial color="#d2a14b" /></mesh>
      </group>
    </group>
  )
}

function ShellModel({ palette }: { palette: (typeof PROJECT_VISUAL_PALETTES)[ProjectArchetype] }) {
  return (
    <group>
      <SiteModel color="#9e936e" />
      <RoundedBox args={[1.42, 0.78, 0.82]} radius={0.035} smoothness={2} position={[-0.12, 0.45, -0.06]} castShadow>
        <meshStandardMaterial color={palette.primary} roughness={0.9} transparent opacity={0.78} />
      </RoundedBox>
      {[-0.65, -0.22, 0.22, 0.65].map((x) => (
        <mesh key={x} position={[x, 0.52, 0.39]}><boxGeometry args={[0.025, 0.92, 0.025]} /><meshStandardMaterial color="#c9a45f" /></mesh>
      ))}
      {[0.12, 0.42, 0.72].map((y) => (
        <mesh key={y} position={[0, y, 0.4]}><boxGeometry args={[1.5, 0.025, 0.025]} /><meshStandardMaterial color="#c9a45f" /></mesh>
      ))}
    </group>
  )
}

function PlannedAsset({ asset, color }: { asset: PhysicalAssetVisualState; color: string }) {
  const anchor = PARCEL_LOCAL_ANCHORS[asset.role]
  return (
    <group position={[anchor[0], 0.04, anchor[1]]}>
      <RoundedBox args={[0.78, 0.48 * asset.targetLevel, 0.58]} radius={0.04} smoothness={2} position={[0, 0.24 * asset.targetLevel, 0]}>
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.38} transparent opacity={0.16} depthWrite={false} />
      </RoundedBox>
      <RoundedBox args={[0.8, 0.5 * asset.targetLevel, 0.6]} radius={0.04} smoothness={2} position={[0, 0.25 * asset.targetLevel, 0]}>
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.72} transparent opacity={0.7} depthWrite={false} wireframe />
      </RoundedBox>
      <mesh rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.38, 0.44, 24]} /><meshBasicMaterial color={color} transparent opacity={0.65} /></mesh>
    </group>
  )
}

function AssetWork({ scene, palette }: { scene: MapAssetScene; palette: (typeof PROJECT_VISUAL_PALETTES)[ProjectArchetype] }) {
  const anchor = PARCEL_LOCAL_ANCHORS[scene.asset.role]
  if (scene.asset.status === 'planned' || (scene.asset.status === 'paused' && scene.asset.currentLevel === 0 && scene.asset.workProgress === 0)) {
    return <PlannedAsset asset={scene.asset} color={palette.accent} />
  }
  if (scene.asset.currentLevel > 0 && scene.asset.workProgress === 0) return null
  const y = scene.asset.currentLevel > 0 ? 0.42 * scene.asset.currentLevel : 0
  return (
    <group position={[anchor[0], y, anchor[1]]} scale={[0.52, 0.52, 0.52]}>
      {scene.constructionState === 'site' && <SiteModel color={palette.accent} />}
      {scene.constructionState === 'frame' && <FrameModel builtProgress={scene.asset.workProgress} color={palette.secondary} />}
      {scene.constructionState === 'shell' && <ShellModel palette={palette} />}
      {scene.asset.status === 'paused' && <mesh position={[0, 0.62, 0]}><octahedronGeometry args={[0.16]} /><meshStandardMaterial color="#eb7657" emissive="#c74734" emissiveIntensity={1.4} /></mesh>}
    </group>
  )
}

export function Person({ position, color = '#5f8584', helmet = false }: {
  position: [number, number, number]
  color?: string
  helmet?: boolean
}) {
  return (
    <group position={position} scale={1.08}>
      <mesh position={[0, 0.008, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.09, 12]} />
        <meshBasicMaterial color="#0b1513" transparent opacity={0.34} depthWrite={false} />
      </mesh>
      <mesh position={[-0.038, 0.07, 0]} rotation={[0, 0, -0.06]} castShadow>
        <capsuleGeometry args={[0.024, 0.09, 2, 5]} /><meshStandardMaterial color="#334a4a" roughness={0.88} />
      </mesh>
      <mesh position={[0.038, 0.07, 0]} rotation={[0, 0, 0.06]} castShadow>
        <capsuleGeometry args={[0.024, 0.09, 2, 5]} /><meshStandardMaterial color="#334a4a" roughness={0.88} />
      </mesh>
      <mesh position={[0, 0.195, 0]} castShadow>
        <capsuleGeometry args={[0.056, 0.105, 3, 7]} />
        <meshStandardMaterial color={color} roughness={0.72} emissive={color} emissiveIntensity={0.08} />
      </mesh>
      <mesh position={[-0.072, 0.19, 0]} rotation={[0, 0, -0.18]} castShadow>
        <capsuleGeometry args={[0.018, 0.105, 2, 5]} /><meshStandardMaterial color={color} roughness={0.8} />
      </mesh>
      <mesh position={[0.072, 0.19, 0]} rotation={[0, 0, 0.18]} castShadow>
        <capsuleGeometry args={[0.018, 0.105, 2, 5]} /><meshStandardMaterial color={color} roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.335, 0]} castShadow>
        <sphereGeometry args={[0.052, 9, 7]} /><meshStandardMaterial color="#d4a17a" roughness={0.75} />
      </mesh>
      {helmet && <>
        <mesh position={[0, 0.368, 0]} castShadow>
          <sphereGeometry args={[0.058, 9, 5, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color="#e0a84d" roughness={0.62} />
        </mesh>
        <mesh position={[0, 0.352, 0.045]}><boxGeometry args={[0.1, 0.012, 0.045]} /><meshStandardMaterial color="#e0a84d" /></mesh>
      </>}
    </group>
  )
}

function AnimatedFlow({ transition, path }: { transition: SceneTransition; path: Array<[number, number]> }) {
  const group = useRef<THREE.Group>(null)
  const started = useRef(performance.now())
  useEffect(() => { started.current = performance.now() }, [transition])
  useFrame(() => {
    if (!group.current || transition.eventActors === 0) return
    const elapsed = (performance.now() - started.current) / 1000
    group.current.children.forEach((actor, index) => {
      const raw = ((elapsed * 0.36) + index / transition.eventActors) % 1
      const t = transition.direction === 'depart' ? 1 - raw : raw
      const segment = t < 0.55 ? 0 : 1
      const localT = segment === 0 ? t / 0.55 : (t - 0.55) / 0.45
      const from = path[segment]
      const to = path[segment + 1]
      actor.position.x = THREE.MathUtils.lerp(from[0], to[0], localT)
      actor.position.z = THREE.MathUtils.lerp(from[1], to[1], localT)
      actor.position.y = 0.04 + Math.abs(Math.sin(elapsed * 7 + index)) * 0.018
      actor.rotation.y = Math.atan2(to[0] - from[0], to[1] - from[1])
    })
  })
  return (
    <group ref={group}>
      {Array.from({ length: transition.eventActors }, (_, index) => (
        <Person key={index} position={[0, 0.04, 0]} color={index % 2 ? '#547d80' : '#b86f47'} helmet={transition.builtDelta > 0} />
      ))}
    </group>
  )
}

function ParcelHighlight({ active, color }: { active: boolean; color: string }) {
  const material = useRef<THREE.MeshBasicMaterial>(null)
  useFrame(({ clock }) => {
    if (material.current && active) material.current.opacity = 0.35 + Math.sin(clock.elapsedTime * 7) * 0.18
  })
  if (!active) return null
  return (
    <mesh position={[0, 0.035, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.94, 1.08, 40]} />
      <meshBasicMaterial ref={material} color={color} transparent opacity={0.45} side={THREE.DoubleSide} />
    </mesh>
  )
}

function CampusParcel({ parcel }: { parcel: MapParcelScene }) {
  const palette = PROJECT_VISUAL_PALETTES[parcel.project.archetype]
  const anchors = ['main', 'support', 'warehouse', 'utility'] as const
  return <group>
    <RoundedBox args={[1.9, 0.055, 1.48]} radius={0.08} smoothness={3} position={[0, 0.025, 0]} receiveShadow>
      <meshStandardMaterial color="#394a43" roughness={0.94} />
    </RoundedBox>
    <mesh position={[0, 0.058, 0.55]} receiveShadow><boxGeometry args={[0.16, 0.018, 0.48]} /><meshStandardMaterial color="#9b947c" roughness={0.9} /></mesh>
    <mesh position={[0, 0.059, 0.22]} receiveShadow><boxGeometry args={[1.46, 0.018, 0.13]} /><meshStandardMaterial color="#9b947c" roughness={0.9} /></mesh>
    {anchors.map((role) => {
      const anchor = PARCEL_LOCAL_ANCHORS[role]
      return <mesh key={role} position={[anchor[0], 0.062, anchor[1]]} receiveShadow>
        <boxGeometry args={[role === 'main' ? 0.86 : 0.62, 0.02, role === 'main' ? 0.6 : 0.46]} />
        <meshStandardMaterial color="#667269" roughness={0.86} />
      </mesh>
    })}
    <mesh position={[0, 0.072, 0.76]}><boxGeometry args={[0.48, 0.035, 0.06]} /><meshStandardMaterial color={palette.accent} emissive={palette.accent} emissiveIntensity={0.18} /></mesh>
    <Suspense fallback={null}><CampusUtilityProps archetype={parcel.project.archetype} /></Suspense>
  </group>
}

function CampusUtilityProps({ archetype }: { archetype: ProjectArchetype }) {
  const tank = useGLTF('/models/kenney-industrial/detail-tank.glb')
  const chimney = useGLTF(archetype === 'heavy-manufacturing'
    ? '/models/kenney-industrial/chimney-medium.glb'
    : '/models/kenney-industrial/chimney-small.glb')
  if (archetype === 'rd-pilot') {
    return <group position={[0.7, 0.08, 0.55]}>
      {[-0.12, 0.12].map((x) => <mesh key={x} position={[x, 0.05, 0]} rotation={[-0.16, 0, 0]}>
        <boxGeometry args={[0.18, 0.025, 0.24]} /><meshStandardMaterial color="#638a8c" emissive="#24474b" emissiveIntensity={0.24} /></mesh>)}
    </group>
  }
  return <group>
    <group position={[0.72, 0.07, 0.55]} scale={0.28}><Clone object={tank.scene} castShadow receiveShadow /></group>
    <group position={[0.74, 0.07, 0.28]} scale={0.25}><Clone object={chimney.scene} castShadow receiveShadow /></group>
  </group>
}

export function MapProjectParcel({
  parcel,
  transition,
  selected,
  onSelect,
}: {
  parcel: MapParcelScene
  transition?: SceneTransition
  selected?: boolean
  onSelect?: (projectId: string) => void
}) {
  const palette = PROJECT_VISUAL_PALETTES[parcel.project.archetype]
  return (
    <group
      rotation={[0, parcel.slot.rotation, 0]}
      onClick={onSelect ? (event) => {
        event.stopPropagation()
        onSelect(parcel.id)
      } : undefined}
    >
      <group>
        {parcel.assetScenes.length > 0 && <CampusParcel parcel={parcel} />}
        {parcel.assetScenes.map((assetScene) => <AssetWork key={`work-${assetScene.asset.id}`} scene={assetScene} palette={palette} />)}
        {parcel.buildings.map((building) => <ValidatedAsset key={`${building.assetId}-${building.anchor}`} building={building} />)}
      </group>
      {parcel.project.lifecycle !== 'active' && (
        <mesh position={[0, 0.62, 0]} renderOrder={2}>
          <boxGeometry args={[1.82, 1.22, 1.32]} />
          <meshBasicMaterial color="#18201d" transparent opacity={parcel.project.lifecycle === 'exited' ? 0.2 : 0.1} depthWrite={false} />
        </mesh>
      )}
      <ParcelHighlight active={Boolean(transition) || Boolean(selected)} color={parcel.project.lifecycle === 'active' ? palette.accent : '#e97855'} />
      {parcel.project.lifecycle !== 'active' && (
        <mesh position={[PARCEL_LOCAL_ANCHORS.alert[0], 0.18, PARCEL_LOCAL_ANCHORS.alert[1]]}>
          <octahedronGeometry args={[0.1]} /><meshStandardMaterial color="#eb7657" emissive="#c74734" emissiveIntensity={1.6} />
        </mesh>
      )}
      {Array.from({ length: parcel.residentActors }, (_, index) => {
        const row = Math.floor(index / 4)
        return (
          <Person
            key={index}
            position={[-0.38 + (index % 4) * 0.25, 0.04, 0.72 + row * 0.22]}
            color={index % 3 === 0 ? '#a96c48' : index % 2 === 0 ? '#6d718d' : '#4f7d7b'}
            helmet={parcel.constructionState !== 'complete'}
          />
        )
      })}
      {transition && transition.direction !== 'none' && <AnimatedFlow transition={transition} path={parcel.commutePath} />}
      {transition && Math.abs(transition.logisticsDelta) > 0 && (
        <mesh position={[-0.82, 0.12, 0.92]}><boxGeometry args={[0.28, 0.13, 0.16]} /><meshStandardMaterial color={transition.logisticsDelta > 0 ? '#d0924e' : '#81685c'} /></mesh>
      )}
    </group>
  )
}

export function MapProjectLayer({
  snapshot,
  bounds,
  parcelScale = 1,
  skipToken = 0,
  selectedId,
  onSelect,
  onTransitionStateChange,
}: {
  snapshot: MapSnapshot
  bounds: WorldBounds
  parcelScale?: number
  skipToken?: number
  selectedId?: string
  onSelect?: (projectId: string) => void
  onTransitionStateChange?: (active: boolean, remaining: number) => void
}) {
  const previousSnapshot = useRef(snapshot)
  const [queue, setQueue] = useState<SceneTransition[]>([])
  const scene = useMemo(() => deriveMapScene(snapshot), [snapshot])

  useEffect(() => {
    const transitions = deriveMapScene(snapshot, previousSnapshot.current).transitionQueue
    previousSnapshot.current = snapshot
    if (transitions.length) setQueue(transitions)
  }, [snapshot])

  useEffect(() => {
    onTransitionStateChange?.(queue.length > 0, queue.length)
    if (!queue.length) return
    const timer = window.setTimeout(() => setQueue((current) => current.slice(1)), queue[0].durationMs)
    return () => window.clearTimeout(timer)
  }, [queue, onTransitionStateChange])

  useEffect(() => {
    if (skipToken > 0) setQueue([])
  }, [skipToken])

  const activeTransition = queue[0]
  return (
    <group>
      {scene.parcels.map((parcel) => (
        <group
          key={parcel.id}
          position={[(parcel.slot.position.x - 0.5) * bounds.width, 0, (parcel.slot.position.y - 0.5) * bounds.depth]}
          scale={parcelScale}
        >
          <MapProjectParcel
            parcel={parcel}
            selected={selectedId === parcel.id}
            onSelect={onSelect}
            transition={activeTransition?.projectId === parcel.id ? activeTransition : undefined}
          />
        </group>
      ))}
    </group>
  )
}
