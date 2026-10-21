import { useEffect, useRef, useState } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { CarFront, CloudSun, Compass } from 'lucide-react'
import {
  BEIJING,
  geocodeCity,
  isAmapAvailable,
  loadAmap,
  type AMapDriving,
  type AMapMapInstance,
  type AMapMarker,
  type AMapNamespace,
  type AMapPolyline,
} from '../../lib/amap'
import { api } from '../../lib/api'
import { cn } from '../../lib/utils'
import type { ItineraryItem, TripDay, WeatherCast } from '../../types'
import { ITEM_TYPE_META } from './item-meta'
import { weatherIcon } from './weather-icon'

interface MapViewProps {
  day: TripDay | undefined
  destination: string
  hoveredItemId: string | null
  /** 行程目的地天气预报(当天 + 未来 3 天);不传则天气浮层不显示数据 */
  weatherCasts?: WeatherCast[]
  /** 点击左侧卡片要求聚焦的条目 id(变化时平滑移动视野过去) */
  focusItemId?: string | null
}

type CoordItem = ItineraryItem & { lng: number; lat: number }

function withCoords(day: TripDay | undefined): CoordItem[] {
  return (day?.items ?? [])
    .filter((i): i is CoordItem => i.lng != null && i.lat != null)
    .sort((a, b) => a.orderIndex - b.orderIndex)
}

/** 后端 /geo/routes 返回的单段 */
interface RouteSegmentDto {
  distance: number
  duration: number
  polyline: string
  mode: string
  fallback: boolean
}

/** 'lng,lat;lng,lat' → [[lng,lat],…](坏段跳过) */
export function parsePolyline(s: string): [number, number][] {
  const out: [number, number][] = []
  for (const pair of s.split(';')) {
    const [lng, lat] = pair.split(',').map(Number)
    if (Number.isFinite(lng) && Number.isFinite(lat)) out.push([lng, lat])
  }
  return out
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

export function MapView({ day, destination, hoveredItemId, weatherCasts, focusItemId }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const amapRef = useRef<AMapNamespace | null>(null)
  const mapRef = useRef<AMapMapInstance | null>(null)
  const markersRef = useRef<Array<{ id: string; item: CoordItem; index: number; marker: AMapMarker }>>([])
  const polylinesRef = useRef<AMapPolyline[]>([])
  const drivingRef = useRef<AMapDriving | null>(null)
  const routeGenRef = useRef(0)
  const routeCacheRef = useRef(new Map<string, [number, number][][]>())
  const [mapReady, setMapReady] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [routing, setRouting] = useState(false)
  const [showTraffic, setShowTraffic] = useState(false)
  const [showWeather, setShowWeather] = useState(false)

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
    for (const line of polylinesRef.current) line.setMap(null)
    polylinesRef.current = []

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
      map.setFitView(markers.map((m) => m.marker), false, [48, 48, 48, 48])

      // 后端批量路径规划(auto:近=步行,远=驾车),返回真实道路路径,虚线绘制
      const gen = ++routeGenRef.current
      setRouting(true)
      const drawLines = (pathsArr: [number, number][][]) => {
        if (gen !== routeGenRef.current) return
        const currentMap = mapRef.current
        if (!currentMap) return
        const lines = pathsArr.map(
          (path) =>
            new AMap.Polyline({
              path,
              strokeColor: '#0d9488',
              strokeWeight: 4,
              strokeOpacity: 0.75,
              strokeStyle: 'dashed',
              strokeDasharray: [9, 9],
              lineJoin: 'round',
              lineCap: 'round',
              zIndex: 50,
            }),
        )
        for (const line of lines) line.setMap(currentMap)
        polylinesRef.current = lines
      }
      const straightPaths = coordItems
        .slice(0, -1)
        .map((item, idx) => {
          const next = coordItems[idx + 1]
          return next ? ([[item.lng, item.lat], [next.lng, next.lat]] as [number, number][]) : []
        })
        .filter((p) => p.length === 2)

      const cached = routeCacheRef.current.get(coordKey)
      if (cached) {
        drawLines(cached)
        setRouting(false)
      } else {
        void api<{ segments: RouteSegmentDto[] }>('/geo/routes', {
          method: 'POST',
          body: JSON.stringify({
            points: coordItems.map((i) => ({ lng: i.lng, lat: i.lat })),
            mode: 'auto',
          }),
        })
          .then((res) => {
            const pathsArr = res.segments.map((s) => parsePolyline(s.polyline))
            routeCacheRef.current.set(coordKey, pathsArr)
            drawLines(pathsArr)
          })
          .catch(() => {
            // 接口异常时按原始顺序画直线兜底,保证图上始终有关联线
            drawLines(straightPaths)
          })
          .finally(() => {
            if (gen === routeGenRef.current) setRouting(false)
          })
      }
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

  // 点击左侧卡片:平滑聚焦到对应 marker,视野太宽时顺带放大到街区尺度
  useEffect(() => {
    const map = mapRef.current
    if (!mapReady || !map || !focusItemId) return
    const target = coordItems.find((i) => i.id === focusItemId)
    if (!target) return
    if (map.panTo) map.panTo([target.lng, target.lat])
    else map.setCenter([target.lng, target.lat])
    if ((map.getZoom?.() ?? 11) < 13) map.setZoom(13)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusItemId, mapReady, coordKey])

  /**
   * 实时路况开关:只沿「我们的路线」渲染路况——
   * Driving 插件 showTraffic 会把路径本身按实时路况染成绿/黄/红,
   * 作为底层实色衬底;我们的青色虚线路径压在上层,两者一眼区分。
   * 不缓存:路况是实时数据,每次开启都重新查询;关闭/切天时 clear 移除。
   */
  useEffect(() => {
    const AMap = amapRef.current
    const map = mapRef.current
    if (!mapReady || !AMap || !map) return
    if (!showTraffic || coordItems.length < 2) {
      drivingRef.current?.clear()
      return
    }
    AMap.plugin('AMap.Driving', () => {
      const Driving = amapRef.current?.Driving
      const currentMap = mapRef.current
      if (!Driving || !currentMap) return
      if (!drivingRef.current) {
        drivingRef.current = new Driving({
          map: currentMap,
          showTraffic: true, // 路径按实时路况着色
          hideMarkers: true, // 不画插件默认的起终点标记(我们有自己的 marker)
          autoFitView: false, // 不抢镜头,视野由我们的 setFitView 管
        })
      }
      const driving = drivingRef.current
      driving.clear() // 清掉上一天/上一次渲染的交通路径
      driving.search(
        coordItems.map((i) => ({ lng: i.lng, lat: i.lat })),
        () => {
          // status 非 complete 时插件不渲染,我们的虚线路径仍在,静默降级
        },
      )
    })
    return () => {
      drivingRef.current?.clear()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showTraffic, mapReady, coordKey])

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
      {mapReady && routing && (
        <div className="absolute bottom-4 left-4 flex items-center gap-2 rounded-full bg-white/90 px-3 py-1.5 text-xs text-zinc-600 shadow-float backdrop-blur">
          <span className="size-3 animate-spin rounded-full border-2 border-zinc-200 border-t-accent-600" />
          路线规划中…
        </div>
      )}

      {/* 图层开关:天气 / 路况(高德风格右侧竖排) */}
      {mapReady && (
        <div className="absolute right-3 top-3 flex flex-col gap-1.5">
          <button
            type="button"
            aria-pressed={showWeather}
            onClick={() => setShowWeather((v) => !v)}
            className={cn(
              'flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium shadow-float backdrop-blur transition-colors',
              showWeather
                ? 'bg-accent-600 text-white'
                : 'bg-white/90 text-zinc-600 hover:text-zinc-900',
            )}
          >
            <CloudSun className="size-3.5" />
            天气
          </button>
          <button
            type="button"
            aria-pressed={showTraffic}
            onClick={() => setShowTraffic((v) => !v)}
            className={cn(
              'flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium shadow-float backdrop-blur transition-colors',
              showTraffic
                ? 'bg-accent-600 text-white'
                : 'bg-white/90 text-zinc-600 hover:text-zinc-900',
            )}
          >
            <CarFront className="size-3.5" />
            路况
          </button>
        </div>
      )}

      {/* 天气浮层:行程目的地逐日预报 */}
      {mapReady && showWeather && (
        <div className="absolute left-3 top-3 w-44 rounded-2xl bg-white/92 p-3 shadow-float backdrop-blur">
          <p className="mb-2 text-xs font-semibold text-zinc-700">{destination}天气</p>
          {weatherCasts?.length ? (
            <ul className="space-y-1.5">
              {weatherCasts.map((c) => {
                const Icon = weatherIcon(c.dayWeather)
                return (
                  <li key={c.date} className="flex items-center gap-2 text-xs text-zinc-600">
                    <Icon className="size-3.5 shrink-0 text-amber-500" />
                    <span className="tnum shrink-0">{c.date.slice(5)}</span>
                    <span className="truncate">{c.dayWeather}</span>
                    <span className="tnum ml-auto shrink-0 text-zinc-400">
                      {c.nightTemp}~{c.dayTemp}°
                    </span>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="text-xs leading-relaxed text-zinc-400">
              近期暂无预报数据,出发前 3 天内可查
            </p>
          )}
        </div>
      )}
    </div>
  )
}
