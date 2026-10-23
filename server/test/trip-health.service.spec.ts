import type { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GeoService } from '../src/geo/geo.service.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import { TripHealthService } from '../src/trip/trip-health.service.js';

type ItemInput = {
  type: 'SPOT' | 'FOOD' | 'HOTEL' | 'TRANSPORT';
  title: string;
  startTime?: string | null;
  endTime?: string | null;
  lng?: number | null;
  lat?: number | null;
  poiType?: string | null;
};

const item = (i: ItemInput) => ({
  type: i.type,
  title: i.title,
  startTime: i.startTime ?? '09:00',
  endTime: i.endTime ?? '11:00',
  lng: i.lng ?? null,
  lat: i.lat ?? null,
  poiType: i.poiType ?? null,
});

const day = (dayIndex: number, date: string, items: ItemInput[]) => ({
  dayIndex,
  date: new Date(`${date}T00:00:00.000Z`),
  items: items.map(item),
});

const tripOf = (days: ReturnType<typeof day>[]) => ({
  id: 't1',
  destination: '测试城',
  days,
});

describe('TripHealthService(行程体检)', () => {
  let service: TripHealthService;
  let prismaMock: { trip: { findUnique: ReturnType<typeof vi.fn> } };
  let geo: GeoService;

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock = { trip: { findUnique: vi.fn() } };
    // 默认天气接口无数据(跳过天气检查)
    geo = new GeoService({ get: vi.fn().mockReturnValue('') } as unknown as ConfigService);
    vi.spyOn(geo, 'getWeather').mockResolvedValue([]);
    service = new TripHealthService(
      prismaMock as unknown as PrismaService,
      geo,
    );
  });

  it('健康行程:满分 A,无建议', async () => {
    prismaMock.trip.findUnique.mockResolvedValue(
      tripOf([
        day(0, '2026-11-01', [
          { type: 'SPOT', title: 'A', lng: 116.0, lat: 30.0, poiType: '风景名胜' },
          { type: 'SPOT', title: 'B', lng: 116.01, lat: 30.0, poiType: '风景名胜' },
          { type: 'SPOT', title: 'C', lng: 116.02, lat: 30.0, poiType: '风景名胜' },
        ]),
      ]),
    );
    const r = await service.report('t1');
    expect(r.score).toBe(100);
    expect(r.grade).toBe('A');
    expect(r.suggestions).toHaveLength(0);
    expect(r.days[0]!.pace).toBe('ok');
  });

  it('折返:三点 U 型且两腿 ≥15km,扣 12 分并给出折返建议', async () => {
    prismaMock.trip.findUnique.mockResolvedValue(
      tripOf([
        day(0, '2026-11-01', [
          { type: 'SPOT', title: 'A景点', lng: 116.0, lat: 30.0 },
          { type: 'SPOT', title: 'B远山', lng: 116.2, lat: 30.0 }, // ~19km
          { type: 'SPOT', title: 'C回城', lng: 116.01, lat: 30.0 },
        ]),
      ]),
    );
    const r = await service.report('t1');
    expect(r.score).toBe(88);
    expect(r.suggestions[0]).toContain('折返');
    expect(r.suggestions[0]).toContain('B远山');
  });

  it('单程超 80km:提示预留交通时间(两点行程不误报折返)', async () => {
    prismaMock.trip.findUnique.mockResolvedValue(
      tripOf([
        day(0, '2026-11-01', [
          { type: 'SPOT', title: '市区', lng: 116.0, lat: 30.0 },
          { type: 'SPOT', title: '远县', lng: 117.0, lat: 30.0 },
        ]),
      ]),
    );
    const r = await service.report('t1');
    expect(r.score).toBe(92);
    expect(r.suggestions[0]).toContain('单程约');
    expect(r.suggestions.join('')).not.toContain('折返');
  });

  it('行程偏满(估算 >12h):提示删减或后移', async () => {
    prismaMock.trip.findUnique.mockResolvedValue(
      tripOf([
        day(0, '2026-11-01', [
          { type: 'SPOT', title: 'A', startTime: '08:00', endTime: '12:00' },
          { type: 'SPOT', title: 'B', startTime: '12:30', endTime: '17:00' },
          { type: 'SPOT', title: 'C', startTime: '17:30', endTime: '21:00' },
          { type: 'SPOT', title: 'D', startTime: '21:30', endTime: '23:30' },
        ]),
      ]),
    );
    const r = await service.report('t1');
    expect(r.days[0]!.pace).toBe('tight');
    expect(r.suggestions[0]).toContain('偏满');
    expect(r.score).toBe(90);
  });

  it('安排较空(估算 <5h):提示可加内容', async () => {
    prismaMock.trip.findUnique.mockResolvedValue(
      tripOf([
        day(0, '2026-11-01', [
          { type: 'SPOT', title: '只逛一个', startTime: '09:00', endTime: '11:00' },
        ]),
      ]),
    );
    const r = await service.report('t1');
    expect(r.days[0]!.pace).toBe('loose');
    expect(r.suggestions[0]).toContain('较空');
    expect(r.score).toBe(95);
  });

  it('雨天排了户外景点:给出互换/改室内建议;室内场馆不报', async () => {
    vi.spyOn(geo, 'getWeather').mockResolvedValue([
      {
        date: '2026-11-01',
        dayWeather: '小雨',
        nightWeather: '阴',
        dayTemp: 18,
        nightTemp: 12,
      },
    ]);
    prismaMock.trip.findUnique.mockResolvedValue(
      tripOf([
        day(0, '2026-11-01', [
          {
            type: 'SPOT',
            title: '室外公园',
            startTime: '09:00',
            endTime: '12:00',
            lng: 116.0,
            lat: 30.0,
            poiType: '风景名胜;公园',
          },
          {
            type: 'SPOT',
            title: '湖边步道',
            startTime: '13:00',
            endTime: '16:00',
            lng: 116.01,
            lat: 30.0,
            poiType: '风景名胜',
          },
        ]),
        day(1, '2026-11-02', [
          {
            type: 'SPOT',
            title: '博物馆',
            startTime: '09:00',
            endTime: '12:00',
            lng: 116.0,
            lat: 30.0,
            poiType: '科教文化服务;博物馆',
          },
          { type: 'FOOD', title: '午餐', startTime: '12:30', endTime: '13:30' },
          {
            type: 'SPOT',
            title: '美术馆',
            startTime: '14:00',
            endTime: '16:00',
            lng: 116.01,
            lat: 30.0,
            poiType: '科教文化服务;美术馆',
          },
        ]),
      ]),
    );
    const r = await service.report('t1');
    expect(r.suggestions).toHaveLength(1);
    expect(r.suggestions[0]).toContain('小雨');
    expect(r.suggestions[0]).toContain('2 个户外景点');
    expect(r.score).toBe(92);
  });

  it('行程不存在:score 0 / grade D', async () => {
    prismaMock.trip.findUnique.mockResolvedValue(null);
    const r = await service.report('tX');
    expect(r.score).toBe(0);
    expect(r.grade).toBe('D');
  });
});
