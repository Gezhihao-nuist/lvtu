import { useEffect, useRef, useState } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Compass } from 'lucide-react'
import {
  BEIJING,
  geocodeCity,
  isAmapAvailable,
  loadAmap,
  type AMapMapInstance,
  type AMapMarker,
  type AMapNamespace,
  type AMapPolyline,
} from '../../lib/amap'
import type { ItineraryItem, TripDay } from '../../types'
import { ITEM_TYPE_META } from './item-meta'

interface MapViewProps {
  day: TripDay | undefined
  destination: string
  hoveredItemId: string | null
}

type CoordItem = ItineraryItem & { lng: number; lat: number }

function withCoords(day: TripDay | undefined): CoordItem[] {
  return (day?.items ?? [])
    .filter((i): i is CoordItem => i.lng != null && i.lat != null)
    .sort((a, b) => a.orderIndex - b.orderIndex)
}

/** 自定义 marker:圆形白底 + 类型图标 + 序号 */
function markerHtml(item: CoordItem, index: number, active: boolean): string {
  const meta = ITEM_TYPE_META[item.type] ?? ITEM_TYPE_META.SPOT
  const Icon = meta.icon
  return renderToStaticMarkup(
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        background: '#ffffff',
        borderRadius: 9999,
        padding: '4px 10px 4px 5px',
        border: active ? `2px solid ${meta.hex}` : '2px solid rgba(0,0,0,0.06)',
        boxShadow: active
          ? '0 10px 24px -6px rgb(0 0 0 / 0.28)'
          : '0 2px 8px rgb(0 0 0 / 0.14)',
        transform: active ? 'scale(1.15)' : 'scale(1)',
        transition: 'transform 0.2s cubic-bezier(0.16,1,0.3,1), box-shadow 0.2s',
        transformOrigin: 'bottom center',
        cursor: 'default',
      }}
    >
      <span
        style={{
          display: 'flex',
          width: 20,
          height: 20,
          borderRadius: 9999,
          background: meta.bgHex,
          color: meta.hex,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon size={12} strokeWidth={2.4} />
      </span>
      <span
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: '#18181b',
          fontVariantNumeric: 'tabular-nums',
          lineHeight: 1,
        }}
      >
        {index + 1}
      </span>
    </div>,
  )
}

function MapPlaceholder({ day }: { day: TripDay | undefined }) {
  const coordItems = withCoords(day)
  return (
    <div className="flex size-full flex-col items-center justify-center gap-3 bg-zinc-100/50 p-8 text-center">
      <div className="flex size-12 items-center justify-center rounded-2xl bg-white shadow-card">
        <Compass className="size-6 text-zinc-400" />
      </div>
      <p className="text-sm font-medium text-zinc-700">配置高德 Key 后显示地图</p>
      <p className="-mt-1 text-xs text-zinc-500">在 web/.env 填入 VITE_AMAP_JS_KEY 即可开启</p>
      {coordItems.length > 0 && (
        <div className="mt-3 w-full max-w-xs space-y-1.5 text-left">
          {coordItems.map((item, i) => (
            <div
              key={item.id}
              className="flex items-center gap-2.5 rounded-xl bg-white px-3 py-2 text-xs shadow-card"
            >
              <span className="tnum flex size-5 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-[11px] font-medium text-zinc-600">
                {i + 1}
              </span>
              <span className="truncate font-medium text-zinc-700">{item.title}</span>
              <span className="tnum ml-auto shrink-0 text-zinc-400">
                {item.lng.toFixed(3)}, {item.lat.toFixed(3)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function MapView({ day, destination, hoveredItemId }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const amapRef = useRef<AMapNamespace | null>(null)
  const mapRef = useRef<AMapMapInstance | null>(null)
  const markersRef = useRef<Array<{ id: string; item: CoordItem; index: number; marker: AMapMarker }>>([])
  const polylineRef = useRef<AMapPolyline | null>(null)
  const [mapReady, setMapReady] = useState(false)
  const [loadError, setLoadError] = useState('')

  const coordItems = withCoords(day)
  const coordKey = coordItems.map((i) => `${i.id}:${i.lng},${i.lat}:${i.orderIndex}`).join('|')

  // 初始化地图(一次)
  useEffect(() => {
    if (!isAmapAvailable) return
    let cancelled = false
    loadAmap()
      .then((AMap) => {
        if (cancelled || !containerRef.current) return
        amapRef.current = AMap
        mapRef.current = new AMap.Map(containerRef.current, {
          viewMode: '2D',
          zoom: 11,
          center: BEIJING,
        })
        setMapReady(true)
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : '地图加载失败')
      })
    return () => {
      cancelled = true
      mapRef.current?.destroy()
      mapRef.current = null
      amapRef.current = null
    }
  }, [])

  // 天切换 / 条目变化时重绘 marker 与连线
  useEffect(() => {
    const AMap = amapRef.current
    const map = mapRef.current
    if (!mapReady || !AMap || !map) return

    for (const { marker } of markersRef.current) marker.setMap(null)
    markersRef.current = []
    polylineRef.current?.setMap(null)
    polylineRef.current = null

    const markers = coordItems.map((item, index) => {
      const marker = new AMap.Marker({
        position: [item.lng, item.lat],
        content: markerHtml(item, index, false),
        anchor: 'bottom-center',
        zIndex: 100,
      })
      marker.setMap(map)
      return { id: item.id, item, index, marker }
    })
    markersRef.current = markers

    if (coordItems.length > 1) {
      const line = new AMap.Polyline({
        path: coordItems.map((i) => [i.lng, i.lat]),
        strokeColor: '#0d9488',
        strokeWeight: 4,
        strokeOpacity: 0.7,
        lineJoin: 'round',
        lineCap: 'round',
      })
      line.setMap(map)
      polylineRef.current = line
      map.setFitView([...markers.map((m) => m.marker), line], false, [48, 48, 48, 48])
    } else if (coordItems.length === 1) {
      const only = coordItems[0]
      if (only) {
        map.setCenter([only.lng, only.lat])
        map.setZoom(14)
      }
    } else {
      // 当天没有坐标点:回退到目的地城市,再不行北京
      void geocodeCity(AMap, destination).then((center) => {
        map.setCenter(center)
        map.setZoom(11)
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, coordKey, day?.id, destination])

  // hover 联动:高亮 + 弹跳
  useEffect(() => {
    for (const { id, item, index, marker } of markersRef.current) {
      const active = id === hoveredItemId
      marker.setContent(markerHtml(item, index, active))
      marker.setzIndex?.(active ? 120 : 100)
      if (active) {
        marker.setAnimation?.('AMAP_ANIMATION_BOUNCE')
        const m = marker
        setTimeout(() => m.setAnimation?.('AMAP_ANIMATION_NONE'), 800)
      }
    }
  }, [hoveredItemId])

  if (!isAmapAvailable) return <MapPlaceholder day={day} />

  if (loadError) {
    return (
      <div className="flex size-full flex-col items-center justify-center gap-2 bg-zinc-100/50 p-8 text-center">
        <Compass className="size-6 text-zinc-400" />
        <p className="text-sm text-zinc-500">{loadError},请刷新重试</p>
      </div>
    )
  }

  return (
    <div className="relative size-full">
      <div ref={containerRef} className="size-full" aria-label="行程地图" role="application" />
      {!mapReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-100/50">
          <p className="flex items-center gap-2 text-sm text-zinc-500">
            <span className="size-4 animate-spin rounded-full border-2 border-zinc-200 border-t-accent-600" />
            地图加载中…
          </p>
        </div>
      )}
    </div>
  )
}
