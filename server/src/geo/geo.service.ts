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

interface CacheEntry {
  data: unknown;
  expireAt: number;
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
    const res = await fetch(url);
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
