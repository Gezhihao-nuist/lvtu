import type { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AiService } from '../src/ai/ai.service.js';
import type { GeoService } from '../src/geo/geo.service.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';

type SseEvent = Record<string, unknown>;

const validPlanJson = JSON.stringify({
  days: [
    {
      dayIndex: 0,
      items: [
        {
          type: 'SPOT',
          title: '天安门广场',
          poiName: '天安门广场',
          startTime: '09:00',
          endTime: '11:00',
          cost: 0,
          note: '早点去人少。',
        },
      ],
    },
  ],
});

describe('AiService', () => {
  let service: AiService;
  let prismaMock: {
    trip: { findUnique: ReturnType<typeof vi.fn> };
    tripDay: { findMany: ReturnType<typeof vi.fn> };
    $transaction: ReturnType<typeof vi.fn>;
  };
  let geoMock: { searchPoi: ReturnType<typeof vi.fn> };
  let configMock: { get: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock = {
      trip: { findUnique: vi.fn() },
      tripDay: { findMany: vi.fn() },
      $transaction: vi.fn(),
    };
    geoMock = { searchPoi: vi.fn() };
    configMock = { get: vi.fn().mockReturnValue('') };
    service = new AiService(
      prismaMock as unknown as PrismaService,
      geoMock as unknown as GeoService,
      configMock as unknown as ConfigService,
    );
  });

  describe('parsePlan', () => {
    it('合法 JSON:plan 非空,error 为 null', () => {
      const { plan, error } = service['parsePlan'](validPlanJson);
      expect(error).toBeNull();
      expect(plan).not.toBeNull();
      expect(plan?.days).toHaveLength(1);
      expect(plan?.days[0]?.items[0]?.title).toBe('天安门广场');
    });

    it('被 ```json 代码块包裹:能提取并 parse 成功', () => {
      const raw = `这是为你规划的行程:\n\`\`\`json\n${validPlanJson}\n\`\`\`\n希望对你有帮助`;
      const { plan, error } = service['parsePlan'](raw);
      expect(error).toBeNull();
      expect(plan).not.toBeNull();
      expect(plan?.days[0]?.dayIndex).toBe(0);
    });

    it('完全不是 JSON:plan 为 null,error 含「不是合法 JSON」', () => {
      const { plan, error } = service['parsePlan']('抱歉我无法生成');
      expect(plan).toBeNull();
      expect(error).toContain('不是合法 JSON');
    });

    it('是 JSON 但字段类型错(dayIndex 是字符串):plan 为 null,error 非空', () => {
      const bad = JSON.stringify({
        days: [
          {
            dayIndex: '0',
            items: [
              {
                type: 'SPOT',
                title: 'x',
                poiName: null,
                startTime: null,
                endTime: null,
                cost: null,
                note: null,
              },
            ],
          },
        ],
      });
      const { plan, error } = service['parsePlan'](bad);
      expect(plan).toBeNull();
      expect(error).not.toBeNull();
      expect(error).toContain('dayIndex');
    });
  });

  describe('friendlyApiError', () => {
    it.each([
      [{ status: 401 }, 'Key 无效'],
      [{ status: 402 }, '余额不足'],
      [{ status: 429 }, '过于频繁'],
      [{ status: 500 }, '暂时不可用'],
      [{ name: 'APIConnectionTimeoutError' }, '超时'],
      [new Error('Request timed out'), '超时'],
      [new Error('别的'), '生成失败,请重试'],
    ])('%o → 含「%s」', (err, keyword) => {
      expect(service['friendlyApiError'](err)).toContain(keyword);
    });
  });

  describe('buildMockPlan', () => {
    it('北京 3 天:序列化后能过 planSchema', () => {
      const mock = service['buildMockPlan']('北京', 3);
      expect(mock.days).toHaveLength(3);
      const { plan, error } = service['parsePlan'](JSON.stringify(mock));
      expect(error).toBeNull();
      expect(plan).not.toBeNull();
      expect(plan?.days).toHaveLength(3);
      expect(plan?.days[0]?.items[0]?.title).toContain('北京');
    });
  });

  describe('producePlan Mock 分支(经 generate)', () => {
    it('未配置 DEEPSEEK_API_KEY:推送「未配置模型 Key」progress 并最终 done 落库', async () => {
      configMock.get.mockReturnValue('');
      prismaMock.trip.findUnique.mockResolvedValue({
        id: 't1',
        destination: '北京',
        startDate: new Date('2026-11-01T00:00:00.000Z'),
        endDate: new Date('2026-11-03T00:00:00.000Z'),
        days: [
          { id: 'd0', dayIndex: 0 },
          { id: 'd1', dayIndex: 1 },
          { id: 'd2', dayIndex: 2 },
        ],
      });
      prismaMock.tripDay.findMany.mockResolvedValue([
        { id: 'd0', dayIndex: 0 },
        { id: 'd1', dayIndex: 1 },
        { id: 'd2', dayIndex: 2 },
      ]);
      const tx = {
        itineraryItem: { deleteMany: vi.fn(), create: vi.fn() },
        trip: { update: vi.fn() },
        aiConversation: { createMany: vi.fn() },
      };
      prismaMock.$transaction.mockImplementation(
        async (cb: (tx: unknown) => unknown) => cb(tx),
      );

      const events: SseEvent[] = [];
      await service.generate('t1', undefined, (e) => events.push(e));

      const mockProgress = events.find(
        (e) =>
          e['type'] === 'progress' &&
          String(e['text']).includes('未配置模型 Key'),
      );
      expect(mockProgress).toBeDefined();
      // 未配置 AMAP_KEY,不补坐标
      expect(geoMock.searchPoi).not.toHaveBeenCalled();
      // mock 行程 3 天 × 每天 4 项,全部落库
      expect(tx.itineraryItem.create).toHaveBeenCalledTimes(12);
      expect(events[events.length - 1]).toMatchObject({
        type: 'done',
        dayCount: 3,
        itemCount: 12,
      });
    });
  });

  describe('optimizePlan(每日地理优化)', () => {
    type OptPlan = {
      days: {
        dayIndex: number;
        items: ({
          type: 'SPOT' | 'FOOD' | 'HOTEL' | 'TRANSPORT';
          title: string;
          poiName: string | null;
          startTime: string | null;
          endTime: string | null;
          cost: number | null;
          note: string | null;
          lng?: number | null;
          lat?: number | null;
        })[];
      }[];
    };
    const mkItem = (
      type: 'SPOT' | 'FOOD' | 'HOTEL' | 'TRANSPORT',
      title: string,
      lng: number | null,
      lat: number | null,
    ) => ({
      type,
      title,
      poiName: title,
      startTime: '09:00',
      endTime: '11:00',
      cost: 0,
      note: null,
      lng,
      lat,
    });
    const totalKm = (items: { lng?: number | null; lat?: number | null }[]) => {
      let sum = 0;
      for (let i = 0; i + 1 < items.length; i++) {
        const a = items[i];
        const b = items[i + 1];
        if (a?.lng != null && b?.lng != null) {
          sum += service['haversineKm'](
            { lng: a.lng!, lat: a.lat! },
            { lng: b.lng!, lat: b.lat! },
          );
        }
      }
      return sum;
    };

    it('zigzag 折返被重排:A→100km 外 B→A 附近 C,优化后 C 紧跟 A', () => {
      const plan: OptPlan = {
        days: [
          {
            dayIndex: 0,
            items: [
              mkItem('SPOT', 'A景点', 116.0, 30.0),
              mkItem('SPOT', 'B远山', 117.0, 30.0), // ~97km
              mkItem('FOOD', '午餐', 116.01, 30.0), // 钉在 idx2
              mkItem('SPOT', 'C景点', 116.02, 30.0), // 离 A ~2km
              mkItem('HOTEL', '住宿', 116.0, 30.01), // 钉在 idx4
            ],
          },
        ],
      };
      const before = totalKm(plan.days[0]!.items);
      service['optimizePlan'](plan);
      const items = plan.days[0]!.items;
      expect(items[2]!.title).toBe('午餐'); // FOOD 位置不动
      expect(items[4]!.title).toBe('住宿'); // HOTEL 位置不动
      expect(items[1]!.title).toBe('C景点'); // 近的点排到 A 后面
      expect(totalKm(items)).toBeLessThan(before);
    });

    it('可动项少于 3 个时不改变顺序', () => {
      const plan: OptPlan = {
        days: [
          {
            dayIndex: 0,
            items: [
              mkItem('SPOT', 'A', 116.0, 30.0),
              mkItem('SPOT', 'B', 117.0, 30.0),
              mkItem('HOTEL', '住宿', 116.0, 30.0),
            ],
          },
        ],
      };
      service['optimizePlan'](plan);
      expect(plan.days[0]!.items.map((i) => i.title)).toEqual([
        'A',
        'B',
        '住宿',
      ]);
    });

    it('重排后时间轴严格递增且不重叠', () => {
      const plan: OptPlan = {
        days: [
          {
            dayIndex: 0,
            items: [
              mkItem('SPOT', 'A景点', 116.0, 30.0),
              mkItem('SPOT', 'B远山', 117.0, 30.0),
              mkItem('FOOD', '午餐', 116.01, 30.0),
              mkItem('SPOT', 'C景点', 116.02, 30.0),
              mkItem('HOTEL', '住宿', 116.0, 30.01),
            ],
          },
        ],
      };
      service['optimizePlan'](plan);
      const items = plan.days[0]!.items;
      const toMin = (t: string | null) =>
        t ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3)) : null;
      let prevEnd = -1;
      for (const it of items) {
        const s = toMin(it.startTime);
        expect(s).not.toBeNull();
        expect(s!).toBeGreaterThanOrEqual(prevEnd);
        const e = toMin(it.endTime);
        if (e !== null) prevEnd = e;
        else prevEnd = s!;
      }
    });
  });

  describe('enrichCoordinates(防 POI 错位)', () => {
    type EnrichPlan = {
      days: {
        dayIndex: number;
        items: {
          type: 'SPOT' | 'FOOD';
          title: string;
          poiName: string;
          startTime: string;
          endTime: string;
          cost: number;
          note: null;
          poiId?: string;
          lng?: number;
          lat?: number;
        }[];
      }[];
    };
    it('FOOD 候选选离天锚点最近的,而不是列表第一个', async () => {
      const plan: EnrichPlan = {
        days: [
          {
            dayIndex: 0,
            items: [
              {
                type: 'SPOT' as const,
                title: '花亭湖风景区',
                poiName: '花亭湖风景区',
                startTime: '09:00',
                endTime: '11:00',
                cost: 0,
                note: null,
              },
              {
                type: 'FOOD' as const,
                title: '湖边鱼馆午饭',
                poiName: '湖边鱼馆',
                startTime: '12:00',
                endTime: '13:00',
                cost: 50,
                note: null,
              },
            ],
          },
        ],
      };
      geoMock.searchPoi.mockImplementation((name: string) => {
        if (name === '花亭湖风景区') {
          return Promise.resolve([
            { id: 'spot', name, type: '风景名胜', address: '', lng: 116.0, lat: 30.0 },
          ]);
        }
        // 餐厅:第一个候选在 78km 外(错误匹配),第二个在景区旁
        return Promise.resolve([
          { id: 'far', name, type: '餐饮', address: '', lng: 116.8, lat: 30.0 },
          { id: 'near', name, type: '餐饮', address: '', lng: 116.01, lat: 30.0 },
        ]);
      });
      await service['enrichCoordinates'](plan, '安庆');
      const food = plan.days[0]!.items[1]!;
      expect(food.poiId).toBe('near');
      expect(food.lng).toBeCloseTo(116.01);
    });

    it('最近候选仍超过 60km 时放弃坐标(宁缺勿错)', async () => {
      const plan: EnrichPlan = {
        days: [
          {
            dayIndex: 0,
            items: [
              {
                type: 'SPOT' as const,
                title: '花亭湖风景区',
                poiName: '花亭湖风景区',
                startTime: '09:00',
                endTime: '11:00',
                cost: 0,
                note: null,
              },
              {
                type: 'FOOD' as const,
                title: '神秘餐厅',
                poiName: '神秘餐厅',
                startTime: '12:00',
                endTime: '13:00',
                cost: 50,
                note: null,
              },
            ],
          },
        ],
      };
      geoMock.searchPoi.mockImplementation((name: string) => {
        if (name === '花亭湖风景区') {
          return Promise.resolve([
            { id: 'spot', name, type: '风景名胜', address: '', lng: 116.0, lat: 30.0 },
          ]);
        }
        return Promise.resolve([
          { id: 'far', name, type: '餐饮', address: '', lng: 117.0, lat: 30.0 },
        ]);
      });
      await service['enrichCoordinates'](plan, '安庆');
      const food = plan.days[0]!.items[1]!;
      expect(food.lng).toBeUndefined();
      expect(food.lat).toBeUndefined();
    });
  });
});
