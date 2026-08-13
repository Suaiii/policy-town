import type { MapSnapshot, MapVisualEvent } from '../../../packages/contracts/src'

const clamp = (value: number) => Math.max(0, Math.min(100, value))

export function applyMapEvents(snapshot: MapSnapshot, events: MapVisualEvent[]): MapSnapshot {
  return events.reduce<MapSnapshot>((current, event) => {
    if (event.type === 'FACTORY_STAGE_CHANGED') {
      return {
        ...current,
        projects: current.projects.map((project) =>
          project.id === event.entityId
            ? { ...project, stage: event.stage, progress: clamp(event.progress) }
            : project,
        ),
      }
    }

    if (event.type === 'CROWD_DENSITY_CHANGED') {
      return {
        ...current,
        city: { ...current.city, employmentIndex: clamp(event.value) },
        projects: current.projects.map((project) =>
          project.districtId === event.districtId
            ? { ...project, employment: clamp(event.value) }
            : project,
        ),
      }
    }

    if (event.type === 'LOGISTICS_FLOW_CHANGED') {
      return {
        ...current,
        city: { ...current.city, logisticsIndex: clamp(event.value) },
        projects: current.projects.map((project) =>
          project.districtId === event.districtId
            ? { ...project, logistics: clamp(event.value) }
            : project,
        ),
      }
    }

    return {
      ...current,
      city: { ...current.city, gridPressure: clamp(event.value) },
    }
  }, snapshot)
}
