import { Html, OrbitControls, RoundedBox } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import type { MapSnapshot } from '../../../packages/contracts/src'
import { MapProjectLayer } from '../../../packages/map-visuals/src/MapProjectLayer'

export type MapViewMode = 'overview' | 'district' | 'project'

type BoardProps = {
  snapshot: MapSnapshot
  viewMode: MapViewMode
  onReady?: () => void
  skipToken?: number
  onTransitionStateChange?: (active: boolean, remaining: number) => void
}

const MAP_X = 1.86
const MAP_Z = 0.72

function mapPoint(x: number, z: number): [number, number] {
  return [x * MAP_X, z * MAP_Z]
}

const districtAnchors = [
  { id: 'xinzhan', name: '新站高新区', source: [0.75, -1.8] as const },
  { id: 'jingkai', name: '经开区', source: [-0.72, 1.15] as const },
  { id: 'gaoxin', name: '高新区', source: [-1.72, -0.55] as const },
  { id: 'binhu', name: '滨湖新区', source: [1.25, 1.82] as const },
]

function createHefeiShape() {
  const points = [
    [-0.25, -4.48], [-1.02, -4.22], [-1.55, -3.38], [-1.92, -2.55], [-1.52, -1.72],
    [-2.42, -1.34], [-3.14, -0.48], [-2.93, 0.42], [-2.22, 1.05], [-1.48, 1.36],
    [-1.74, 2.12], [-1.92, 3.08], [-1.45, 4.18], [-0.58, 4.52], [0.18, 4.06],
    [0.88, 3.46], [1.75, 3.54], [2.72, 3.02], [3.08, 2.12], [2.77, 1.18],
    [3.28, 0.28], [3.02, -0.72], [2.34, -1.56], [1.52, -1.35], [1.02, -2.12],
    [0.82, -3.12], [0.34, -4.12],
  ].map(([x, z]) => mapPoint(x, z))

  const shape = new THREE.Shape()
  shape.moveTo(points[0][0], points[0][1])
  points.slice(1).forEach(([x, z]) => shape.lineTo(x, z))
  shape.closePath()
  return shape
}

function HefeiLand() {
  const shape = useMemo(createHefeiShape, [])

  return (
    <group>
      <mesh position={[0, 0.38, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <extrudeGeometry args={[shape, { depth: 0.16, bevelEnabled: true, bevelSegments: 2, bevelSize: 0.07, bevelThickness: 0.04 }]} />
        <meshStandardMaterial color="#667360" roughness={0.93} />
      </mesh>
      <mesh position={[3.63, 0.56, 0.64]} rotation={[-Math.PI / 2, 0, -0.14]} scale={[1.72, 0.52, 1]}>
        <circleGeometry args={[1, 48]} />
        <meshStandardMaterial color="#456e73" emissive="#173a40" emissiveIntensity={0.35} />
      </mesh>
      <Html position={[3.65, 0.67, 0.64]} center zIndexRange={[2, 0]}>
        <span className="geo-label lake-label">巢湖</span>
      </Html>
    </group>
  )
}

function RiverAndRoads() {
  const river = useMemo(() => {
    const source = [[-3.35, -0.25], [-2.45, 0.02], [-1, 0.55], [0.35, 0.72], [1.45, 1.18], [2.25, 1.52]]
    const curve = new THREE.CatmullRomCurve3(source.map(([x, z]) => {
      const [worldX, worldZ] = mapPoint(x, z)
      return new THREE.Vector3(worldX, 0.58, worldZ)
    }))
    return new THREE.TubeGeometry(curve, 72, 0.085, 8, false)
  }, [])

  const ringRoad = useMemo(() => {
    const source = [[-2.75, -1.3], [-0.7, -1.85], [1.85, -1.3], [2.55, 0.25], [1.35, 1.35], [-1.25, 1.55], [-2.85, 0.55]]
    const curve = new THREE.CatmullRomCurve3(source.map(([x, z]) => {
      const [worldX, worldZ] = mapPoint(x, z)
      return new THREE.Vector3(worldX, 0.575, worldZ)
    }), true)
    return new THREE.TubeGeometry(curve, 84, 0.032, 6, true)
  }, [])

  return (
    <group>
      <mesh geometry={river}><meshStandardMaterial color="#70aeb2" emissive="#245c63" emissiveIntensity={0.5} /></mesh>
      <mesh geometry={ringRoad}><meshStandardMaterial color="#c4b995" emissive="#766f55" emissiveIntensity={0.25} /></mesh>
      <Html position={[-0.84, 0.67, 0.42]} center zIndexRange={[2, 0]}><span className="geo-label">南淝河</span></Html>
    </group>
  )
}

function DistrictMarkers() {
  return (
    <group>
      {districtAnchors.map((district) => {
        const [x, z] = mapPoint(district.source[0], district.source[1])
        return (
          <group key={district.id} position={[x, 0.62, z]}>
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.2, 0.25, 24]} />
              <meshBasicMaterial color="#c7b27b" transparent opacity={0.55} />
            </mesh>
            <Html position={[0, 0.08, 0]} center zIndexRange={[2, 0]}><span className="geo-label district-label">{district.name}</span></Html>
          </group>
        )
      })}
    </group>
  )
}

function TreeClusters() {
  const trees = useMemo(() => Array.from({ length: 58 }, (_, index) => {
    const angle = index * 2.399
    const radius = index % 4 === 0 ? 0.72 : 1
    return {
      x: Math.sin(angle) * (4.5 + (index % 5) * 0.18) * radius,
      z: Math.cos(angle) * (2.25 + (index % 4) * 0.12) * radius,
      scale: 0.45 + (index % 5) * 0.05,
    }
  }).filter(({ x, z }) => !(x > -5.4 && x < -1.0 && z > -1.8 && z < 1.25)), [])

  return (
    <group>
      {trees.map((tree, index) => (
        <group key={index} position={[tree.x, 0.57, tree.z]} scale={tree.scale}>
          <mesh position={[0, 0.16, 0]}><cylinderGeometry args={[0.035, 0.05, 0.32, 6]} /><meshStandardMaterial color="#604931" /></mesh>
          <mesh position={[0, 0.48, 0]}><coneGeometry args={[0.22, 0.62, 7]} /><meshStandardMaterial color="#53705c" /></mesh>
        </group>
      ))}
    </group>
  )
}

function LogisticsFlow({ intensity }: { intensity: number }) {
  const group = useRef<THREE.Group>(null)
  const count = Math.max(2, Math.min(11, Math.round(intensity / 10)))

  useFrame((_, delta) => {
    if (!group.current) return
    const speed = 0.42 + intensity / 125
    for (const truck of group.current.children) {
      truck.position.x += delta * speed
      if (truck.position.x > 6.1) truck.position.x = -6.1
    }
  })

  return (
    <group ref={group} position={[0, 0.66, -2.24]}>
      {Array.from({ length: count }, (_, index) => (
        <mesh key={index} position={[-6 + (index / count) * 12, 0, 0]} castShadow>
          <boxGeometry args={[0.28, 0.11, 0.13]} />
          <meshStandardMaterial color={index % 2 === 0 ? '#c88748' : '#73a29c'} />
        </mesh>
      ))}
    </group>
  )
}

function CameraRig({ viewMode }: Pick<BoardProps, 'viewMode'>) {
  const { camera, size } = useThree()
  const controls = useRef<OrbitControlsImpl>(null)
  const transition = useRef(0)

  useEffect(() => { transition.current = 0 }, [viewMode, size.width, size.height])

  useFrame((_, delta) => {
    if (!controls.current || transition.current >= 1) return
    const focus = viewMode === 'overview'
      ? new THREE.Vector3(0, 0.22, 0)
      : viewMode === 'district'
        ? new THREE.Vector3(-0.8, 0.36, 0)
        : new THREE.Vector3(-3.15, 0.48, -0.25)
    const offset = viewMode === 'overview'
      ? new THREE.Vector3(11.8, 8.6, 9.4)
      : viewMode === 'district'
        ? new THREE.Vector3(8.6, 6.8, 7.2)
        : new THREE.Vector3(6.2, 5.1, 5.4)
    const baseZoom = viewMode === 'overview' ? 64 : viewMode === 'district' ? 78 : 94
    const fitWidth = size.width / (viewMode === 'overview' ? 14.5 : viewMode === 'district' ? 11.5 : 8.2)
    const fitHeight = size.height / (viewMode === 'overview' ? 8.2 : 7.2)
    const zoom = Math.max(30, Math.min(baseZoom, fitWidth, fitHeight))
    const ease = 1 - Math.exp(-delta * 5)

    controls.current.target.lerp(focus, ease)
    camera.position.lerp(focus.clone().add(offset), ease)
    camera.zoom = THREE.MathUtils.lerp(camera.zoom, zoom, ease)
    camera.updateProjectionMatrix()
    controls.current.update()
    transition.current = Math.min(1, transition.current + delta * 1.7)
  })

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      enablePan
      enableRotate
      enableZoom
      minPolarAngle={0.34}
      maxPolarAngle={Math.PI / 2.18}
      minZoom={28}
      maxZoom={130}
      rotateSpeed={0.62}
      panSpeed={0.58}
      zoomSpeed={0.72}
    />
  )
}

function BoardWorld({ snapshot, viewMode, skipToken, onTransitionStateChange }: BoardProps) {
  return (
    <>
      <color attach="background" args={['#101817']} />
      <fog attach="fog" args={['#101817', 15, 30]} />
      <ambientLight intensity={1.35} />
      <directionalLight position={[-5, 11, 8]} intensity={2.2} castShadow shadow-mapSize={[2048, 2048]} />
      <pointLight position={[-3, 4, -2]} intensity={12} color="#80c6bd" distance={11} />

      <group rotation={[0, -0.04, 0]}>
        <RoundedBox args={[13.8, 0.34, 7.5]} radius={0.18} smoothness={4} position={[0, 0, 0]} receiveShadow>
          <meshStandardMaterial color="#293a35" roughness={0.83} metalness={0.05} />
        </RoundedBox>
        <HefeiLand />
        <RiverAndRoads />
        <DistrictMarkers />
        <TreeClusters />
        <group position={[0, 0.59, 0]}>
          <MapProjectLayer
            snapshot={snapshot}
            bounds={{ width: 10.2, depth: 4.35 }}
            parcelScale={0.72}
            skipToken={skipToken}
            onTransitionStateChange={onTransitionStateChange}
          />
        </group>
        <LogisticsFlow intensity={snapshot.city.logisticsIndex} />

        {snapshot.city.gridPressure >= 65 && (
          <group position={[5.35, 0.78, -1.12]}>
            <mesh><sphereGeometry args={[0.13, 16, 12]} /><meshStandardMaterial color="#ef835f" emissive="#d8442c" emissiveIntensity={2.2} /></mesh>
            <Html position={[0, 0.38, 0]} center zIndexRange={[2, 0]}><span className="geo-label alert-label">电网负荷预警</span></Html>
          </group>
        )}
      </group>
      <CameraRig viewMode={viewMode} />
    </>
  )
}

export function HefeiMapBoard({ onReady, ...props }: BoardProps) {
  return (
    <Canvas
      orthographic
      shadows="basic"
      dpr={[1, 1.5]}
      camera={{ position: [11.8, 8.6, 9.4], zoom: 52, near: 0.1, far: 70 }}
      gl={{ antialias: true, alpha: false }}
      onCreated={onReady}
    >
      <BoardWorld {...props} />
    </Canvas>
  )
}
