import { Clone, Html, RoundedBox, useGLTF } from '@react-three/drei'
import { Suspense, useMemo } from 'react'
import * as THREE from 'three'
import type { MapSnapshot } from '../../packages/contracts/src'
import { Person } from '../../packages/map-visuals/src/MapProjectLayer'

const TOWN_MODELS = {
  polyFactory: '/Factory_by_Poly_by_Google_-_3mmIBtmmkkW.glb',
  robertFactory: '/Factory_by_Robert_Schlyter_-_5nv98CqGjqR.glb',
  office: '/Large_Building_by_Kenney_-_ppwtREejXg.glb',
  civic: '/Big_Building_by_Quaternius_-_AVCS8jUd2l.glb',
  house: '/House_by_Quaternius_-_oJJIRwv6Bo.glb',
  townHouse: '/Town_House_by_Quaternius_-_imVkxz7oZD.glb',
  processTower: '/Structure_by_Quaternius_-_ilWoURnbZW.glb',
  windmill: '/Windmill_by_Quaternius_-_WUbU1Nct2W.glb',
  solarPanel: '/Solar_Panel_by_Quaternius_-_ah89Y79JdT.glb',
} as const

export type TownProsperityLevel = 0 | 1 | 2 | 3 | 4 | 5

export function deriveTownProsperity(snapshot: MapSnapshot): TownProsperityLevel {
  const assets = snapshot.projects.flatMap((project) => project.physicalAssets.assets)
  if (!assets.length) return 0

  const maximumPhysicalUnits = Math.max(1, snapshot.projects.length * 4 * 3)
  const actualPhysicalUnits = assets.reduce((sum, asset) => sum + asset.currentLevel + asset.workProgress / 100, 0)
  const physicalRatio = Math.min(1, actualPhysicalUnits / maximumPhysicalUnits)
  const builtRatio = snapshot.projects.reduce((sum, project) => sum + project.builtProgress, 0) / Math.max(1, snapshot.projects.length * 100)
  const cityRatio = Math.min(1, (snapshot.city.employmentIndex + snapshot.city.logisticsIndex) / 200)
  const revisionRatio = Math.min(1, snapshot.revision / 4)
  const score = physicalRatio * 0.5 + builtRatio * 0.2 + cityRatio * 0.15 + revisionRatio * 0.15

  if (score >= 0.8) return 5
  if (score >= 0.6) return 4
  if (score >= 0.4) return 3
  if (score >= 0.2) return 2
  return 1
}

type TownModelProps = {
  url: string
  position: [number, number, number]
  rotation?: number
  targetWidth: number
  maxHeight?: number
}

function NormalizedTownModel({ url, position, rotation = 0, targetWidth, maxHeight = Number.POSITIVE_INFINITY }: TownModelProps) {
  const { scene } = useGLTF(url)
  const transform = useMemo(() => {
    const bounds = new THREE.Box3().setFromObject(scene)
    const size = bounds.getSize(new THREE.Vector3())
    const center = bounds.getCenter(new THREE.Vector3())
    const horizontalSpan = Math.max(size.x, size.z, 0.001)
    const modelScale = Math.min(targetWidth / horizontalSpan, maxHeight / Math.max(size.y, 0.001))
    return {
      modelScale,
      offset: [-center.x, -bounds.min.y, -center.z] as [number, number, number],
    }
  }, [maxHeight, scene, targetWidth])

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <group scale={transform.modelScale}>
        <group position={transform.offset}>
          <Clone object={scene} castShadow receiveShadow />
        </group>
      </group>
    </group>
  )
}

function AsphaltPad({ position, size, rotation = 0 }: {
  position: [number, number]
  size: [number, number]
  rotation?: number
}) {
  return (
    <RoundedBox args={[size[0], 0.035, size[1]]} radius={0.07} smoothness={3} position={[position[0], 0.018, position[1]]} rotation={[0, rotation, 0]} receiveShadow>
      <meshStandardMaterial color="#4c5651" roughness={0.96} />
    </RoundedBox>
  )
}

function CargoStack({ position, color, rotation = 0 }: {
  position: [number, number]
  color: string
  rotation?: number
}) {
  return (
    <group position={[position[0], 0.04, position[1]]} rotation={[0, rotation, 0]}>
      {[0, 1].map((row) => [0, 1, 2].map((column) => (
        <mesh key={`${row}-${column}`} position={[(column - 1) * 0.19, 0.075 + row * 0.13, row * 0.03]} castShadow>
          <boxGeometry args={[0.17, 0.12, 0.16]} />
          <meshStandardMaterial color={row === 0 ? color : '#a69262'} roughness={0.78} />
        </mesh>
      )))}
    </group>
  )
}

function StreetTree({ position, scale = 1, color = '#4f7059' }: {
  position: [number, number]
  scale?: number
  color?: string
}) {
  return (
    <group position={[position[0], 0.02, position[1]]} scale={scale}>
      <mesh position={[0, 0.1, 0]} castShadow><cylinderGeometry args={[0.018, 0.025, 0.2, 6]} /><meshStandardMaterial color="#6b5138" /></mesh>
      <mesh position={[0, 0.28, 0]} castShadow><dodecahedronGeometry args={[0.15, 0]} /><meshStandardMaterial color={color} roughness={0.94} /></mesh>
    </group>
  )
}

function FenceLine({ start, length, rotation = 0 }: {
  start: [number, number]
  length: number
  rotation?: number
}) {
  const postCount = Math.max(2, Math.round(length / 0.24))
  return (
    <group position={[start[0], 0.03, start[1]]} rotation={[0, rotation, 0]}>
      {Array.from({ length: postCount }, (_, index) => {
        const x = -length / 2 + (index / (postCount - 1)) * length
        return <mesh key={index} position={[x, 0.12, 0]}><boxGeometry args={[0.018, 0.24, 0.018]} /><meshStandardMaterial color="#8d8c7b" /></mesh>
      })}
      {[0.07, 0.17].map((y) => <mesh key={y} position={[0, y, 0]}><boxGeometry args={[length, 0.012, 0.012]} /><meshStandardMaterial color="#8d8c7b" metalness={0.25} /></mesh>)}
    </group>
  )
}

function ServiceVehicle({ position, rotation = 0, color = '#c7874a', truck = false }: {
  position: [number, number]
  rotation?: number
  color?: string
  truck?: boolean
}) {
  return (
    <group position={[position[0], 0.055, position[1]]} rotation={[0, rotation, 0]}>
      {truck && <mesh position={[-0.11, 0.075, 0]} castShadow><boxGeometry args={[0.31, 0.16, 0.17]} /><meshStandardMaterial color={color} roughness={0.72} /></mesh>}
      <mesh position={[truck ? 0.13 : 0, 0.06, 0]} castShadow><boxGeometry args={[truck ? 0.13 : 0.23, 0.12, 0.16]} /><meshStandardMaterial color={truck ? '#d9d2bc' : color} roughness={0.64} /></mesh>
      {[-0.11, 0.11].map((x) => [-0.085, 0.085].map((z) => <mesh key={`${x}-${z}`} position={[x, 0.012, z]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.028, 0.028, 0.02, 8]} /><meshStandardMaterial color="#252b28" roughness={0.9} />
      </mesh>))}
    </group>
  )
}

function TownZoneLabel({ position, children }: { position: [number, number, number]; children: string }) {
  return <Html position={position} center zIndexRange={[3, 0]}><span className="geo-label town-zone-label">{children}</span></Html>
}

function ProductionSupportZone({ level }: { level: TownProsperityLevel }) {
  return (
    <group>
      <AsphaltPad position={[-4.36, -0.15]} size={[1.55, 1.12]} rotation={-0.08} />
      <NormalizedTownModel url={TOWN_MODELS.robertFactory} position={[-4.47, 0.05, -0.27]} rotation={-0.22} targetWidth={1.08} maxHeight={0.72} />
      <CargoStack position={[-4.04, 0.23]} color="#688b83" rotation={-0.08} />
      <FenceLine start={[-4.38, 0.42]} length={1.35} rotation={-0.08} />
      <ServiceVehicle position={[-3.92, -0.2]} rotation={-0.08} color="#b97749" truck />
      <TownZoneLabel position={[-4.42, 0.86, -0.4]}>西部生产支援区</TownZoneLabel>

      {level >= 4 && <>
        <AsphaltPad position={[4.42, 0.02]} size={[1.5, 1.02]} rotation={0.1} />
        <NormalizedTownModel url={TOWN_MODELS.polyFactory} position={[4.34, 0.05, -0.08]} rotation={0.22} targetWidth={1.1} maxHeight={0.7} />
        <NormalizedTownModel url={TOWN_MODELS.processTower} position={[4.77, 0.05, 0.28]} rotation={0.08} targetWidth={0.34} maxHeight={0.68} />
        <CargoStack position={[4.06, 0.29]} color="#bd7c48" rotation={0.1} />
        <FenceLine start={[4.42, 0.48]} length={1.28} rotation={0.1} />
        <ServiceVehicle position={[4.02, -0.22]} rotation={0.12} color="#6f9791" truck />
        <TownZoneLabel position={[4.42, 0.86, -0.35]}>东部制造配套区</TownZoneLabel>
      </>}
    </group>
  )
}

function WorkerNeighborhood({ level }: { level: TownProsperityLevel }) {
  const houses: Array<[number, number, number]> = [
    [-4.62, 1.35, -0.16], [-4.17, 1.45, 0.08], [-3.73, 1.58, -0.12],
    [-4.52, 1.91, 0.1], [-4.02, 2.01, -0.05], [-3.57, 1.95, 0.14],
  ]
  const trees: Array<[number, number]> = [
    [-4.78, 1.62], [-4.33, 1.68], [-3.84, 1.76], [-3.42, 1.69],
    [-4.72, 2.17], [-4.25, 2.24], [-3.76, 2.22], [-3.34, 2.12],
  ]
  return (
    <group>
      <RoundedBox args={[2.2, 0.032, 1.18]} radius={0.12} smoothness={3} position={[-4.05, 0.016, 1.8]} receiveShadow>
        <meshStandardMaterial color="#68725f" roughness={0.98} />
      </RoundedBox>
      <mesh position={[-4.05, 0.038, 1.78]} receiveShadow><boxGeometry args={[2.0, 0.018, 0.13]} /><meshStandardMaterial color="#b0aa8e" roughness={0.9} /></mesh>
      <NormalizedTownModel url={TOWN_MODELS.townHouse} position={[-3.12, 0.05, 1.65]} rotation={0.06} targetWidth={0.55} maxHeight={0.5} />
      {houses.slice(0, level >= 5 ? houses.length : 3).map(([x, z, rotation], index) => (
        <NormalizedTownModel key={index} url={TOWN_MODELS.house} position={[x, 0.05, z]} rotation={rotation} targetWidth={0.28} maxHeight={0.3} />
      ))}
      {trees.map((position, index) => <StreetTree key={index} position={position} scale={0.74 + (index % 3) * 0.08} color={index % 2 ? '#56795f' : '#4c6d57'} />)}
      {[
        [-4.55, 1.72, '#547c79'], [-4.22, 1.77, '#ba754d'], [-3.9, 1.72, '#6c8b70'],
        [-3.58, 1.84, '#bf9658'], [-4.05, 2.12, '#587d83'], [-3.35, 1.9, '#a76c4e'],
      ].map(([x, z, color], index) => <Person key={index} position={[x as number, 0.035, z as number]} color={color as string} helmet={index % 3 === 0} />)}
      <TownZoneLabel position={[-4.05, 0.68, 2.08]}>职工生活区</TownZoneLabel>
    </group>
  )
}

function OperationsCenter({ level }: { level: TownProsperityLevel }) {
  const parking = [-0.75, -0.48, -0.21, 0.06, 0.33, 0.6]
  return (
    <group>
      <AsphaltPad position={[-0.05, -1.88]} size={[2.25, 0.88]} rotation={-0.02} />
      <NormalizedTownModel url={TOWN_MODELS.office} position={[-0.56, 0.055, -1.9]} rotation={-0.02} targetWidth={0.72} maxHeight={0.62} />
      {level >= 4 && <NormalizedTownModel url={TOWN_MODELS.civic} position={[0.28, 0.055, -1.88]} rotation={0.02} targetWidth={0.48} maxHeight={0.62} />}
      {parking.map((x, index) => (
        <group key={x} position={[x, 0.055, -1.52]} rotation={[0, 0.02, 0]}>
          <mesh position={[0, 0.006, 0]}><boxGeometry args={[0.18, 0.01, 0.24]} /><meshStandardMaterial color="#d0c59d" /></mesh>
          {index % 2 === 0 && <mesh position={[0, 0.055, 0]} castShadow><boxGeometry args={[0.13, 0.09, 0.21]} /><meshStandardMaterial color={index % 4 ? '#7b9b95' : '#bd7f4b'} /></mesh>}
        </group>
      ))}
      {[-1.03, -0.8, 0.85, 1.07].map((x, index) => <StreetTree key={x} position={[x, -1.82]} scale={0.8 + (index % 2) * 0.12} />)}
      {[
        [-0.92, -1.58, '#527b7a'], [-0.7, -1.62, '#b9774c'], [0.58, -1.62, '#678a70'], [0.82, -1.59, '#c19a59'],
      ].map(([x, z, color], index) => <Person key={index} position={[x as number, 0.035, z as number]} color={color as string} />)}
      <TownZoneLabel position={[-0.05, 0.76, -1.88]}>运营服务中心</TownZoneLabel>
    </group>
  )
}

function CleanEnergyPark({ level }: { level: TownProsperityLevel }) {
  const panels = Array.from({ length: 10 }, (_, index) => ({
    x: 3.82 + (index % 5) * 0.24,
    z: -2.03 + Math.floor(index / 5) * 0.28,
  }))
  return (
    <group>
      <RoundedBox args={[1.65, 0.025, 0.86]} radius={0.1} smoothness={3} position={[4.28, 0.012, -1.85]} receiveShadow>
        <meshStandardMaterial color="#526852" roughness={0.98} />
      </RoundedBox>
      {panels.slice(0, level >= 5 ? panels.length : 5).map(({ x, z }, index) => (
        <NormalizedTownModel key={index} url={TOWN_MODELS.solarPanel} position={[x, 0.035, z]} rotation={-0.12} targetWidth={0.18} maxHeight={0.13} />
      ))}
      <NormalizedTownModel url={TOWN_MODELS.windmill} position={[4.72, 0.035, -1.54]} rotation={0.12} targetWidth={0.28} maxHeight={0.58} />
      {level >= 5 && <NormalizedTownModel url={TOWN_MODELS.windmill} position={[5.08, 0.035, -1.73]} rotation={-0.08} targetWidth={0.24} maxHeight={0.52} />}
      <FenceLine start={[4.28, -2.28]} length={1.5} rotation={0} />
      <TownZoneLabel position={[4.28, 0.72, -1.9]}>清洁能源区</TownZoneLabel>
    </group>
  )
}

function CentralManufacturingDistrict({ level }: { level: TownProsperityLevel }) {
  const northTrees: Array<[number, number]> = [[-1.22, -0.66], [-0.9, -0.82], [0.88, -0.82], [1.18, -0.64]]
  const southTrees: Array<[number, number]> = [[-1.08, 0.74], [-0.78, 0.86], [0.86, 0.86], [1.12, 0.7]]
  const workers: Array<[number, number, string, boolean]> = [
    [-0.92, -0.42, '#c17d4d', true], [-0.58, -0.34, '#557d7b', true], [-0.14, -0.28, '#b59a61', true],
    [0.32, 0.48, '#557d7b', false], [0.62, 0.54, '#b9734a', false], [0.88, 0.46, '#6c8d72', true],
  ]
  const panels = [-0.28, -0.02, 0.24]

  return (
    <group>
      <AsphaltPad position={[-0.02, -0.5]} size={[2.55, 0.82]} rotation={0.015} />
      <NormalizedTownModel url={TOWN_MODELS.robertFactory} position={[-0.82, 0.055, -0.54]} rotation={0.08} targetWidth={0.7} maxHeight={0.55} />
      {level >= 3 && <NormalizedTownModel url={TOWN_MODELS.polyFactory} position={[-0.08, 0.055, -0.55]} rotation={-0.06} targetWidth={0.7} maxHeight={0.52} />}
      {level >= 3 && <NormalizedTownModel url={TOWN_MODELS.office} position={[0.65, 0.055, -0.54]} rotation={0.03} targetWidth={0.48} maxHeight={0.48} />}
      {level >= 4 && <NormalizedTownModel url={TOWN_MODELS.processTower} position={[1.02, 0.055, -0.48]} rotation={0.04} targetWidth={0.24} maxHeight={0.52} />}
      <CargoStack position={[-0.4, -0.16]} color="#6d9189" />
      {level >= 3 && <CargoStack position={[0.38, -0.16]} color="#bc7e4d" />}
      <ServiceVehicle position={[-1.03, -0.18]} rotation={Math.PI / 2} color="#c4884c" truck />
      {level >= 3 && <ServiceVehicle position={[0.94, -0.18]} rotation={Math.PI / 2} color="#71958e" />}
      <FenceLine start={[0, -0.94]} length={2.38} />
      {northTrees.map((position, index) => <StreetTree key={`north-${index}`} position={position} scale={0.72 + (index % 2) * 0.08} />)}

      {level >= 4 && <><RoundedBox args={[2.35, 0.03, 0.68]} radius={0.08} smoothness={3} position={[0.06, 0.016, 0.62]} receiveShadow>
        <meshStandardMaterial color="#5e6b5c" roughness={0.97} />
      </RoundedBox>
      <NormalizedTownModel url={TOWN_MODELS.townHouse} position={[-0.7, 0.05, 0.62]} rotation={0.03} targetWidth={0.52} maxHeight={0.4} />
      <NormalizedTownModel url={TOWN_MODELS.civic} position={[-0.12, 0.05, 0.61]} rotation={-0.02} targetWidth={0.34} maxHeight={0.42} />
      <NormalizedTownModel url={TOWN_MODELS.house} position={[0.34, 0.05, 0.62]} rotation={0.06} targetWidth={0.26} maxHeight={0.26} />
      <NormalizedTownModel url={TOWN_MODELS.windmill} position={[0.95, 0.05, 0.58]} rotation={0.04} targetWidth={0.2} maxHeight={0.4} />
      {panels.map((x, index) => <NormalizedTownModel key={x} url={TOWN_MODELS.solarPanel} position={[x + 0.42, 0.05, 0.83]} rotation={-0.08} targetWidth={0.16} maxHeight={0.11} />)}
      {southTrees.map((position, index) => <StreetTree key={`south-${index}`} position={position} scale={0.7 + (index % 2) * 0.1} />)}</>}
      {workers.slice(0, level >= 4 ? workers.length : 3).map(([x, z, color, helmet], index) => <Person key={index} position={[x, 0.035, z]} color={color} helmet={helmet} />)}
      <TownZoneLabel position={[0, 0.92, -0.4]}>中央综合制造组团</TownZoneLabel>
    </group>
  )
}

function ProsperityExpansion() {
  const factories: Array<[number, number, number, 'polyFactory' | 'robertFactory']> = [
    [-2.78, -2.05, -0.08, 'robertFactory'], [-2.18, -2.12, 0.06, 'polyFactory'],
    [1.45, -2.1, -0.04, 'robertFactory'], [2.06, -2.08, 0.08, 'polyFactory'], [2.66, -2.0, -0.1, 'robertFactory'],
    [-2.72, 2.14, 0.08, 'polyFactory'], [-2.08, 2.2, -0.06, 'robertFactory'], [-1.44, 2.16, 0.1, 'polyFactory'],
    [1.5, 2.12, -0.08, 'robertFactory'], [2.14, 2.18, 0.05, 'polyFactory'], [2.78, 2.08, -0.08, 'robertFactory'],
  ]
  const homes: Array<[number, number, number]> = [
    [-4.82, 1.08, -0.12], [-4.48, 1.08, 0.08], [-4.12, 1.12, -0.05], [-3.76, 1.16, 0.11],
    [-4.88, 2.34, 0.08], [-4.5, 2.38, -0.1], [-4.12, 2.4, 0.06], [-3.72, 2.36, -0.04],
    [3.38, 1.58, 0.08], [3.76, 1.66, -0.08], [4.14, 1.72, 0.1], [4.54, 1.68, -0.06],
    [3.46, 2.12, -0.08], [3.86, 2.2, 0.06], [4.26, 2.24, -0.1], [4.66, 2.18, 0.08],
  ]
  const offices: Array<[number, number, number]> = [
    [-3.4, -2.06, -0.08], [-1.54, -2.1, 0.06], [0.92, -2.08, -0.04], [3.24, -1.98, 0.08],
    [-3.32, 2.16, 0.04], [-0.86, 2.14, -0.06], [0.84, 2.12, 0.06], [3.28, 2.06, -0.08],
  ]
  const people: Array<[number, number, string]> = [
    [-3.14, -1.78, '#bd7a4b'], [-2.48, -1.82, '#547d7b'], [-1.82, -1.8, '#c09b5e'],
    [1.24, -1.82, '#5a817f'], [1.84, -1.82, '#bb754a'], [2.46, -1.76, '#6c8b71'],
    [-2.46, 1.88, '#5a817f'], [-1.72, 1.9, '#bd7a4b'], [1.72, 1.88, '#c09b5e'], [2.42, 1.84, '#547d7b'],
    [3.7, 1.92, '#ba754d'], [4.24, 1.94, '#64876f'],
  ]

  return (
    <group>
      <AsphaltPad position={[-2.2, -2.08]} size={[2.55, 0.62]} />
      <AsphaltPad position={[2.05, -2.06]} size={[2.95, 0.64]} />
      <AsphaltPad position={[-2.06, 2.16]} size={[2.9, 0.64]} />
      <AsphaltPad position={[2.08, 2.14]} size={[3.0, 0.64]} />
      {factories.map(([x, z, rotation, kind], index) => (
        <NormalizedTownModel key={`factory-${index}`} url={TOWN_MODELS[kind]} position={[x, 0.052, z]} rotation={rotation} targetWidth={0.46 + (index % 3) * 0.04} maxHeight={0.42} />
      ))}
      {offices.map(([x, z, rotation], index) => (
        <NormalizedTownModel key={`office-${index}`} url={index % 3 === 0 ? TOWN_MODELS.civic : TOWN_MODELS.office} position={[x, 0.052, z]} rotation={rotation} targetWidth={0.32 + (index % 2) * 0.04} maxHeight={0.4} />
      ))}
      {homes.map(([x, z, rotation], index) => (
        <NormalizedTownModel key={`home-${index}`} url={index % 5 === 0 ? TOWN_MODELS.townHouse : TOWN_MODELS.house} position={[x, 0.048, z]} rotation={rotation} targetWidth={index % 5 === 0 ? 0.34 : 0.23} maxHeight={0.3} />
      ))}
      {people.map(([x, z, color], index) => <Person key={`person-${index}`} position={[x, 0.035, z]} color={color} helmet={index < 10} />)}
      {[-3.02, -2.38, -1.72, 1.16, 1.78, 2.38, 3.02].map((x, index) => (
        <ServiceVehicle key={`north-vehicle-${x}`} position={[x, -1.72]} rotation={Math.PI / 2} color={index % 2 ? '#71958e' : '#c4884c'} truck={index % 3 === 0} />
      ))}
      {[-2.62, -1.92, 1.38, 2.08, 2.74].map((x, index) => (
        <ServiceVehicle key={`south-vehicle-${x}`} position={[x, 1.82]} rotation={-Math.PI / 2} color={index % 2 ? '#b79a62' : '#688e88'} truck={index % 2 === 0} />
      ))}
      <NormalizedTownModel url={TOWN_MODELS.processTower} position={[-3.52, 0.05, -1.95]} rotation={0.04} targetWidth={0.22} maxHeight={0.48} />
      <NormalizedTownModel url={TOWN_MODELS.processTower} position={[3.5, 0.05, 2.02]} rotation={-0.04} targetWidth={0.22} maxHeight={0.48} />
    </group>
  )
}

function GreenBufferAndTownLife() {
  const treePositions: Array<[number, number]> = [
    [-5.02, 0.72], [-4.68, 0.78], [-4.35, 0.8], [-3.95, 0.88], [-3.5, 0.95],
    [-1.62, -2.12], [-1.35, -2.2], [1.35, -2.15], [1.64, -2.08], [1.95, -2.0],
    [3.42, -1.98], [3.34, -1.62], [5.12, -1.22], [5.22, -0.82], [5.15, 0.78],
    [4.82, 1.08], [4.48, 1.32], [4.16, 1.55], [3.8, 1.82], [3.42, 2.04],
    [-2.7, 2.34], [-2.35, 2.38], [-1.98, 2.34], [-1.62, 2.28], [-1.24, 2.2],
  ]
  return <group>{treePositions.map((position, index) => (
    <StreetTree key={index} position={position} scale={0.78 + (index % 4) * 0.09} color={index % 3 === 0 ? '#63805f' : '#4d7059'} />
  ))}</group>
}

export function TableFactoryTown({ snapshot }: { snapshot: MapSnapshot }) {
  const level = deriveTownProsperity(snapshot)
  return (
    <group>
      <Suspense fallback={null}>
        {level >= 2 && <CentralManufacturingDistrict level={level} />}
        {level >= 3 && <ProductionSupportZone level={level} />}
        {level >= 3 && <OperationsCenter level={level} />}
        {level >= 4 && <WorkerNeighborhood level={level} />}
        {level >= 4 && <CleanEnergyPark level={level} />}
        {level >= 5 && <ProsperityExpansion />}
      </Suspense>
      <GreenBufferAndTownLife />
    </group>
  )
}

Object.values(TOWN_MODELS).forEach((url) => useGLTF.preload(url))
