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
});
