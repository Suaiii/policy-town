import { RoundedBox } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import * as THREE from 'three'
import type { MapProjectVisualState } from '../../../packages/contracts/src'

const palettes: Record<string, { primary: string; secondary: string; accent: string }> = {
  新型显示: { primary: '#789b9a', secondary: '#cad2c7', accent: '#7bc8c2' },
  新能源: { primary: '#9b9062', secondary: '#d4c9a6', accent: '#e3ba60' },
  新能源汽车: { primary: '#9b9062', secondary: '#d4c9a6', accent: '#e3ba60' },
  集成电路装备: { primary: '#7b7896', secondary: '#c8c4d5', accent: '#b5a9e5' },
  量子信息: { primary: '#7b7896', secondary: '#c8c4d5', accent: '#b5a9e5' },
}

function Beacon({ color, warning = false }: { color: string; warning?: boolean }) {
  const light = useRef<THREE.PointLight>(null)

  useFrame(({ clock }) => {
    if (!light.current) return
    light.current.intensity = (warning ? 6 : 3) + Math.sin(clock.elapsedTime * (warning ? 5 : 2)) * 1.2
  })

  return (
    <group position={[0, 1.58, 0]}>
      <mesh>
        <sphereGeometry args={[0.055, 12, 8]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={warning ? 2.8 : 1.6} />
      </mesh>
      <pointLight ref={light} color={color} distance={2.2} intensity={3} />
    </group>
  )
}

function ProposalModel({ accent }: { accent: string }) {
  return (
    <group>
      <mesh position={[0, 0.035, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 4]}>
        <ringGeometry args={[0.38, 0.48, 4]} />
        <meshBasicMaterial color={accent} transparent opacity={0.9} />
      </mesh>
      <mesh position={[0, 0.32, 0]}>
        <boxGeometry args={[0.7, 0.58, 0.55]} />
        <meshBasicMaterial color={accent} wireframe transparent opacity={0.34} />
      </mesh>
      <Beacon color={accent} />
    </group>
  )
}

function ConstructionModel({ progress, primary, accent }: { progress: number; primary: string; accent: string }) {
  const builtHeight = 0.2 + Math.max(0.08, progress / 100) * 0.72
  return (
    <group>
      <RoundedBox args={[1.22, 0.1, 0.88]} radius={0.05} smoothness={3} position={[0, 0.06, 0]}>
        <meshStandardMaterial color="#6a695d" roughness={0.88} />
      </RoundedBox>
      <mesh position={[-0.12, builtHeight / 2 + 0.1, 0]} castShadow>
        <boxGeometry args={[0.82, builtHeight, 0.58]} />
        <meshStandardMaterial color={primary} roughness={0.76} />
      </mesh>
      {[-0.46, 0.22].map((x) => [-0.25, 0.25].map((z) => (
        <mesh key={`${x}-${z}`} position={[x, 0.68, z]}>
          <boxGeometry args={[0.035, 1.15, 0.035]} />
          <meshStandardMaterial color="#d6a04d" />
        </mesh>
      )))}
      <group position={[0.52, 0.05, -0.18]}>
        <mesh position={[0, 0.66, 0]}><boxGeometry args={[0.045, 1.28, 0.045]} /><meshStandardMaterial color="#d6a04d" /></mesh>
        <mesh position={[-0.3, 1.22, 0]}><boxGeometry args={[0.65, 0.04, 0.04]} /><meshStandardMaterial color="#d6a04d" /></mesh>
        <mesh position={[-0.58, 1.05, 0]}><boxGeometry args={[0.025, 0.36, 0.025]} /><meshStandardMaterial color="#d6a04d" /></mesh>
      </group>
      <Beacon color={accent} />
    </group>
  )
}

function OperatingModel({ primary, secondary, accent, ramp }: {
  primary: string
  secondary: string
  accent: string
  ramp: boolean
}) {
  return (
    <group scale={ramp ? 0.92 : 1}>
      <RoundedBox args={[1.45, 0.16, 1.02]} radius={0.08} smoothness={4} position={[0, 0.1, 0]} castShadow>
        <meshStandardMaterial color="#4a574f" roughness={0.78} />
      </RoundedBox>
      <RoundedBox args={[1.08, 0.82, 0.72]} radius={0.07} smoothness={4} position={[-0.08, 0.58, 0]} castShadow>
        <meshStandardMaterial color={primary} roughness={0.58} metalness={0.06} />
      </RoundedBox>
      <RoundedBox args={[0.52, 0.58, 0.58]} radius={0.06} smoothness={3} position={[0.63, 0.46, 0.08]} castShadow>
        <meshStandardMaterial color={secondary} roughness={0.64} />
      </RoundedBox>
      {[-0.36, 0, 0.36].map((x) => (
        <mesh key={x} position={[x, 1.03, 0]} rotation={[-0.12, 0, 0]} castShadow>
          <boxGeometry args={[0.28, 0.06, 0.62]} />
          <meshStandardMaterial color="#718f94" emissive="#27444a" emissiveIntensity={0.3} />
        </mesh>
      ))}
      {[-0.42, -0.12, 0.18].map((x) => (
        <mesh key={x} position={[x, 0.58, 0.371]}>
          <boxGeometry args={[0.16, 0.13, 0.025]} />
          <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={ramp ? 0.35 : 0.8} />
        </mesh>
      ))}
      {[0.43, 0.66].map((x, index) => (
        <mesh key={x} position={[x, 1.08 + index * 0.08, -0.14]} castShadow>
          <cylinderGeometry args={[0.07, 0.1, 0.92 + index * 0.12, 12]} />
          <meshStandardMaterial color="#707870" roughness={0.65} />
        </mesh>
      ))}
      <Beacon color={accent} />
    </group>
  )
}

function StalledModel({ primary }: { primary: string }) {
  return (
    <group>
      <RoundedBox args={[1.3, 0.12, 0.92]} radius={0.06} smoothness={3} position={[0, 0.08, 0]}>
        <meshStandardMaterial color="#554943" roughness={0.9} />
      </RoundedBox>
      <mesh position={[-0.12, 0.43, 0]} castShadow>
        <boxGeometry args={[0.9, 0.65, 0.6]} />
        <meshStandardMaterial color={primary} roughness={0.92} transparent opacity={0.68} />
      </mesh>
      {[-0.45, 0, 0.45].map((x) => (
        <group key={x} position={[x, 0.25, 0.52]} rotation={[0, 0, x > 0 ? -0.12 : 0.12]}>
          <mesh><boxGeometry args={[0.2, 0.06, 0.06]} /><meshStandardMaterial color="#d68a57" /></mesh>
          <mesh rotation={[0, 0, Math.PI / 2]}><boxGeometry args={[0.18, 0.025, 0.065]} /><meshStandardMaterial color="#392b25" /></mesh>
        </group>
      ))}
      <Beacon color="#ef7655" warning />
    </group>
  )
}

export function ProjectLandmark({ project, selected, hovered, onClick }: {
  project: MapProjectVisualState
  selected: boolean
  hovered: boolean
  onClick: (event: ThreeEvent<MouseEvent>) => void
}) {
  const palette = palettes[project.industry] ?? palettes['新型显示']
  const scale = selected || hovered ? 1.18 : 1.04

  return (
    <group scale={scale} onClick={onClick}>
      {project.stage === 'proposal' && <ProposalModel accent={palette.accent} />}
      {project.stage === 'construction' && <ConstructionModel progress={project.progress} primary={palette.primary} accent={palette.accent} />}
      {project.stage === 'ramp' && <OperatingModel {...palette} ramp />}
      {project.stage === 'operating' && <OperatingModel {...palette} ramp={false} />}
      {(project.stage === 'stalled' || project.stage === 'exited') && <StalledModel primary={palette.primary} />}
    </group>
  )
}
