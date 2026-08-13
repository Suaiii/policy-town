import {
  MAP_CONTRACT_VERSION,
  type MapSnapshot,
  type ProjectArchetype,
  type ProjectStage,
} from '../../../packages/contracts/src'

const stageValues: Record<
  ProjectStage,
  Pick<MapSnapshot['projects'][number], 'progress' | 'builtProgress' | 'employment' | 'logistics' | 'risk'>
> = {
  proposal: { progress: 4, builtProgress: 4, employment: 8, logistics: 5, risk: 28 },
  construction: { progress: 46, builtProgress: 46, employment: 38, logistics: 31, risk: 42 },
  ramp: { progress: 78, builtProgress: 78, employment: 64, logistics: 58, risk: 36 },
  operating: { progress: 100, builtProgress: 100, employment: 86, logistics: 82, risk: 24 },
  stalled: { progress: 48, builtProgress: 52, employment: 25, logistics: 13, risk: 82 },
  exited: { progress: 31, builtProgress: 35, employment: 5, logistics: 3, risk: 95 },
}

export function createDemoSnapshot(stage: ProjectStage = 'construction', revision = 0, previous?: MapSnapshot): MapSnapshot {
  const values = stageValues[stage]
  const stressed = stage === 'stalled' || stage === 'exited'

  const snapshot: MapSnapshot = {
    schemaVersion: MAP_CONTRACT_VERSION,
    simulationId: 'map-standalone-demo',
    simulationDate: '2008 · Q4',
    revision,
    city: {
      employmentIndex: Math.round(24 + values.employment * 0.68),
      logisticsIndex: values.logistics,
      gridPressure: stage === 'operating' ? 73 : stage === 'ramp' ? 58 : 34,
      fiscalPressure: stressed ? 78 : stage === 'construction' ? 55 : 38,
    },
    projects: [
      {
        id: 'display-industrial-base',
        name: '新型显示产业基地',
        industry: '新型显示',
        districtId: 'xinzhan',
        stage,
        archetype: 'heavy-manufacturing',
        lifecycle: stage === 'exited' ? 'exited' : stage === 'stalled' ? 'stalled' : 'active',
        ...values,
        delta: { progress: 0, employment: 0, logistics: 0 },
        position: { x: 0.64, y: 0.30 },
      },
      {
        id: 'new-energy-vehicle-cluster',
        name: '新能源汽车产业集群',
        industry: '新能源汽车',
        districtId: 'jingkai',
        stage: 'operating',
        archetype: 'energy-manufacturing',
        lifecycle: 'active',
        progress: 100,
        builtProgress: 100,
        employment: 72,
        logistics: 66,
        risk: 24,
        delta: { progress: 0, employment: 0, logistics: 0 },
        position: { x: 0.28, y: 0.67 },
      },
      {
        id: 'quantum-innovation-center',
        name: '量子信息创新中心',
        industry: '量子信息',
        districtId: 'gaoxin',
        stage: 'ramp',
        archetype: 'rd-pilot',
        lifecycle: 'active',
        progress: 76,
        builtProgress: 76,
        employment: 34,
        logistics: 18,
        risk: 31,
        delta: { progress: 0, employment: 0, logistics: 0 },
        position: { x: 0.25, y: 0.33 },
      },
    ],
  }
  if (!previous) return snapshot
  const previousById = new Map(previous.projects.map((project) => [project.id, project]))
  return {
    ...snapshot,
    projects: snapshot.projects.map((project) => {
      const before = previousById.get(project.id)
      return {
        ...project,
        delta: before ? {
          progress: project.progress - before.progress,
          employment: project.employment - before.employment,
          logistics: project.logistics - before.logistics,
        } : project.delta,
      }
    }),
  }
}

export function createCapacityDemoSnapshot(revision = 0): MapSnapshot {
  const base = createDemoSnapshot('construction', revision)
  const archetypes: ProjectArchetype[] = [
    'heavy-manufacturing', 'energy-manufacturing', 'rd-pilot',
    'energy-manufacturing', 'rd-pilot', 'heavy-manufacturing',
    'rd-pilot', 'heavy-manufacturing', 'energy-manufacturing',
  ]
  const stages: ProjectStage[] = [
    'proposal', 'construction', 'construction',
    'ramp', 'operating', 'construction',
    'stalled', 'ramp', 'operating',
  ]
  const positions = [
    [0.16, 0.22], [0.42, 0.20], [0.66, 0.27],
    [0.24, 0.48], [0.50, 0.47], [0.73, 0.50],
    [0.16, 0.74], [0.42, 0.76], [0.65, 0.70],
  ] as const
  const industries: Record<ProjectArchetype, string> = {
    'heavy-manufacturing': '先进制造',
    'energy-manufacturing': '新能源制造',
    'rd-pilot': '装备研发中试',
  }

  return {
    ...base,
    simulationId: 'map-nine-parcel-capacity-demo',
    projects: stages.map((stage, index) => {
      const values = stageValues[stage]
      return {
        id: `anonymous-capacity-project-${index + 1}`,
        name: `匿名项目地块 ${String(index + 1).padStart(2, '0')}`,
        industry: industries[archetypes[index]],
        districtId: `capacity-zone-${index + 1}`,
        stage,
        archetype: archetypes[index],
        lifecycle: stage === 'exited' ? 'exited' as const : stage === 'stalled' ? 'stalled' as const : 'active' as const,
        ...values,
        delta: { progress: 0, employment: 0, logistics: 0 },
        position: { x: positions[index][0], y: positions[index][1] },
      }
    }),
  }
}
