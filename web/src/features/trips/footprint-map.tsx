import { useEffect, useRef, useState } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { useQuery } from '@tanstack/react-query'
import {
  isAmapAvailable,
  loadAmap,
  type AMapMapInstance,
  type AMapMarker,
  type AMapNamespace,
} from '../../lib/amap'
import { api } from '../../lib/api'

/** 中国全图视野中心(足迹地图默认视角) */
const CHINA_CENTER: [number, number] = [104.5, 36.2]

interface Center {
  lng: number
  lat: number
}

interface FootprintMapProps {
  /** 去重后的目的地城市 */
  destinations: string[]
  /** 当前筛选城市(再次点击取消) */
  activeCity: string | null
  onSelectCity: (city: string | null) => void
}

function markerHtml(city: string, active: boolean): string {
  return renderToStaticMarkup(
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        background: active ? '#0d9488' : '#ffffff',
        color: active ? '#ffffff' : '#27272a',
        border: active ? '2px solid #0d9488' : '2px solid rgba(0,0,0,0.08)',
        borderRadius: 9999,
        padding: '3px 9px 3px 6px',
        fontSize: 11,
        fontWeight: 600,
        fontFamily: 'inherit',
        boxShadow: '0 2px 8px rgb(0 0 0 / 0.16)',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: 9999,
          background: active ? '#ffffff' : '#0d9488',
        }}
      />
      {city}
    </div>,
  )
}

/** 足迹地图:去过的城市在中国全图上点亮,点击城市筛选下方行程 */
export function FootprintMap({ destinations, activeCity, onSelectCity }: FootprintMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const amapRef = useRef<AMapNamespace | null>(null)
  const mapRef = useRef<AMapMapInstance | null>(null)
  const markersRef = useRef<AMapMarker[]>([])
  const [ready, setReady] = useState(false)

  // 各城市中心坐标(并发拉取,单城失败不影响其他)
  const centersQuery = useQuery({
    queryKey: ['districts', destinations.join('|')],
    queryFn: async () => {
      const entries = await Promise.all(
        destinations.map(async (city) => {
          try {
            const res = await api<{ center: Center | null }>(
              `/geo/district?city=${encodeURIComponent(city)}`,
            )
            return [city, res.center] as const
          } catch {
            return [city, null] as const
          }
        }),
      )
      return Object.fromEntries(entries) as Record<string, Center | null>
    },
    enabled: isAmapAvailable && destinations.length > 0,
    staleTime: 30 * 60 * 1000,
  })
  const centers = centersQuery.data ?? {}

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
          zoom: 4,
          center: CHINA_CENTER,
        })
        setReady(true)
      })
      .catch(() => {
        /* 加载失败时静默:足迹卡只是辅助视图 */
      })
    return () => {
      cancelled = true
      mapRef.current?.destroy()
      mapRef.current = null
      amapRef.current = null
    }
  }, [])

  // 城市坐标/选中态变化时重绘 marker
  const markerKey = destinations
    .map((d) => `${d}:${centers[d]?.lng ?? ''}${d === activeCity ? '*' : ''}`)
    .join('|')
  useEffect(() => {
    const AMap = amapRef.current
    const map = mapRef.current
    if (!ready || !AMap || !map) return
    for (const m of markersRef.current) m.setMap(null)
    markersRef.current = []
    for (const city of destinations) {
      const c = centers[city]
      if (!c) continue
      const active = city === activeCity
      const marker = new AMap.Marker({
        position: [c.lng, c.lat],
        content: markerHtml(city, active),
        anchor: 'bottom-center',
        zIndex: active ? 110 : 100,
      })
      marker.setMap(map)
      marker.on?.('click', () => onSelectCity(active ? null : city))
      markersRef.current.push(marker)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, markerKey, activeCity])

  if (!isAmapAvailable || destinations.length === 0) return null

  return (
    <div className="mb-6 overflow-hidden rounded-2xl border border-zinc-200/70 bg-white shadow-card">
      <div className="flex items-center justify-between px-4 pt-3">
        <p className="text-sm font-medium text-zinc-700">足迹地图</p>
        <p className="tnum text-xs text-zinc-400">
          {destinations.length} 个城市 · 点击城市可筛选
        </p>
      </div>
      <div ref={containerRef} className="mt-2 h-56 w-full" aria-label="足迹地图" role="img" />
    </div>
  )
}
