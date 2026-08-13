import type { MapSnapshot } from '../../packages/contracts/src'
import { TableTownWorld } from './TableTownWorld'

/** The city model now belongs exclusively to the meeting-table sandbox. */
export function TableMapDiorama({ snapshot }: {
  snapshot: MapSnapshot
  mapCanvas: HTMLCanvasElement | null
}) {
  return (
    <group position={[0, 0.37, -0.34]} scale={0.67}>
      <TableTownWorld snapshot={snapshot} projectScale={0.54} />
    </group>
  )
}
