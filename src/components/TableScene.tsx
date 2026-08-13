import { Billboard, Html, OrbitControls, RoundedBox, useAnimations, useGLTF, useTexture } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef, type CSSProperties } from 'react';
import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { MapSnapshot } from '../../packages/contracts/src';
import { PROJECT_VISUAL_PALETTES } from '../../packages/map-visuals/src/MapProjectLayer';
import { getEnterprise } from '../game/scenario';
import type { CameraMode, EnterpriseId, EnterpriseState } from '../game/types';
import { ENTERPRISE_ARCHETYPES } from '../integration/mapAdapter';
import { TableMapDiorama } from './TableMapDiorama';
import { FrameCorners } from './ui/ParlorUI';

function PanoramaRoom() {
  const texture = useTexture('/assets/v3 360_upscayl_4x_ultrasharp-4x.png');

  useEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 16;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;
  }, [texture]);

  return (
    <mesh scale={[-1, 1, 1]} rotation={[0, Math.PI / 2, 0]} renderOrder={-1}>
      <sphereGeometry args={[38, 72, 36]} />
      <meshBasicMaterial map={texture} side={THREE.BackSide} fog={false} depthWrite={false} />
    </mesh>
  );
}

const seatPositions = [-3.2, 0, 3.2] as const;

function CameraRig({ mode, selectedId }: { mode: CameraMode; selectedId: EnterpriseId }) {
  const { camera } = useThree();
  const lookTarget = useRef(new THREE.Vector3());
  const selectedIndex = selectedId === 'enterprise-a' ? 0 : selectedId === 'enterprise-b' ? 1 : 2;
  const selectedX = seatPositions[selectedIndex];
  const positions = useMemo(
    () => ({
      table: new THREE.Vector3(0, 10.4, 9.8),
      meeting: new THREE.Vector3(selectedX + 0.55, 2.75, 1.25),
      panorama: new THREE.Vector3(0, 4.3, 11),
    }),
    [selectedX],
  );
  const targets = useMemo(
    () => ({
      table: new THREE.Vector3(0, 0.45, -1.15),
      meeting: new THREE.Vector3(selectedX + 1.45, 0.82, -5.08),
      panorama: new THREE.Vector3(0, 2.1, 0),
    }),
    [selectedX],
  );
  const upDirections = useMemo(
    () => ({
      table: new THREE.Vector3(0, 1, 0),
      meeting: new THREE.Vector3(0, 1, 0),
      panorama: new THREE.Vector3(0, 1, 0),
    }),
    [],
  );

  useEffect(() => {
    if (mode === 'panorama') camera.up.copy(upDirections.panorama);
  }, [camera, mode, upDirections]);

  useFrame((_, delta) => {
    if (mode === 'panorama') return;
    const positionEase = 1 - Math.exp(-delta * 3.4);
    const rotationEase = 1 - Math.exp(-delta * 3.6);
    camera.position.lerp(positions[mode], positionEase);
    camera.up.lerp(upDirections[mode], rotationEase).normalize();
    lookTarget.current.lerp(targets[mode], rotationEase);
    camera.lookAt(lookTarget.current);
  });
  return null;
}

const BUSINESS_MAN_URL = '/models/Business_Man_by_Quaternius_-_JFrLIKqvCH.glb';
const BUSINESS_WOMAN_URL = '/models/Suit_by_Quaternius_-_sOUciDsoVV.glb';
const OFFICE_CHAIR_URL = '/models/Office_Chair_by_Quaternius_-_UfKvrZBK6C.glb';
const REPRESENTATIVE_SCALE = 1.28;

const REPRESENTATIVE_MODELS: Record<EnterpriseId, string> = {
  'enterprise-a': BUSINESS_MAN_URL,
  'enterprise-b': BUSINESS_MAN_URL,
  'enterprise-c': BUSINESS_WOMAN_URL,
};

function RepresentativeFocusDisc({ accent }: { accent: string }) {
  return (
    <group position={[0, 1.08, -0.34]}>
      <Billboard>
        <mesh renderOrder={-1}>
          <circleGeometry args={[0.78, 96]} />
          <meshPhysicalMaterial
            color={accent}
            transparent
            opacity={0.2}
            roughness={0.12}
            metalness={0.08}
            transmission={0.62}
            thickness={0.45}
            ior={1.25}
            clearcoat={1}
            clearcoatRoughness={0.1}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
        <mesh position={[0, 0, 0.012]} renderOrder={1}>
          <ringGeometry args={[0.75, 0.78, 96]} />
          <meshBasicMaterial color={accent} transparent opacity={0.78} depthWrite={false} />
        </mesh>
        <mesh position={[0, 0, 0.018]} renderOrder={1}>
          <ringGeometry args={[0.62, 0.63, 96]} />
          <meshBasicMaterial color={accent} transparent opacity={0.22} depthWrite={false} />
        </mesh>
      </Billboard>
    </group>
  );
}

function SeatedBusinessRepresentative({ enterpriseId, selected, onSelect }: {
  enterpriseId: EnterpriseId;
  selected: boolean;
  onSelect: () => void;
}) {
  const representativeModel = useGLTF(REPRESENTATIVE_MODELS[enterpriseId]);
  const officeChair = useGLTF(OFFICE_CHAIR_URL);
  const person = useMemo(() => cloneSkeleton(representativeModel.scene) as THREE.Group, [representativeModel.scene]);
  const chair = useMemo(() => officeChair.scene.clone(true), [officeChair.scene]);
  const seatedIdle = useMemo(() => {
    const source = representativeModel.animations.find((clip) => clip.name.endsWith('|Idle_Neutral'));
    if (!source) return undefined;
    const clip = source.clone();
    clip.name = 'SeatedIdle';
    clip.tracks = clip.tracks.filter((track) => !/^(Root|Body|Hips|UpperLeg|LowerLeg|Foot|PT)[.]/.test(track.name));
    return clip;
  }, [representativeModel.animations]);
  const { actions } = useAnimations(seatedIdle ? [seatedIdle] : [], person);

  useEffect(() => {
    const action = actions.SeatedIdle;
    action?.reset().fadeIn(0.25).play();
    return () => {
      action?.fadeOut(0.15);
    };
  }, [actions]);

  useEffect(() => {
    const bend = (name: string, angle: number) => {
      const bone = person.getObjectByName(name);
      if (!bone) return;
      bone.rotateX(angle);
    };

    bend('UpperLeg.L', -Math.PI * 0.48);
    bend('UpperLeg.R', -Math.PI * 0.48);
    bend('LowerLeg.L', Math.PI * 0.54);
    bend('LowerLeg.R', Math.PI * 0.54);
    bend('Foot.L', -Math.PI * 0.08);
    bend('Foot.R', -Math.PI * 0.08);

    person.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.castShadow = true;
      object.receiveShadow = true;
    });
    chair.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.castShadow = true;
      object.receiveShadow = true;
    });
  }, [chair, person]);

  return (
    <group scale={REPRESENTATIVE_SCALE} onClick={(event) => { event.stopPropagation(); onSelect(); }}>
      {selected && (
        <mesh position={[0, 0.02, 0.02]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.52, 0.64, 40]} />
          <meshBasicMaterial color="#d4aa68" transparent opacity={0.8} side={THREE.DoubleSide} />
        </mesh>
      )}
      <primitive object={chair} position={[0, 0, -0.06]} />
      <primitive object={person} position={[0, -0.28, 0.08]} />
    </group>
  );
}

function EnterpriseSeats({ enterprises, selectedId, meeting, showLabels, onSelect }: {
  enterprises: EnterpriseState[];
  selectedId: EnterpriseId;
  meeting: boolean;
  showLabels: boolean;
  onSelect: (id: EnterpriseId) => void;
}) {
  return (
    <group position={[0, -0.27, -5.35]}>
      {enterprises.map((enterprise, index) => {
        const selected = enterprise.id === selectedId;
        if (meeting && !selected) return null;
        const profile = getEnterprise(enterprise.id);
        const visualPalette = PROJECT_VISUAL_PALETTES[ENTERPRISE_ARCHETYPES[enterprise.id]];
        const identityStyle = {
          '--enterprise-accent': visualPalette.accent,
          '--enterprise-primary': visualPalette.primary,
        } as CSSProperties;
        return (
          <group key={enterprise.id} position={[seatPositions[index], 0, 0]}>
            {meeting && selected && <RepresentativeFocusDisc accent={visualPalette.accent} />}
            <SeatedBusinessRepresentative enterpriseId={enterprise.id} selected={selected} onSelect={() => onSelect(enterprise.id)} />
            {showLabels && <Html center position={[0, 2.02, 0]} distanceFactor={11} occlude>
              <button
                className={`seat-label enterprise-identity ${selected ? 'active' : ''}`}
                style={identityStyle}
                onPointerDown={(event) => { event.stopPropagation(); onSelect(enterprise.id); }}
                onClick={(event) => { event.stopPropagation(); onSelect(enterprise.id); }}
              >
                <FrameCorners inset />
                <small>企业 {enterprise.code} · {profile.industry}</small>
                <span>{enterprise.allocation > 0 ? `政府投入 ${enterprise.allocation} 点` : `资金请求 ${profile.request} 点`}</span>
              </button>
            </Html>}
          </group>
        );
      })}
    </group>
  );
}

function PolicyPieces() {
  const pieces = [
    [-3.8, '#ad804d', '投资'],
    [-2.65, '#587f83', '基建'],
    [2.65, '#746b95', '人才'],
    [3.8, '#9b6555', '融资'],
  ] as const;
  return (
    <group position={[0, 0.62, 3.0]}>
      {pieces.map(([x, color, label]) => (
        <group key={label} position={[x, 0, 0]} rotation={[0, 0, x * 0.012]}>
          <RoundedBox args={[0.84, 0.1, 0.58]} radius={0.06} smoothness={3} castShadow>
            <meshStandardMaterial color={color} roughness={0.55} />
          </RoundedBox>
          <Html center position={[0, 0.12, 0]} distanceFactor={14}><span className="piece-label">{label}</span></Html>
        </group>
      ))}
    </group>
  );
}

export function TableScene({ mode, enterprises, mapSnapshot, mapCanvas, selectedId, onEnterpriseSelect }: {
  mode: CameraMode;
  enterprises: EnterpriseState[];
  mapSnapshot: MapSnapshot;
  mapCanvas: HTMLCanvasElement | null;
  selectedId: EnterpriseId;
  onEnterpriseSelect: (id: EnterpriseId) => void;
}) {
  return (
    <Canvas
      shadows="basic"
      dpr={[1, 1.6]}
      camera={{ position: [0, 10.4, 9.8], fov: 36, near: 0.1, far: 90 }}
      onCreated={({ gl }) => { gl.toneMappingExposure = 1.3; }}
    >
      <color attach="background" args={['#081116']} />
      <ambientLight intensity={0.88} />
      <directionalLight castShadow position={[-6, 11, 7]} intensity={2.55} color="#ffe1aa" shadow-mapSize={[2048, 2048]} />
      <pointLight position={[5, 4, -4]} intensity={16} distance={15} color="#73bbc0" />
      <Suspense fallback={null}>
        <PanoramaRoom />
        <group>
          <RoundedBox args={[14, 0.5, 9]} radius={0.22} smoothness={5} position={[0, 0, 0]} castShadow receiveShadow>
            <meshStandardMaterial color="#583b2b" roughness={0.76} />
          </RoundedBox>
          <RoundedBox args={[13.4, 0.08, 8.4]} radius={0.2} smoothness={4} position={[0, 0.29, 0]} receiveShadow>
            <meshStandardMaterial color="#1b312e" roughness={0.86} />
          </RoundedBox>
          <TableMapDiorama snapshot={mapSnapshot} mapCanvas={mapCanvas} />
          <EnterpriseSeats
            enterprises={enterprises}
            selectedId={selectedId}
            meeting={mode === 'meeting'}
            showLabels={mode === 'panorama'}
            onSelect={onEnterpriseSelect}
          />
          <PolicyPieces />
          <Html center position={[0, 0.65, 3.7]} distanceFactor={12}>
            <div className="government-plaque"><small>PLAYER</small><strong>合肥市政府</strong></div>
          </Html>
        </group>
      </Suspense>
      <CameraRig mode={mode} selectedId={selectedId} />
      <OrbitControls
        makeDefault
        enabled={mode === 'panorama'}
        target={[0, 1.9, 0]}
        enablePan={false}
        enableZoom={false}
        enableDamping
        dampingFactor={0.07}
        minPolarAngle={0.48}
        maxPolarAngle={1.58}
      />
    </Canvas>
  );
}

useGLTF.preload(BUSINESS_MAN_URL);
useGLTF.preload(BUSINESS_WOMAN_URL);
useGLTF.preload(OFFICE_CHAIR_URL);
