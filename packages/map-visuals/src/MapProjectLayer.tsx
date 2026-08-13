import { Clone, RoundedBox, useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { Component, Suspense, useEffect, useMemo, useRef, useState, type ErrorInfo, type ReactNode } from 'react'
import * as THREE from 'three'
import type { MapSnapshot, ProjectArchetype } from '../../contracts/src'
import { MAP_ASSET_CATALOG, validateAssetDependencies, type MapAssetDescriptor } from './assetCatalog'
import { PARCEL_LOCAL_ANCHORS } from './hefeiLayout'
import { deriveMapScene, type MapParcelScene, type SceneBuilding, type SceneTransition } from './scene'

type WorldBounds = { width: number; depth: number }

export const PROJECT_VISUAL_PALETTES: Record<ProjectArchetype, { primary: string; secondary: string; accent: string }> = {
  'heavy-manufacturing': { primary: '#718b87', secondary: '#a9b4aa', accent: '#74c6bc' },
  'energy-manufacturing': { primary: '#958a5f', secondary: '#c7bb94', accent: '#e2b958' },
  'rd-pilot': { primary: '#767393', secondary: '#b3aec4', accent: '#aaa0dc' },
}

class AssetErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[map-assets] GLB rendering failed; using colored fallback.', error, info.componentStack)
  }
  render() { return this.state.failed ? this.props.fallback : this.props.children }
}

function AssetFallback({ asset, position }: { asset: MapAssetDescriptor; position: [number, number, number] }) {
  return (
    <group position={position}>
      <RoundedBox args={[asset.footprint.width, 0.48, asset.footprint.depth]} radius={0.04} smoothness={2} position={[0, 0.25, 0]} castShadow>
        <meshStandardMaterial color={asset.fallbackColor} roughness={0.84} />
      </RoundedBox>
      <mesh position={[0, 0.53, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.09, 0.13, 4]} />
        <meshBasicMaterial color="#e4a968" />
      </mesh>
    </group>
  )
}

function GltfAsset({ asset, position }: { asset: MapAssetDescriptor & { url: string }; position: [number, number, number] }) {
  const { scene } = useGLTF(asset.url)
  return <group position={position} scale={0.55}><Clone object={scene} castShadow receiveShadow /></group>
}

function ValidatedAsset({ building }: { building: SceneBuilding }) {
  const asset = MAP_ASSET_CATALOG[building.assetId]
  const [valid, setValid] = useState<boolean | null>(asset.url ? null : true)
  const anchor = PARCEL_LOCAL_ANCHORS[building.anchor]
  const position: [number, number, number] = [anchor[0], 0.06, anchor[1]]

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
    return (
      <group position={position}>
        <RoundedBox args={[0.9, 0.68, 0.62]} radius={0.06} smoothness={3} position={[0, 0.38, 0]} castShadow>
          <meshStandardMaterial color="#74728f" roughness={0.62} />
        </RoundedBox>
        {[-0.28, 0, 0.28].map((x) => (
          <mesh key={x} position={[x, 0.43, 0.315]}><boxGeometry args={[0.14, 0.2, 0.02]} /><meshStandardMaterial color="#8fc2c0" emissive="#31575a" emissiveIntensity={0.55} /></mesh>
        ))}
      </group>
    )
  }

  const fallback = <AssetFallback asset={asset} position={position} />
  if (valid !== true) return fallback
  return (
    <AssetErrorBoundary fallback={fallback}>
      <Suspense fallback={fallback}><GltfAsset asset={asset as MapAssetDescriptor & { url: string }} position={position} /></Suspense>
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

function Person({ position, color = '#5f8584', helmet = false }: {
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

export function MapProjectParcel({
  parcel,
  transition,
  onSelect,
}: {
  parcel: MapParcelScene
  transition?: SceneTransition
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
        {parcel.constructionState === 'site' && <SiteModel color={palette.accent} />}
        {parcel.constructionState === 'frame' && <FrameModel builtProgress={parcel.project.builtProgress} color={palette.secondary} />}
        {parcel.constructionState === 'shell' && <ShellModel palette={palette} />}
        {parcel.constructionState === 'complete' && parcel.buildings.map((building) => <ValidatedAsset key={`${building.assetId}-${building.anchor}`} building={building} />)}
      </group>
      {parcel.project.lifecycle !== 'active' && (
        <mesh position={[0, 0.62, 0]} renderOrder={2}>
          <boxGeometry args={[1.82, 1.22, 1.32]} />
          <meshBasicMaterial color="#18201d" transparent opacity={parcel.project.lifecycle === 'exited' ? 0.2 : 0.1} depthWrite={false} />
        </mesh>
      )}
      <ParcelHighlight active={Boolean(transition)} color={parcel.project.lifecycle === 'active' ? palette.accent : '#e97855'} />
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
  onTransitionStateChange,
}: {
  snapshot: MapSnapshot
  bounds: WorldBounds
  parcelScale?: number
  skipToken?: number
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
          <MapProjectParcel parcel={parcel} transition={activeTransition?.projectId === parcel.id ? activeTransition : undefined} />
        </group>
      ))}
    </group>
  )
}
