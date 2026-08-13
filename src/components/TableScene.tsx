import { Billboard, Html, OrbitControls, RoundedBox, useAnimations, useGLTF, useTexture } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { MapSnapshot } from '../../packages/contracts/src';
import { getEnterprise } from '../game/scenario';
import { ENTERPRISE_REPRESENTATIVE_CONFIG, enterpriseSeatIndex } from '../game/representatives';
import type { CameraMode, CityResources, EnterpriseId, EnterpriseState } from '../game/types';
import { enterpriseThemeStyle, getEnterpriseTheme } from '../theme/enterpriseTheme';
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

function seatPosition(index: number, count: number) {
  if (count === 2) return index === 0 ? -2.15 : 2.15;
  return [-3.2, 0, 3.2][index] ?? 0;
}

function CameraRig({ mode, selectedId, enterpriseIds, introFocus }: {
  mode: CameraMode;
  selectedId: EnterpriseId;
  enterpriseIds: EnterpriseId[];
  introFocus?: EnterpriseId | 'overview';
}) {
  const { camera } = useThree();
  const lookTarget = useRef(new THREE.Vector3());
  const focusId = introFocus && introFocus !== 'overview' ? introFocus : selectedId;
  const selectedIndex = Math.max(0, enterpriseIds.indexOf(focusId));
  const selectedX = seatPosition(selectedIndex, enterpriseIds.length);
  const positions = useMemo(
    () => ({
      table: new THREE.Vector3(0, 10.4, 9.8),
      meeting: new THREE.Vector3(selectedX + 0.48, 2.68, 1.15),
      panorama: new THREE.Vector3(0, 4.3, 11),
      intro: introFocus === 'overview'
        ? new THREE.Vector3(0, 9.6, 10.8)
        : new THREE.Vector3(selectedX + 0.42, 2.9, 1.85),
    }),
    [introFocus, selectedX],
  );
  const targets = useMemo(
    () => ({
      table: new THREE.Vector3(0, 0.45, -1.15),
      meeting: new THREE.Vector3(selectedX + 1.2, 0.92, -5.12),
      panorama: new THREE.Vector3(0, 2.1, 0),
      intro: introFocus === 'overview'
        ? new THREE.Vector3(0, 0.35, -1.25)
        : new THREE.Vector3(selectedX, 0.86, -5.05),
    }),
    [introFocus, selectedX],
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
    const positionTarget = introFocus ? positions.intro : positions[mode];
    const lookTargetValue = introFocus ? targets.intro : targets[mode];
    const positionEase = 1 - Math.exp(-delta * 3.4);
    const rotationEase = 1 - Math.exp(-delta * 3.6);
    camera.position.lerp(positionTarget, positionEase);
    camera.up.lerp(upDirections[mode], rotationEase).normalize();
    lookTarget.current.lerp(lookTargetValue, rotationEase);
    camera.lookAt(lookTarget.current);
  });
  return null;
}

const BUSINESS_MAN_URL = '/models/Business_Man_by_Quaternius_-_JFrLIKqvCH.glb';
const BUSINESS_WOMAN_URL = '/models/Suit_by_Quaternius_-_sOUciDsoVV.glb';
const OFFICE_CHAIR_URL = '/models/Office_Chair_by_Quaternius_-_UfKvrZBK6C.glb';
const COIN_URL = '/models/Coin_by_Quaternius_-_7IrL01B97W.glb';
const COIN_PILE_URL = '/models/Coin_Piles_by_Quaternius_-_9OWkKczINo.glb';
const CHESS_QUEEN_URL = '/models/Chess_Queen_by_Jarlan_Perez_-_0EE-Yj8eu2c.glb';
const CHESS_KING_URL = '/models/Chess_King_by_Jarlan_Perez_-_4TP6oa34Fp-.glb';
const GENERATOR_URL = '/models/Generator_by_KolosStudios_-_K58RQ63qR5.glb';
const GEARS_URL = '/models/Gears_by_Poly_by_Google_-_4hAw8zQHeMJ.glb';
const REPRESENTATIVE_SCALE = 1.28;

const REPRESENTATIVE_MODELS: Record<EnterpriseId, string> = Object.fromEntries(
  (Object.keys(ENTERPRISE_REPRESENTATIVE_CONFIG) as EnterpriseId[]).map((id) => [
    id,
    ENTERPRISE_REPRESENTATIVE_CONFIG[id].gender === 'female' ? BUSINESS_WOMAN_URL : BUSINESS_MAN_URL,
  ]),
) as Record<EnterpriseId, string>;

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

function EnterpriseSeats({ enterprises, selectedId, meeting, labelMode, focusOnlyId, globalFocus = false, onSelect }: {
  enterprises: EnterpriseState[];
  selectedId: EnterpriseId;
  meeting: boolean;
  labelMode?: 'card' | 'compact';
  focusOnlyId?: EnterpriseId;
  globalFocus?: boolean;
  onSelect: (id: EnterpriseId) => void;
}) {
  return (
    <group position={[0, -0.27, -5.35]}>
      {enterprises.map((enterprise, index) => {
        // Global-focus suppresses the table selection treatment during the stage
        // briefing, but a 1v1 meeting must always keep its selected representative.
        const selected = enterprise.id === selectedId && (meeting || !globalFocus);
        if (focusOnlyId && enterprise.id !== focusOnlyId) return null;
        if (meeting && !selected) return null;
        const profile = getEnterprise(enterprise.id);
        const visualPalette = getEnterpriseTheme(enterprise.id);
        const identityStyle = enterpriseThemeStyle(enterprise.id);
        return (
          <group key={enterprise.id} position={[seatPosition(index, enterprises.length), 0, 0]}>
            {meeting && selected && <RepresentativeFocusDisc accent={visualPalette.accent} />}
            <SeatedBusinessRepresentative enterpriseId={enterprise.id} selected={selected} onSelect={() => onSelect(enterprise.id)} />
            {labelMode && <Html
              center
              position={[0, labelMode === 'card' ? 2.3 : 2.02, 0]}
              distanceFactor={labelMode === 'compact' ? 11 : undefined}
              occlude={labelMode === 'compact'}
            >
              <button
                className={`${labelMode === 'card' ? 'table-enterprise-plaque table-seat-plaque table-seat-anchor' : 'seat-label'} enterprise-identity ${selected ? 'active' : ''}`}
                style={identityStyle}
                onPointerDown={(event) => { event.stopPropagation(); onSelect(enterprise.id); }}
                onClick={(event) => { event.stopPropagation(); onSelect(enterprise.id); }}
              >
                <FrameCorners inset />
                <small>企业 {enterprise.code}{labelMode === 'compact' ? ` · ${profile.industry}` : ''}</small>
                {labelMode === 'card' && <strong>{profile.industry}</strong>}
                <span>{enterprise.allocation > 0 ? `政府投入 ${enterprise.allocation} 点` : `资金请求 ${profile.request} 点`}</span>
              </button>
            </Html>}
          </group>
        );
      })}
    </group>
  );
}

type ResourcePieceKind = 'coin' | 'coinPile' | 'queen' | 'king' | 'generator' | 'gears';

const RESOURCE_MODEL_URLS: Record<ResourcePieceKind, string> = {
  coin: COIN_URL,
  coinPile: COIN_PILE_URL,
  queen: CHESS_QUEEN_URL,
  king: CHESS_KING_URL,
  generator: GENERATOR_URL,
  gears: GEARS_URL,
};

const RESOURCE_PIECE_SIZES: Record<ResourcePieceKind, number> = {
  coin: 0.46,
  coinPile: 0.56,
  queen: 0.64,
  king: 0.68,
  generator: 0.5,
  gears: 0.58,
};

const RESOURCE_PIECE_TINTS: Record<ResourcePieceKind, { color: string; strength: number }> = {
  coin: { color: '#e0ad45', strength: 0.45 },
  coinPile: { color: '#e0ad45', strength: 0.45 },
  queen: { color: '#9b86c2', strength: 0.68 },
  king: { color: '#8571ad', strength: 0.68 },
  generator: { color: '#6f9999', strength: 0.28 },
  gears: { color: '#d78550', strength: 0.82 },
};

function NormalizedResourceModel({ kind }: { kind: ResourcePieceKind }) {
  const { scene } = useGLTF(RESOURCE_MODEL_URLS[kind]);
  const normalized = useMemo(() => {
    const model = cloneSkeleton(scene);
    model.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(model);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const largestDimension = Math.max(size.x, size.y, size.z) || 1;
    const tint = RESOURCE_PIECE_TINTS[kind];
    const bakeLargeOrigin = largestDimension > 1000;

    model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      if (bakeLargeOrigin) {
        object.geometry = object.geometry.clone();
        object.geometry.translate(-center.x, -bounds.min.y, -center.z);
      }
      object.castShadow = true;
      object.receiveShadow = true;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      const styledMaterials = materials.map((sourceMaterial) => {
        const material = sourceMaterial.clone();
        if ('color' in material && material.color instanceof THREE.Color) {
          material.color.lerp(new THREE.Color(tint.color), tint.strength);
        }
        if (material instanceof THREE.MeshStandardMaterial) {
          if (kind === 'coin' || kind === 'coinPile' || kind === 'gears') material.metalness = 0.68;
          material.roughness = kind === 'coin' || kind === 'coinPile' ? 0.3 : 0.48;
        }
        return material;
      });
      object.material = Array.isArray(object.material) ? styledMaterials : styledMaterials[0];
    });

    return {
      model,
      scale: RESOURCE_PIECE_SIZES[kind] / largestDimension,
      offset: bakeLargeOrigin
        ? new THREE.Vector3(0, 0, 0)
        : new THREE.Vector3(-center.x, -bounds.min.y, -center.z),
    };
  }, [kind, scene]);

  return (
    <group scale={normalized.scale}>
      <primitive object={normalized.model} position={normalized.offset} />
    </group>
  );
}

function ResourcePiece({ kind, position, rotation = [0, 0, 0], active }: {
  kind: ResourcePieceKind;
  position: [number, number, number];
  rotation?: [number, number, number];
  active: boolean;
}) {
  const group = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (!group.current) return;
    const ease = 1 - Math.exp(-delta * 8);
    const targetScale = active ? 1 : 0.02;
    const nextScale = THREE.MathUtils.lerp(group.current.scale.x, targetScale, ease);
    group.current.scale.setScalar(nextScale);
    group.current.position.z = THREE.MathUtils.lerp(
      group.current.position.z,
      active ? position[2] : position[2] - 0.82,
      ease,
    );
  });

  return (
    <group
      ref={group}
      position={[position[0], position[1] + (kind === 'gears' ? 0.1 : 0), position[2] + 0.42]}
      rotation={rotation}
      scale={0.02}
    >
      <NormalizedResourceModel kind={kind} />
    </group>
  );
}

function resourceLevel(value: number) {
  if (value <= 0) return 0;
  return Math.min(6, Math.ceil(value / (100 / 6)));
}

const PIECE_SLOTS: Array<[number, number, number]> = [
  [-0.33, 0.19, -0.17],
  [0, 0.19, -0.17],
  [0.33, 0.19, -0.17],
  [-0.33, 0.19, 0.2],
  [0, 0.19, 0.2],
  [0.33, 0.19, 0.2],
];

function kindsForResource(resource: 'capital' | 'talent' | 'infrastructure' | 'supplyChain', level: number) {
  if (resource === 'capital') {
    return (['coin', 'coin', 'coin', 'coinPile', 'coinPile', 'coinPile'] as ResourcePieceKind[]).slice(0, level);
  }
  if (resource === 'talent') {
    return Array.from({ length: level }, (_, index) => index % 2 === 0 ? 'queen' : 'king');
  }
  return Array.from({ length: level }, () => resource === 'infrastructure' ? 'generator' : 'gears');
}

type TableResourceKey = 'capital' | 'talent' | 'infrastructure' | 'supplyChain';

function ResourceStation({ x, resource, label, value, accent }: {
  x: number;
  resource: TableResourceKey;
  label: string;
  value: number;
  accent: string;
}) {
  const level = resourceLevel(value);
  const [renderedLevel, setRenderedLevel] = useState(level);
  const [activeLevel, setActiveLevel] = useState(level);

  useEffect(() => {
    if (level >= renderedLevel) {
      setRenderedLevel(level);
      setActiveLevel(level);
      return;
    }

    setActiveLevel(level);
    const removalTimer = window.setTimeout(() => setRenderedLevel(level), 650);
    return () => window.clearTimeout(removalTimer);
  }, [level, renderedLevel]);

  const kinds = kindsForResource(resource, renderedLevel);
  return (
    <group position={[x, 0, 0]} rotation={[0, 0, x * 0.008]}>
      <RoundedBox args={[1.32, 0.14, 1.02]} radius={0.09} smoothness={4} position={[0, 0.05, 0.02]} castShadow receiveShadow>
        <meshStandardMaterial color="#263330" roughness={0.62} metalness={0.24} />
      </RoundedBox>
      <RoundedBox args={[1.25, 0.032, 0.95]} radius={0.07} smoothness={3} position={[0, 0.132, 0.015]} receiveShadow>
        <meshStandardMaterial color={accent} roughness={0.48} metalness={0.4} />
      </RoundedBox>
      <RoundedBox args={[1.13, 0.022, 0.82]} radius={0.055} smoothness={3} position={[0, 0.16, 0.01]} receiveShadow>
        <meshStandardMaterial color="#14211f" roughness={0.82} metalness={0.1} />
      </RoundedBox>
      {Array.from({ length: 6 }, (_, index) => (
        <mesh key={`pip-${index}`} position={[-0.39 + index * 0.156, 0.185, 0.36]}>
          <sphereGeometry args={[0.027, 16, 10]} />
          <meshStandardMaterial
            color={index < level ? '#dcc493' : '#2c3b38'}
            emissive={index < level ? accent : '#000000'}
            emissiveIntensity={index < level ? 0.42 : 0}
            roughness={0.45}
            metalness={0.36}
          />
        </mesh>
      ))}
      {kinds.map((kind, index) => (
        <ResourcePiece
          key={`${kind}-${index}`}
          kind={kind}
          position={PIECE_SLOTS[index]}
          rotation={kind === 'coin' ? [Math.PI / 2, 0, index * 0.28] : [0, index * 0.38, 0]}
          active={index < activeLevel}
        />
      ))}
      <Html center position={[0, 0.9, 0]} distanceFactor={13}>
        <span className="piece-label resource-piece-label" style={{ borderColor: accent }}>{label} · {Math.round(value)}</span>
      </Html>
    </group>
  );
}

function PolicyPieces({ resources }: { resources: CityResources }) {
  const stations = [
    { x: -2.22, resource: 'capital', label: '资本', value: resources.fiscal, accent: '#a8793e' },
    { x: -0.74, resource: 'infrastructure', label: '基建', value: resources.infrastructure, accent: '#487978' },
    { x: 0.74, resource: 'talent', label: '人才', value: resources.talent, accent: '#6a5988' },
    { x: 1.9, resource: 'supplyChain', label: '产业链', value: resources.supplyChain, accent: '#9a5936' },
  ] as const;

  return (
    <group position={[0, 0.34, 3.0]}>
      {stations.map((station) => <ResourceStation key={station.resource} {...station} />)}
    </group>
  );
}

export function TableScene({ mode, enterprises, resources, mapSnapshot, mapCanvas, selectedId, onEnterpriseSelect, introFocus, introMinimal = false, globalFocus = false }: {
  mode: CameraMode;
  enterprises: EnterpriseState[];
  resources: CityResources;
  mapSnapshot: MapSnapshot;
  mapCanvas: HTMLCanvasElement | null;
  selectedId: EnterpriseId;
  onEnterpriseSelect: (id: EnterpriseId) => void;
  introFocus?: EnterpriseId | 'overview';
  introMinimal?: boolean;
  globalFocus?: boolean;
}) {
  const orderedEnterprises = useMemo(
    () => [...enterprises].sort((left, right) => enterpriseSeatIndex(left.id) - enterpriseSeatIndex(right.id)),
    [enterprises],
  );

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
      <Suspense fallback={null}><PanoramaRoom /></Suspense>
      <group>
          <RoundedBox args={[14, 0.5, 9]} radius={0.22} smoothness={5} position={[0, 0, 0]} castShadow receiveShadow>
            <meshStandardMaterial color="#2a2b28" roughness={0.8} metalness={0.06} />
          </RoundedBox>
          <RoundedBox args={[13.4, 0.08, 8.4]} radius={0.2} smoothness={4} position={[0, 0.29, 0]} receiveShadow>
            <meshStandardMaterial color="#192c29" roughness={0.88} />
          </RoundedBox>
          <Suspense fallback={null}><TableMapDiorama snapshot={mapSnapshot} mapCanvas={mapCanvas} /></Suspense>
          <Suspense fallback={null}><EnterpriseSeats
              enterprises={orderedEnterprises}
              selectedId={selectedId}
              meeting={mode === 'meeting'}
              labelMode={!introMinimal && mode === 'table' ? 'card' : mode === 'panorama' ? 'compact' : undefined}
              focusOnlyId={introFocus && introFocus !== 'overview' ? introFocus : undefined}
              globalFocus={globalFocus}
              onSelect={onEnterpriseSelect}
            /></Suspense>
          {!introMinimal && <Suspense fallback={null}><PolicyPieces resources={resources} /></Suspense>}
          {!introMinimal && <Html center position={[0, 0.65, 3.7]} distanceFactor={12}>
            <div className="government-plaque"><small>PLAYER</small><strong>合肥市政府</strong></div>
          </Html>}
        </group>
      <CameraRig
        mode={mode}
        selectedId={selectedId}
        enterpriseIds={orderedEnterprises.map((enterprise) => enterprise.id)}
        introFocus={introFocus}
      />
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
useGLTF.preload(COIN_URL);
useGLTF.preload(COIN_PILE_URL);
useGLTF.preload(CHESS_QUEEN_URL);
useGLTF.preload(CHESS_KING_URL);
useGLTF.preload(GENERATOR_URL);
useGLTF.preload(GEARS_URL);
