import { useEffect, useMemo, useRef, useState } from 'react'
import { NearCoordinates } from 'react-three-map/maplibre'
import type { MapSnapshot } from '../../packages/contracts/src'
import { MapProjectParcel } from '../../packages/map-visuals/src/MapProjectLayer'
import { deriveMapScene, type SceneTransition } from '../../packages/map-visuals/src/scene'
import { placeMapSceneOnGeo } from './geoLayout'

export function GeoMapProjectLayer({
  snapshot,
  skipToken,
  onProjectSelect,
  onTransitionStateChange,
}: {
  snapshot: MapSnapshot
  skipToken: number
  onProjectSelect: (projectId: string) => void
  onTransitionStateChange: (active: boolean, remaining: number) => void
}) {
  const previousSnapshot = useRef(snapshot)
  const [queue, setQueue] = useState<SceneTransition[]>([])
  const scene = useMemo(() => deriveMapScene(snapshot), [snapshot])
  const geoParcels = useMemo(() => placeMapSceneOnGeo(scene.parcels), [scene.parcels])

  useEffect(() => {
    const transitions = deriveMapScene(snapshot, previousSnapshot.current).transitionQueue
    previousSnapshot.current = snapshot
    if (transitions.length) setQueue(transitions)
  }, [snapshot])

  useEffect(() => {
    onTransitionStateChange(queue.length > 0, queue.length)
    if (!queue.length) return
    const timer = window.setTimeout(() => setQueue((current) => current.slice(1)), queue[0].durationMs)
    return () => window.clearTimeout(timer)
  }, [onTransitionStateChange, queue])

  useEffect(() => {
    if (skipToken > 0) setQueue([])
  }, [skipToken])

  const activeTransition = queue[0]
  return geoParcels.map(({ parcel, anchor }) => (
    <NearCoordinates key={parcel.id} latitude={anchor.latitude} longitude={anchor.longitude}>
      <group scale={anchor.scale} rotation={[0, anchor.rotation, 0]}>
        <MapProjectParcel
          parcel={{ ...parcel, slot: { ...parcel.slot, rotation: 0 } }}
          transition={activeTransition?.projectId === parcel.id ? activeTransition : undefined}
          onSelect={onProjectSelect}
        />
      </group>
    </NearCoordinates>
  ))
}
