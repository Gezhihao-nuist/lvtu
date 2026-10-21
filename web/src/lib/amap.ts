/**
 * 高德 JS API 2.0 动态加载。
 * Key 在 .env 的 VITE_AMAP_JS_KEY / VITE_AMAP_SECURITY_CODE 配置;
 * 未配置时 isAmapAvailable = false,组件渲染占位。
 */

export interface AMapMapInstance {
  add(overlays: unknown[]): void
  remove(overlays: unknown[]): void
  setFitView(overlays?: unknown[], immediately?: boolean, avoid?: number[]): void
  setCenter(center: [number, number]): void
  setZoom(zoom: number): void
  destroy(): void
}

export interface AMapMarker {
  setMap(map: AMapMapInstance | null): void
  setContent(content: string | HTMLElement): void
  setzIndex?(z: number): void
  setAnimation?(animation: string): void
}

export interface AMapPolyline {
  setMap(map: AMapMapInstance | null): void
}

export interface GeocoderResult {
  info?: string
  geocodes?: Array<{ location?: { lng: number; lat: number } | string }>
}

export interface AMapGeocoder {
  getLocation(address: string, cb: (status: string, result: GeocoderResult) => void): void
}

export interface AMapNamespace {
  Map: new (el: HTMLElement, opts: Record<string, unknown>) => AMapMapInstance
  Marker: new (opts: Record<string, unknown>) => AMapMarker
  Polyline: new (opts: Record<string, unknown>) => AMapPolyline
  Geocoder?: new (opts?: Record<string, unknown>) => AMapGeocoder
  plugin(name: string | string[], cb: () => void): void
}

declare global {
  interface Window {
    AMap?: AMapNamespace
    _AMapSecurityConfig?: { securityJsCode?: string }
  }
}

const key = (import.meta.env.VITE_AMAP_JS_KEY as string | undefined)?.trim() ?? ''
const securityCode = (import.meta.env.VITE_AMAP_SECURITY_CODE as string | undefined)?.trim() ?? ''

export const isAmapAvailable = key.length > 0

export const BEIJING: [number, number] = [116.397128, 39.916527]

let loadingPromise: Promise<AMapNamespace> | null = null

export function loadAmap(): Promise<AMapNamespace> {
  if (!isAmapAvailable) return Promise.reject(new Error('未配置高德 Key'))
  if (window.AMap) return Promise.resolve(window.AMap)
  if (!loadingPromise) {
    loadingPromise = new Promise((resolve, reject) => {
      window._AMapSecurityConfig = { securityJsCode: securityCode || undefined }
      const script = document.createElement('script')
      script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(key)}`
      script.async = true
      script.onload = () => {
        if (window.AMap) resolve(window.AMap)
        else reject(new Error('高德地图加载失败'))
      }
      script.onerror = () => {
        loadingPromise = null
        reject(new Error('高德地图加载失败,请检查网络'))
      }
      document.head.appendChild(script)
    })
  }
  return loadingPromise
}

/** 用 Geocoder 插件把城市名转成坐标,失败时回退 fallback */
export function geocodeCity(
  AMap: AMapNamespace,
  city: string,
  fallback: [number, number] = BEIJING,
): Promise<[number, number]> {
  return new Promise((resolve) => {
    try {
      AMap.plugin('AMap.Geocoder', () => {
        const Geocoder = window.AMap?.Geocoder
        if (!Geocoder) return resolve(fallback)
        new Geocoder().getLocation(city, (status, result) => {
          const loc = status === 'complete' ? result.geocodes?.[0]?.location : undefined
          if (loc && typeof loc === 'object') resolve([loc.lng, loc.lat])
          else resolve(fallback)
        })
      })
    } catch {
      resolve(fallback)
    }
  })
}


