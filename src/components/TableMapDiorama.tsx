import { RoundedBox } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo } from 'react'
import * as THREE from 'three'
import type { MapSnapshot } from '../../packages/contracts/src'
import { MapProjectLayer } from '../../packages/map-visuals/src/MapProjectLayer'

function MapLibreTableTexture({ canvas }: { canvas: HTMLCanvasElement | null }) {
  const texture = useMemo(() => {
    if (!canvas) return null
    const next = new THREE.CanvasTexture(canvas)
    next.colorSpace = THREE.SRGBColorSpace
    next.minFilter = THREE.LinearFilter
    next.magFilter = THREE.LinearFilter
    next.generateMipmaps = false
    next.anisotropy = 8
    next.wrapS = THREE.ClampToEdgeWrapping
    next.repeat.set(1, 1)
    next.offset.set(0, 0)
    next.needsUpdate = true
    return next
  }, [canvas])

  useFrame(() => {
    if (texture) texture.needsUpdate = true
  })

  return (
    <mesh position={[0, 0.306, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[10.38, 3.28]} />
      <meshBasicMaterial
        map={texture ?? undefined}
        color={texture ? '#ffffff' : '#10201d'}
        toneMapped={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}

export function TableMapDiorama({ snapshot, mapCanvas }: {
  snapshot: MapSnapshot
  mapCanvas: HTMLCanvasElement | null
}) {
  return (
    <group position={[0, 0.37, -0.22]}>
      {([-1, 1] as const).map((side) => (
        <RoundedBox key={`horizontal-${side}`} args={[10.78, 0.16, 0.2]} radius={0.05} smoothness={3} position={[0, 0.22, side * 1.74]} receiveShadow>
          <meshStandardMaterial color="#6b4a32" roughness={0.68} metalness={0.18} />
        </RoundedBox>
      ))}
      {([-1, 1] as const).map((side) => (
        <RoundedBox key={`vertical-${side}`} args={[0.2, 0.16, 3.3]} radius={0.05} smoothness={3} position={[side * 5.29, 0.22, 0]} receiveShadow>
          <meshStandardMaterial color="#6b4a32" roughness={0.68} metalness={0.18} />
        </RoundedBox>
      ))}
      <mesh position={[0, 0.23, 0]} receiveShadow>
        <boxGeometry args={[10.52, 0.045, 3.42]} />
        <meshStandardMaterial color="#081310" roughness={0.55} metalness={0.12} />
      </mesh>
      <MapLibreTableTexture canvas={mapCanvas} />
      <group position={[0, 0.34, 0]}>
        <MapProjectLayer snapshot={snapshot} bounds={{ width: 8.75, depth: 2.42 }} parcelScale={0.29} />
      </group>
    </group>
  )
}
