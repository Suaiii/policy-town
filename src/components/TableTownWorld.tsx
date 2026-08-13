import { Html, Line, RoundedBox } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { MapSnapshot } from '../../packages/contracts/src'
import { MapProjectLayer } from '../../packages/map-visuals/src/MapProjectLayer'
import { TableFactoryTown } from './TableFactoryTown'

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
    const source = [[-3.05, -0.2], [-2.35, -0.05], [-1.65, 0.18], [-0.9, 0.1], [-0.2, 0.48], [0.55, 0.35], [1.15, 0.62], [1.55, 0.8], [1.95, 0.9]]
    const curve = new THREE.CatmullRomCurve3(source.map(([x, z]) => {
      const [worldX, worldZ] = mapPoint(x, z)
      return new THREE.Vector3(worldX, 0.584, worldZ)
    }))
    const ribbon = (width: number, yOffset: number) => {
      const segments = 72
      const positions: number[] = []
      const uvs: number[] = []
      const indices: number[] = []
      for (let index = 0; index <= segments; index += 1) {
        const t = index / segments
        const point = curve.getPointAt(t)
        const tangent = curve.getTangentAt(t).normalize()
        const side = new THREE.Vector3(-tangent.z, 0, tangent.x).multiplyScalar(width / 2)
        positions.push(point.x + side.x, point.y + yOffset, point.z + side.z)
        positions.push(point.x - side.x, point.y + yOffset, point.z - side.z)
        uvs.push(0, t, 1, t)
        if (index < segments) {
          const current = index * 2
          indices.push(current, current + 2, current + 1, current + 2, current + 3, current + 1)
        }
      }
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
      geometry.setIndex(indices)
      geometry.computeVertexNormals()
      return geometry
    }
    return { bank: ribbon(0.36, -0.008), water: ribbon(0.25, 0) }
  }, [])

  return (
    <group>
      <mesh geometry={river.bank} receiveShadow><meshStandardMaterial color="#42584f" roughness={0.96} /></mesh>
      <mesh geometry={river.water}><meshStandardMaterial color="#5f9393" emissive="#214b50" emissiveIntensity={0.28} roughness={0.36} metalness={0.08} /></mesh>
      <Html position={[-0.72, 0.66, 0.28]} center zIndexRange={[2, 0]}><span className="geo-label">南淝河</span></Html>
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

function LogisticsVehicle({ index }: { index: number }) {
  const colors = ['#c98946', '#79a59e', '#c7b98f', '#8c967b']
  const color = colors[index % colors.length]
  const longTruck = index % 3 !== 0
  return <group>
    {longTruck && <mesh position={[0, 0.07, -0.09]} castShadow><boxGeometry args={[0.15, 0.13, 0.28]} /><meshStandardMaterial color={color} roughness={0.62} /></mesh>}
    <mesh position={[0, 0.055, longTruck ? 0.12 : 0]} castShadow><boxGeometry args={[0.14, 0.11, longTruck ? 0.12 : 0.2]} /><meshStandardMaterial color={index % 2 ? '#d6d1bd' : '#d59b4f'} roughness={0.58} /></mesh>
    {[-0.075, 0.075].map((x) => [-0.11, 0.11].map((z) => <mesh key={`${x}-${z}`} position={[x, 0.01, z]} rotation={[0, 0, Math.PI / 2]}>
      <cylinderGeometry args={[0.025, 0.025, 0.018, 8]} /><meshStandardMaterial color="#252b28" roughness={0.86} />
    </mesh>))}
  </group>
}

function horizontalRoadLoop(y: number, xLimit: number, northZ: number, southZ: number) {
  const route = new THREE.CurvePath<THREE.Vector3>()
  const turnReach = xLimit + 0.48
  route.add(new THREE.LineCurve3(new THREE.Vector3(-xLimit, y, northZ), new THREE.Vector3(xLimit, y, northZ)))
  route.add(new THREE.CubicBezierCurve3(
    new THREE.Vector3(xLimit, y, northZ), new THREE.Vector3(turnReach, y, northZ),
    new THREE.Vector3(turnReach, y, southZ), new THREE.Vector3(xLimit, y, southZ),
  ))
  route.add(new THREE.LineCurve3(new THREE.Vector3(xLimit, y, southZ), new THREE.Vector3(-xLimit, y, southZ)))
  route.add(new THREE.CubicBezierCurve3(
    new THREE.Vector3(-xLimit, y, southZ), new THREE.Vector3(-turnReach, y, southZ),
    new THREE.Vector3(-turnReach, y, northZ), new THREE.Vector3(-xLimit, y, northZ),
  ))
  return route
}

const LOGISTICS_ROUTES = [
  horizontalRoadLoop(0.67, 4.26, -1.42, 1.34),
  horizontalRoadLoop(0.675, 3.98, -1.18, 1.08),
]

function LogisticsFlow({ intensity }: { intensity: number }) {
  const group = useRef<THREE.Group>(null)
  const count = intensity < 24 ? 0 : Math.min(12, Math.max(1, Math.round((intensity - 18) / 6)))
  const routes = LOGISTICS_ROUTES

  useFrame(({ clock }) => {
    if (!group.current) return
    const elapsed = clock.elapsedTime
    group.current.children.forEach((vehicle, index) => {
      const route = routes[index % routes.length]
      const speed = 0.014 + intensity / 8500 + (index % 3) * 0.0015
      const rawT = (elapsed * speed + index * 0.173) % 1
      const reverse = index % 2 === 1
      const t = reverse ? 1 - rawT : rawT
      const point = route.getPointAt(t)
      const tangent = route.getTangentAt(t).multiplyScalar(reverse ? -1 : 1)
      vehicle.position.copy(point)
      vehicle.rotation.y = Math.atan2(tangent.x, tangent.z)
    })
  })

  return (
    <group ref={group}>
      {Array.from({ length: count }, (_, index) => (
        <group key={index}><LogisticsVehicle index={index} /></group>
      ))}
    </group>
  )
}

function IndustrialAccessNetwork() {
  const corridors = LOGISTICS_ROUTES.map((route) => route.getPoints(100).map((point) => [point.x, 0.61, point.z] as [number, number, number]))
  return <group>
    {corridors.map((points, index) => <Line
      key={index}
      points={points}
      color={index === 1 ? '#b8aa78' : '#aaa68d'}
      lineWidth={3.2}
      transparent
      opacity={0.74}
    />)}
    <Line points={[[-3.9, 0.618, -1.3], [3.9, 0.618, -1.3]]} color="#697a76" lineWidth={0.9} dashed dashSize={0.16} gapSize={0.12} transparent opacity={0.85} />
    <Line points={[[-3.9, 0.618, 1.21], [3.9, 0.618, 1.21]]} color="#697a76" lineWidth={0.9} dashed dashSize={0.16} gapSize={0.12} transparent opacity={0.85} />
  </group>
}

export function TableTownWorld({
  snapshot,
  selectedId,
  onSelect,
  skipToken,
  onTransitionStateChange,
  projectScale = 0.72,
}: {
  snapshot: MapSnapshot
  selectedId?: string
  onSelect?: (projectId: string) => void
  skipToken?: number
  onTransitionStateChange?: (active: boolean, remaining: number) => void
  projectScale?: number
}) {
  return (
    <group rotation={[0, -0.04, 0]}>
      <RoundedBox args={[13.8, 0.34, 7.5]} radius={0.18} smoothness={4} position={[0, 0, 0]} receiveShadow>
        <meshStandardMaterial color="#293a35" roughness={0.83} metalness={0.05} />
      </RoundedBox>
      <HefeiLand />
      <RiverAndRoads />
      <IndustrialAccessNetwork />
      <DistrictMarkers />
      <TreeClusters />
      <group position={[0, 0.59, 0]}>
        <TableFactoryTown snapshot={snapshot} />
        <MapProjectLayer
          snapshot={snapshot}
          bounds={{ width: 10.2, depth: 4.35 }}
          parcelScale={projectScale}
          skipToken={skipToken}
          selectedId={selectedId}
          onSelect={onSelect}
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
  )
}
