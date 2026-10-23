import { Injectable } from '@nestjs/common';
import { ItemType } from '@prisma/client';
import {
  haversineKm,
  isIndoorType,
  isRainy,
  type Pt,
} from '../ai/optimizer.js';
import { GeoService } from '../geo/geo.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

export interface DayHealth {
  dayIndex: number;
  date: string;
  itemCount: number;
  totalKm: number;
  longestLegKm: number;
  /** 游览+交通+缓冲的估算总时长(分钟) */
  estMinutes: number;
  pace: 'tight' | 'ok' | 'loose' | 'empty';
  issues: string[];
}

export interface HealthReport {
  score: number;
  grade: 'A' | 'B' | 'C' | 'D';
  totalKm: number;
  days: DayHealth[];
  /** 全行程建议(各天 issue 的汇总) */
  suggestions: string[];
}

const CIRCUITY = 1.3;
const DEFAULT_DUR: Record<ItemType, number> = {
  SPOT: 120,
  FOOD: 60,
  TRANSPORT: 45,
  HOTEL: 0,
};

interface ItemRow {
  type: ItemType;
  title: string;
  startTime: string | null;
  endTime: string | null;
  lng: number | null;
  lat: number | null;
  poiType: string | null;
}

/**
 * 行程体检:对落库的行程做确定性体检(不调 AI,毫秒级)。
 * 指标全部复用 TTDP 优化器的几何/类目工具:
 * 里程与最长单程、折返(>107° 且两腿 ≥15km)、节奏松紧、天气匹配。
 * 评分 = 100 − 各项罚分,附带可执行的改进建议。
 */
@Injectable()
export class TripHealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly geo: GeoService,
  ) {}

  async report(tripId: string): Promise<HealthReport> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        days: {
          orderBy: { dayIndex: 'asc' },
          include: { items: { orderBy: { orderIndex: 'asc' } } },
        },
      },
    });
    if (!trip) return { score: 0, grade: 'D', totalKm: 0, days: [], suggestions: ['行程不存在'] };

    // 天气预报(仅当天+未来3天有数据;失败则跳过天气检查)
    const weatherByDate = new Map<string, { dayWeather: string }>();
    try {
      const casts = await this.geo.getWeather(trip.destination);
      for (const c of casts) weatherByDate.set(c.date, { dayWeather: c.dayWeather });
    } catch {
      /* 无天气数据不阻塞 */
    }

    let penalty = 0;
    let totalKm = 0;
    const days: DayHealth[] = trip.days.map((d) => {
      const items = d.items as ItemRow[];
      const issues: string[] = [];
      const date = d.date.toISOString().slice(0, 10);
      const dayNo = d.dayIndex + 1;

      // ── 里程与折返 ──
      const coordItems = items.filter(
        (it): it is ItemRow & { lng: number; lat: number } =>
          it.lng != null && it.lat != null,
      );
      const legs: number[] = [];
      for (let i = 0; i + 1 < coordItems.length; i++) {
        const km =
          CIRCUITY *
          haversineKm(
            { lng: coordItems[i]!.lng, lat: coordItems[i]!.lat },
            { lng: coordItems[i + 1]!.lng, lat: coordItems[i + 1]!.lat },
          );
        legs.push(km);
      }
      const dayKm = legs.reduce((s, x) => s + x, 0);
      totalKm += dayKm;
      const longestLegKm = legs.length ? Math.max(...legs) : 0;

      for (let i = 1; i + 1 < coordItems.length; i++) {
        const a = coordItems[i - 1]!;
        const b = coordItems[i]!;
        const c = coordItems[i + 1]!;
        const ab = legs[i - 1]!;
        const bc = legs[i]!;
        if (ab < 15 || bc < 15) continue; // 短腿折返只是绕行,不算 badcase
        const cosLat = Math.cos((b.lat * Math.PI) / 180);
        const v1x = (b.lng - a.lng) * cosLat;
        const v1y = b.lat - a.lat;
        const v2x = (c.lng - b.lng) * cosLat;
        const v2y = c.lat - b.lat;
        const n1 = Math.hypot(v1x, v1y);
        const n2 = Math.hypot(v2x, v2y);
        if (n1 === 0 || n2 === 0) continue;
        const cosTheta = (v1x * v2x + v1y * v2y) / (n1 * n2);
        if (cosTheta < -0.3) {
          issues.push(
            `Day${dayNo} 在「${b.title}」处有约 ${Math.round(ab + bc)}km 折返(${a.title} → ${b.title} → ${c.title}),建议把它调整到更近的天或换个顺序`,
          );
          penalty += 12;
        }
      }
      if (longestLegKm > 80) {
        const idx = legs.indexOf(longestLegKm);
        issues.push(
          `Day${dayNo}「${coordItems[idx]!.title} → ${coordItems[idx + 1]!.title}」单程约 ${Math.round(longestLegKm)}km,路上耗时较长,注意预留交通时间`,
        );
        penalty += 8;
      }

      // ── 节奏松紧 ──
      const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
      let estMinutes = 0;
      let prevCoord: Pt | null = null;
      for (const it of items) {
        let dur = DEFAULT_DUR[it.type];
        if (it.startTime && it.endTime) {
          const dd = toMin(it.endTime) - toMin(it.startTime);
          if (dd >= 15 && dd <= 720) dur = dd;
        }
        estMinutes += dur;
        if (it.lng != null && it.lat != null) {
          if (prevCoord) {
            const km = CIRCUITY * haversineKm(prevCoord, { lng: it.lng, lat: it.lat });
            estMinutes += (km < 2 ? km / 4.5 : km / 27) * 60 + 15;
          }
          prevCoord = { lng: it.lng, lat: it.lat };
        } else if (prevCoord) {
          estMinutes += 30; // 无坐标段的保守缓冲
        }
      }
      let pace: DayHealth['pace'] = 'ok';
      if (items.length === 0) pace = 'empty';
      else if (estMinutes > 720) {
        pace = 'tight';
        issues.push(
          `Day${dayNo} 行程偏满(约 ${(estMinutes / 60).toFixed(1)} 小时),建议删减一项或后移`,
        );
        penalty += 10;
      } else if (estMinutes < 300) {
        pace = 'loose';
        issues.push(
          `Day${dayNo} 安排较空(约 ${(estMinutes / 60).toFixed(1)} 小时),可以再加些内容或与相邻天合并`,
        );
        penalty += 5;
      }

      // ── 天气匹配 ──
      const w = weatherByDate.get(date);
      if (w && isRainy(w)) {
        const outdoor = items.filter(
          (it) => it.type === 'SPOT' && !isIndoorType(it.poiType),
        );
        if (outdoor.length > 0) {
          issues.push(
            `Day${dayNo} 预报${w.dayWeather},但排了 ${outdoor.length} 个户外景点(${outdoor
              .map((o) => o.title)
              .slice(0, 2)
              .join('、')}${outdoor.length > 2 ? ' 等' : ''}),建议与晴天互换或改室内`,
          );
          penalty += 8;
        }
      }

      return {
        dayIndex: d.dayIndex,
        date,
        itemCount: items.length,
        totalKm: Math.round(dayKm * 10) / 10,
        longestLegKm: Math.round(longestLegKm * 10) / 10,
        estMinutes: Math.round(estMinutes),
        pace,
        issues,
      };
    });

    const score = Math.max(0, Math.min(100, 100 - penalty));
    const grade = score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 55 ? 'C' : 'D';
    return {
      score,
      grade,
      totalKm: Math.round(totalKm * 10) / 10,
      days,
      suggestions: days.flatMap((d) => d.issues),
    };
  }
}
