import { useCallback, useEffect, useMemo, useRef } from 'react'
import * as maplibregl from 'maplibre-gl'
import mapLibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import Map, { type MapRef } from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'
import { HEFEI_MAP_STYLE } from './mapStyle'

maplibregl.setWorkerUrl(mapLibreWorkerUrl)

const TABLE_TEXTURE_CAMERA = {
  longitude: 117.24,
  latitude: 31.83,
  zoom: 10.05,
  pitch: 20,
  bearing: -8,
} as const

export function TableMapSurface({ onCanvasReady }: {
  onCanvasReady: (canvas: HTMLCanvasElement) => void
}) {
  const mapRef = useRef<MapRef>(null)
  const textureCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const localMapStyle = useMemo(() => structuredClone(HEFEI_MAP_STYLE), [])

  const publishCanvas = useCallback(() => {
    const source = mapRef.current?.getMap().getCanvas()
    if (!source || source.width === 0 || source.height === 0) return
    if (!textureCanvasRef.current) textureCanvasRef.current = document.createElement('canvas')
    const textureCanvas = textureCanvasRef.current
    if (textureCanvas.width !== source.width || textureCanvas.height !== source.height) {
      textureCanvas.width = source.width
      textureCanvas.height = source.height
    }
    const context = textureCanvas.getContext('2d')
    if (!context) return
    context.clearRect(0, 0, textureCanvas.width, textureCanvas.height)
    context.drawImage(source, 0, 0, textureCanvas.width, textureCanvas.height)
    onCanvasReady(textureCanvas)
  }, [onCanvasReady])

  useEffect(() => {
    const timer = window.setInterval(publishCanvas, 160)
    return () => window.clearInterval(timer)
  }, [publishCanvas])

  return (
    <div className="table-map-texture-source-shell" aria-hidden="true">
      <div className="table-map-texture-source">
        <Map
          ref={mapRef}
          mapLib={maplibregl}
          initialViewState={TABLE_TEXTURE_CAMERA}
          mapStyle={localMapStyle}
          attributionControl={false}
          interactive={false}
          canvasContextAttributes={{ antialias: true, alpha: false, preserveDrawingBuffer: true }}
          onLoad={publishCanvas}
          onRender={publishCanvas}
          onError={(event) => console.error('[hefei-map]', event.error)}
        />
      </div>
    </div>
  )
}
