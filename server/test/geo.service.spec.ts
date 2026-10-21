import {
  BadGatewayException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GeoService } from '../src/geo/geo.service.js';

const amapPoiResponse = {
  status: '1',
  pois: [
    {
      id: '1',
      name: '西湖',
      type: '风景名胜',
      address: 'x',
      location: '120.1,30.2',
    },
  ],
};

const okFetch = (body: unknown) => ({
  ok: true,
  json: async () => body,
});

describe('GeoService', () => {
  let service: GeoService;
  let configMock: { get: ReturnType<typeof vi.fn> };
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    configMock = { get: vi.fn().mockReturnValue('test-key') };
    service = new GeoService(configMock as unknown as ConfigService);
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('searchPoi', () => {
    it('缓存:同参数调两次 fetch 只调 1 次,坐标解析正确', async () => {
      fetchMock.mockResolvedValue(okFetch(amapPoiResponse));
      const first = await service.searchPoi('西湖', '杭州');
      const second = await service.searchPoi('西湖', '杭州');
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(first).toHaveLength(1);
      expect(first[0]).toMatchObject({ name: '西湖', lng: 120.1, lat: 30.2 });
      expect(second).toEqual(first);
    });

    it('未配置 AMAP_KEY:reject 503 ServiceUnavailableException', async () => {
      configMock.get.mockReturnValue('');
      const err = await service.searchPoi('西湖').catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ServiceUnavailableException);
      expect((err as ServiceUnavailableException).getStatus()).toBe(503);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('高德返回 status:0:reject BadGatewayException 且含高德 info', async () => {
      fetchMock.mockResolvedValue(
        okFetch({ status: '0', info: 'INVALID_USER_KEY' }),
      );
      const err = await service.searchPoi('西湖').catch((e: unknown) => e);
      expect(err).toBeInstanceOf(BadGatewayException);
      expect((err as BadGatewayException).message).toContain(
        'INVALID_USER_KEY',
      );
    });

    it('fetch 抛错(超时/网络异常):reject BadGatewayException 且含「超时或网络异常」', async () => {
      fetchMock.mockRejectedValue(new Error('The operation timed out'));
      const err = await service.searchPoi('西湖').catch((e: unknown) => e);
      expect(err).toBeInstanceOf(BadGatewayException);
      expect((err as BadGatewayException).message).toContain('超时或网络异常');
    });
  });

  describe('routes 批量', () => {
    const near = { lng: 120.0, lat: 30.0 };
    const mid = { lng: 120.01, lat: 30.0 }; // 距 near 约 1km
    const far = { lng: 120.5, lat: 30.0 }; // 距 mid 约 47km

    it('auto 模式:近段 walking、远段 driving,totalDistance 为各段之和', async () => {
      const routeSpy = vi
        .spyOn(service, 'route')
        .mockResolvedValue({ distance: 1000, duration: 300, polyline: 'p' });
      const result = await service.routes([near, mid, far]);
      expect(routeSpy).toHaveBeenCalledTimes(2);
      expect(routeSpy).toHaveBeenNthCalledWith(
        1,
        '120,30',
        '120.01,30',
        'walking',
      );
      expect(routeSpy).toHaveBeenNthCalledWith(
        2,
        '120.01,30',
        '120.5,30',
        'driving',
      );
      expect(result.segments).toHaveLength(2);
      expect(result.segments[0]).toMatchObject({
        mode: 'walking',
        fallback: false,
      });
      expect(result.segments[1]).toMatchObject({
        mode: 'driving',
        fallback: false,
      });
      expect(result.totalDistance).toBe(2000);
      expect(result.totalDuration).toBe(600);
    });

    it('两个相同坐标:不调 route,segment distance=0', async () => {
      const routeSpy = vi
        .spyOn(service, 'route')
        .mockResolvedValue({ distance: 1, duration: 1, polyline: 'p' });
      const result = await service.routes([near, { ...near }]);
      expect(routeSpy).not.toHaveBeenCalled();
      expect(result.segments).toHaveLength(1);
      expect(result.segments[0]).toMatchObject({
        distance: 0,
        duration: 0,
        fallback: false,
      });
    });

    it('route 全部失败:所有 segment fallback=true,polyline 为直线,totalDistance=0', async () => {
      vi.spyOn(service, 'route').mockRejectedValue(new Error('高德挂了'));
      const result = await service.routes([near, mid, far]);
      expect(result.segments).toHaveLength(2);
      for (const seg of result.segments) {
        expect(seg.fallback).toBe(true);
        expect(seg.polyline).toContain(';');
      }
      expect(result.totalDistance).toBe(0);
      expect(result.totalDuration).toBe(0);
    });
  });
});
