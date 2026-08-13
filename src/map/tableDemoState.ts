import {
  MAP_CONTRACT_VERSION,
  type MapSnapshot,
  type ProjectArchetype,
  type PhysicalAssetVisualState,
  type ProjectStage,
} from '../../packages/contracts/src'

const assetRoles = ['main', 'support', 'warehouse', 'utility'] as const

function demoAssets(stage: ProjectStage, progress: number, count = 1, verticalLevel = 1): PhysicalAssetVisualState[] {
  return Array.from({ length: Math.min(4, count) }, (_, slotIndex) => {
    const planned = stage === 'proposal'
    const stopped = stage === 'stalled'
    const exited = stage === 'exited'
    const complete = stage === 'operating' || (verticalLevel > 1 && slotIndex === 0)
    return {
      id: `asset-${slotIndex + 1}`,
      role: assetRoles[slotIndex],
      slotIndex,
      currentLevel: complete ? verticalLevel : 0,
      targetLevel: verticalLevel,
      workProgress: complete || planned ? 0 : progress,
      status: exited ? 'abandoned' : stopped ? 'paused' : complete ? 'complete' : planned ? 'planned' : 'building',
      createdStage: 'S1',
      decisionId: `demo-${stage}-${slotIndex + 1}`,
    }
  })
}

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
        physicalAssets: {
          developmentUnitCost: 42,
          qualifiedCapital: 42,
          capitalRemainder: 0,
          overflowUnits: 0,
          constructionDelta: stage === 'construction' || stage === 'ramp' ? values.progress : 0,
          assets: demoAssets(stage, values.progress),
        },
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
        physicalAssets: {
          developmentUnitCost: 34,
          qualifiedCapital: 136,
          capitalRemainder: 0,
          overflowUnits: 0,
          constructionDelta: 0,
          assets: demoAssets('operating', 100, 4),
        },
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
        physicalAssets: {
          developmentUnitCost: 26,
          qualifiedCapital: 52,
          capitalRemainder: 0,
          overflowUnits: 0,
          constructionDelta: 16,
          assets: demoAssets('ramp', 76, 2),
        },
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
        physicalAssets: {
          developmentUnitCost: 25,
          qualifiedCapital: 25 * (index + 1),
          capitalRemainder: 0,
          overflowUnits: 0,
          constructionDelta: stage === 'construction' || stage === 'ramp' ? values.progress : 0,
          assets: demoAssets(stage, values.progress, Math.min(4, 1 + (index % 4))),
        },
        delta: { progress: 0, employment: 0, logistics: 0 },
        position: { x: positions[index][0], y: positions[index][1] },
      }
    }),
  }
}

export function createFullCityDemoSnapshot(revision = 0): MapSnapshot {
  const base = createCapacityDemoSnapshot(revision)
  return {
    ...base,
    simulationId: 'map-nine-parcel-full-city-demo',
    simulationDate: '2016 · Q4',
    city: {
      employmentIndex: 94,
      logisticsIndex: 91,
      gridPressure: 82,
      fiscalPressure: 68,
    },
    projects: base.projects.map((project, index) => ({
      ...project,
      name: `满载产业地块 ${String(index + 1).padStart(2, '0')}`,
      stage: 'operating',
      lifecycle: 'active',
      progress: 100,
      builtProgress: 100,
      employment: 78 + (index % 3) * 6,
      logistics: 76 + (index % 4) * 5,
      risk: 24 + (index % 3) * 6,
      physicalAssets: {
        developmentUnitCost: 25,
        qualifiedCapital: 350,
        capitalRemainder: 0,
        overflowUnits: 2,
        constructionDelta: 0,
        assets: demoAssets('operating', 100, 4, 3),
      },
      delta: { progress: 0, employment: 0, logistics: 0 },
    })),
  }
}

export function createGrowthDemoSnapshot(mode: 'planned' | 'horizontal' | 'vertical' | 'overflow', revision = 0): MapSnapshot {
  const base = createDemoSnapshot('operating', revision)
  const project = base.projects[0]
  const unitCounts = { planned: 1, horizontal: 4, vertical: 8, overflow: 14 }
  const units = unitCounts[mode]
  const assetCount = Math.min(4, units)
  const assets = Array.from({ length: assetCount }, (_, slotIndex): PhysicalAssetVisualState => {
    const targetLevel = Math.min(3, Math.ceil((Math.min(12, units) - slotIndex) / 4))
    return {
      id: `asset-${slotIndex + 1}`,
      role: assetRoles[slotIndex],
      slotIndex,
      currentLevel: mode === 'planned' ? 0 : targetLevel,
      targetLevel,
      workProgress: 0,
      status: mode === 'planned' ? 'planned' : 'complete',
      createdStage: 'S2',
      decisionId: `growth-${mode}-${slotIndex + 1}`,
    }
  })
  return {
    ...base,
    simulationId: `map-growth-${mode}`,
    projects: [{
      ...project,
      stage: mode === 'planned' ? 'proposal' : 'operating',
      progress: mode === 'planned' ? 4 : 100,
      builtProgress: mode === 'planned' ? 0 : 100,
      physicalAssets: {
        developmentUnitCost: 25,
        qualifiedCapital: units * 25,
        capitalRemainder: 0,
        overflowUnits: Math.max(0, units - 12),
        constructionDelta: 0,
        assets,
      },
    }],
  }
}
