import { Clone, useGLTF } from '@react-three/drei'
import { Suspense } from 'react'

type Position = [number, number, number]

const assets = [
  { file: 'building-q.glb', position: [-1.18, 0, -0.48] as Position, rotation: 0.05, scale: 0.74 },
  { file: 'building-r.glb', position: [0.78, 0, -0.42] as Position, rotation: -0.08, scale: 0.66 },
  { file: 'building-p.glb', position: [-0.72, 0, 0.82] as Position, rotation: Math.PI + 0.04, scale: 0.72 },
  { file: 'building-h.glb', position: [0.92, 0, 0.78] as Position, rotation: Math.PI - 0.05, scale: 0.78 },
] as const

function FactoryAsset({ file, position, rotation, scale }: (typeof assets)[number]) {
  const { scene } = useGLTF(`/models/kenney-industrial/${file}`)

  return (
    <group position={position} rotation={[0, rotation, 0]} scale={scale}>
      <Clone object={scene} castShadow receiveShadow />
    </group>
  )
}

function IndustrialFallback() {
  return (
    <group>
      {assets.map((asset, index) => (
        <mesh key={asset.file} position={[asset.position[0], 0.2, asset.position[2]]} castShadow>
          <boxGeometry args={[index < 2 ? 1.3 : 1, 0.4 + index * 0.06, 0.72]} />
          <meshStandardMaterial color={index % 2 === 0 ? '#71796f' : '#8b8877'} roughness={0.88} />
        </mesh>
      ))}
    </group>
  )
}

export function KenneyIndustrialPark({ scale = 1 }: { scale?: number }) {
  return (
    <group scale={scale}>
      <mesh position={[0, -0.035, 0.12]} receiveShadow>
        <boxGeometry args={[4.25, 0.07, 2.85]} />
        <meshStandardMaterial color="#58615a" roughness={0.94} />
      </mesh>
      <mesh position={[0, 0.01, 0.1]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.45, 1.53, 48]} />
        <meshStandardMaterial color="#c8b88f" transparent opacity={0.34} />
      </mesh>
      <Suspense fallback={<IndustrialFallback />}>
        {assets.map((asset) => <FactoryAsset key={asset.file} {...asset} />)}
      </Suspense>
    </group>
  )
}

assets.forEach(({ file }) => useGLTF.preload(`/models/kenney-industrial/${file}`))
