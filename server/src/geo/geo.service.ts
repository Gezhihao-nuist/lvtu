import {
  BadGatewayException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface GeoPoi {
  id: string;
  name: string;
  type: string;
  address: string;
  lng: number;
  lat: number;
}

export interface GeoRoute {
  distance: number;
  duration: number;
  polyline: string;
}

export type RouteMode = 'walking' | 'driving' | 'transit';

export interface RouteSegment extends GeoRoute {
  mode: RouteMode;
  /** true 表示该段规划失败,polyline 为两点直线兜底 */
  fallback: boolean;
}

export interface RoutesResult {
  segments: RouteSegment[];
  totalDistance: number;
  totalDuration: number;
}

/** 高德天气预报(当天 + 未来 3 天) */
export interface WeatherCast {
  /** '2026-10-21' */
  date: string;
  dayWeather: string;
  nightWeather: string;
  dayTemp: number;
  nightTemp: number;
}

interface CacheEntry {
  data: unknown;
  expireAt: number;
}

/** 两点球面直线距离(米) */
function haversineMeters(
  a: { lng: number; lat: number },
  b: { lng: number; lat: number },
): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(s));
}

/** 带下标的并发限制 map,规避高德个人 Key 的 QPS 限制 */
async function mapLimitIdx<T>(
  arr: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let i = 0;
  const workers = Array.from(
    { length: Math.min(limit, arr.length) },
    async () => {
      while (i < arr.length) {
        const idx = i++;
        await fn(arr[idx] as T, idx);
      }
    },
  );
  await Promise.all(workers);
}

@Injectable()
export class GeoService {
  private static readonly TTL = 10 * 60 * 1000;
  private readonly cache = new Map<string, CacheEntry>();
  private writes = 0;

  constructor(private readonly cfg: ConfigService) {}

  /** 高德 POI 文本搜索,返回结构化 poi 列表 */
  async searchPoi(keyword: string, city?: string): Promise<GeoPoi[]> {
    const key = this.amapKey();
    const cacheKey = `poi:${city ?? ''}:${keyword}`;
    const cached = this.getCached<GeoPoi[]>(cacheKey);
    if (cached) return cached;
    const url =
      `https://restapi.amap.com/v3/place/text?key=${key}` +
      `&keywords=${encodeURIComponent(keyword)}&citylimit=true` +
      (city ? `&city=${encodeURIComponent(city)}` : '');
    const data = await this.fetchJson(url);
    const pois: GeoPoi[] = ((data.pois ?? []) as Record<string, unknown>[])
      .map((p) => {
        const [lng, lat] = String(p.location ?? '')
          .split(',')
          .map(Number);
        return {
          id: String(p.id ?? ''),
          name: String(p.name ?? ''),
          type: String(p.type ?? ''),
          address: typeof p.address === 'string' ? p.address : '',
          lng,
          lat,
        };
      })
      .filter((p) => Number.isFinite(p.lng) && Number.isFinite(p.lat));
    this.setCached(cacheKey, pois);
    return pois;
  }

  /** 高德天气预报:城市名或 adcode 均可;无预报覆盖的城市返回空数组 */
  async getWeather(city: string): Promise<WeatherCast[]> {
    const key = this.amapKey();
    const cacheKey = `weather:${city}`;
    const cached = this.getCached<WeatherCast[]>(cacheKey);
    if (cached) return cached;
    const url =
      `https://restapi.amap.com/v3/weather/weatherInfo?key=${key}` +
      `&city=${encodeURIComponent(city)}&extensions=all`;
    const data = await this.fetchJson(url);
    const casts: WeatherCast[] = (
      (data.forecasts?.[0]?.casts ?? []) as Record<string, unknown>[]
    )
      .map((c) => ({
        date: String(c.date ?? ''),
        dayWeather: String(c.dayweather ?? ''),
        nightWeather: String(c.nightweather ?? ''),
        dayTemp: Number(c.daytemp),
        nightTemp: Number(c.nighttemp),
      }))
      .filter((c) => c.date);
    this.setCached(cacheKey, casts);
    return casts;
  }

  /** 高德路径规划,返回首条方案的距离/时长/ polyline */
  async route(from: string, to: string, mode: RouteMode): Promise<GeoRoute> {
    const key = this.amapKey();
    const cacheKey = `route:${mode}:${from}:${to}`;
    const cached = this.getCached<GeoRoute>(cacheKey);
    if (cached) return cached;
    const path =
      mode === 'transit'
        ? '/v3/direction/transit/integrated'
        : `/v3/direction/${mode}`;
    const url = `https://restapi.amap.com${path}?key=${key}&origin=${from}&destination=${to}`;
    const data = await this.fetchJson(url);
    const route = this.parseRoute(data, mode);
    this.setCached(cacheKey, route);
    return route;
  }

  /** 批量路径规划:途经点串成逐段路径;auto 模式按直线距离 <2.5km 选步行,否则驾车;失败段回退直线 */
  async routes(
    points: { lng: number; lat: number }[],
    mode: 'walking' | 'driving' | 'transit' | 'auto' = 'auto',
  ): Promise<RoutesResult> {
    const pairs = points
      .slice(0, -1)
      .map((p, i) => [p, points[i + 1]!] as const);
    const segments: RouteSegment[] = new Array<RouteSegment>(pairs.length);
    await mapLimitIdx(pairs, 2, async ([a, b], idx) => {
      const from = `${a.lng},${a.lat}`;
      const to = `${b.lng},${b.lat}`;
      const resolvedMode: RouteMode =
        mode === 'auto'
          ? haversineMeters(a, b) < 2500
            ? 'walking'
            : 'driving'
          : mode;
      // 起终点相同(同地往返/重复点):不浪费高德调用,直接给零距离段
      if (a.lng === b.lng && a.lat === b.lat) {
        segments[idx] = {
          distance: 0,
          duration: 0,
          polyline: `${from};${to}`,
          mode: resolvedMode,
          fallback: false,
        };
        return;
      }
      try {
        const r = await this.route(from, to, resolvedMode);
        segments[idx] = { ...r, mode: resolvedMode, fallback: false };
      } catch {
        segments[idx] = {
          distance: 0,
          duration: 0,
          polyline: `${from};${to}`,
          mode: resolvedMode,
          fallback: true,
        };
      }
    });
    return {
      segments,
      totalDistance: segments.reduce((s, x) => s + (x.fallback ? 0 : x.distance), 0),
      totalDuration: segments.reduce((s, x) => s + (x.fallback ? 0 : x.duration), 0),
    };
  }

  private parseRoute(data: any, mode: RouteMode): GeoRoute {
    if (mode === 'transit') {
      const t = data.route?.transits?.[0];
      if (!t) throw new NotFoundException('未找到路线');
      const polylines: string[] = [];
      for (const seg of t.segments ?? []) {
        if (seg.walking?.steps) {
          polylines.push(
            ...seg.walking.steps
              .map((s: { polyline?: string }) => s.polyline)
              .filter(Boolean),
          );
        }
        if (seg.bus?.buslines?.[0]?.polyline) {
          polylines.push(seg.bus.buslines[0].polyline);
        }
        if (seg.railway?.polyline) polylines.push(seg.railway.polyline);
      }
      return {
        distance: Number(t.distance),
        duration: Number(t.duration),
        polyline: polylines.join(';'),
      };
    }
    const p = data.route?.paths?.[0];
    if (!p) throw new NotFoundException('未找到路线');
    const polyline = (p.steps ?? [])
      .map((s: { polyline?: string }) => s.polyline)
      .filter(Boolean)
      .join(';');
    return {
      distance: Number(p.distance),
      duration: Number(p.duration),
      polyline,
    };
  }

  private amapKey(): string {
    const key = this.cfg.get<string>('AMAP_KEY');
    if (!key) {
      throw new ServiceUnavailableException('服务端未配置高德 Key');
    }
    return key;
  }

  private async fetchJson(url: string): Promise<any> {
    let res: Response;
    try {
      // 10 秒超时兜底:高德挂起时快速失败,不拖垮调用方
      res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    } catch {
      throw new BadGatewayException('高德接口超时或网络异常,请稍后重试');
    }
    if (!res.ok) throw new BadGatewayException('高德接口调用失败');
    const data = await res.json();
    if (data.status !== undefined && data.status !== '1') {
      throw new BadGatewayException(
        `高德接口返回错误: ${data.info ?? '未知'}`,
      );
    }
    return data;
  }

  private getCached<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (entry.expireAt < Date.now()) {
      this.cache.delete(key);
      return null;
    }
    return entry.data as T;
  }

  private setCached(key: string, data: unknown) {
    this.cache.set(key, { data, expireAt: Date.now() + GeoService.TTL });
    // 每 100 次写入顺手清理过期项
    if (++this.writes % 100 === 0) {
      const now = Date.now();
      for (const [k, v] of this.cache) {
        if (v.expireAt < now) this.cache.delete(k);
      }
    }
  }
}
