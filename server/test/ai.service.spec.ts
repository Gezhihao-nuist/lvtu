import type { ConfigService } from '@nestjs/config';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  let geoMock: {
    searchPoi: ReturnType<typeof vi.fn>;
    getWeather: ReturnType<typeof vi.fn>;
    getPoiDetail: ReturnType<typeof vi.fn>;
    getCityCenter: ReturnType<typeof vi.fn>;
  };
  let configMock: { get: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock = {
      trip: { findUnique: vi.fn() },
      tripDay: { findMany: vi.fn() },
      $transaction: vi.fn(),
    };
    geoMock = {
      searchPoi: vi.fn(),
      getWeather: vi.fn().mockResolvedValue([]),
      getPoiDetail: vi.fn().mockResolvedValue(null),
      getCityCenter: vi.fn().mockResolvedValue({ lng: 116.0, lat: 30.0 }),
    };
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

    it('空 days 数组:plan 为 null(防空行程静默清空已有安排)', () => {
      const { plan, error } = service['parsePlan']('{"days":[]}');
      expect(plan).toBeNull();
      expect(error).not.toBeNull();
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

  describe('importFromText(攻略导入)', () => {
    it('Mock 模式:走同一提炼管线并最终 done 落库', async () => {
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
      await service.importFromText(
        't1',
        '第一天去天安门广场看升旗,中午吃烤鸭;第二天爬八达岭长城;第三天逛颐和园和圆明园。',
        (e) => events.push(e),
      );

      const readProgress = events.find(
        (e) =>
          e['type'] === 'progress' &&
          String(e['text']).includes('正在阅读攻略'),
      );
      expect(readProgress).toBeDefined();
      expect(events[events.length - 1]).toMatchObject({
        type: 'done',
        dayCount: 3,
        itemCount: 12,
      });
    });

    it('行程不存在:推送 error 事件', async () => {
      prismaMock.trip.findUnique.mockResolvedValue(null);
      const events: SseEvent[] = [];
      await service.importFromText('tX', 'x'.repeat(30), (e) =>
        events.push(e),
      );
      expect(events[0]).toMatchObject({ type: 'error' });
    });
  });

  describe('fetchUrlText(SSRF 防护与解析)', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('私网/回环/内网地址:直接 400,不发任何请求', async () => {
      const fetchSpy = vi.fn();
      vi.stubGlobal('fetch', fetchSpy);
      await expect(
        service.fetchUrlText('http://127.0.0.1/admin'),
      ).rejects.toThrow('不可访问');
      await expect(service.fetchUrlText('http://192.168.1.1/')).rejects.toThrow(
        '不可访问',
      );
      await expect(
        service.fetchUrlText('http://localhost:3000/api'),
      ).rejects.toThrow('不可访问');
      await expect(
        service.fetchUrlText('http://10.0.0.8/internal'),
      ).rejects.toThrow('不可访问');
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('非 http/https 协议:400', async () => {
      await expect(service.fetchUrlText('file:///etc/passwd')).rejects.toThrow(
        '仅支持',
      );
    });

    it('正常页面:返回标题与正文文本', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          url: 'https://example.com/note',
          text: async () =>
            '<html><head><title>北京三日游攻略</title><script>var a=1;</script></head><body>' +
            '<p>第一天 天安门 故宫 景山公园 烤鸭 王府井 三里屯 后海 南锣鼓巷 什刹海</p>'.repeat(
              10,
            ) +
            '</body></html>',
        }),
      );
      const r = await service.fetchUrlText('https://example.com/note');
      expect(r.title).toBe('北京三日游攻略');
      expect(r.text.length).toBeGreaterThan(50);
      expect(r.text).not.toContain('var a=1');
    });

    it('正文过少(反爬/需登录):422 引导手动粘贴', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          url: 'https://x.example.com/a',
          text: async () => '<html><body>请登录</body></html>',
        }),
      );
      await expect(
        service.fetchUrlText('https://x.example.com/a'),
      ).rejects.toThrow('请直接粘贴攻略文字');
    });

    it('重定向中间跳打到内网:拦截,不发出第二跳请求', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 302,
        headers: new Headers({ location: 'http://169.254.169.254/latest' }),
      });
      vi.stubGlobal('fetch', fetchMock);
      await expect(
        service.fetchUrlText('https://evil.example.com/a'),
      ).rejects.toThrow('不可访问');
      // 只发出第一跳,内网地址的请求从未发出
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('安全重定向:跟随跳转后正常解析', async () => {
      const page =
        '<html><head><title>攻略</title></head><body>' +
        '<p>第一天 天安门 故宫 景山 烤鸭 王府井 三里屯 后海 南锣鼓巷 什刹海</p>'.repeat(
          10,
        ) +
        '</body></html>';
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 301,
          headers: new Headers({ location: 'https://example.com/final' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers(),
          body: null,
          text: async () => page,
        });
      vi.stubGlobal('fetch', fetchMock);
      const r = await service.fetchUrlText('https://example.com/start');
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(r.title).toBe('攻略');
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

    it('zigzag 折返被精确重排:1→2 跑 100km、3 又回到 1 附近的 badcase 被消除', () => {
      // 用户实测反馈的 badcase 复刻:B 远在 ~96km 外,却被排在 A 与 C/D 之间
      const plan: OptPlan = {
        days: [
          {
            dayIndex: 0,
            items: [
              mkItem('SPOT', 'A景点', 116.0, 30.0),
              mkItem('SPOT', 'B远山', 117.0, 30.0), // ~96km 外
              mkItem('FOOD', '午餐', 116.01, 30.0), // 钉在 idx2
              mkItem('SPOT', 'C景点', 116.03, 30.0),
              mkItem('SPOT', 'D景点', 116.05, 30.02),
              mkItem('HOTEL', '住宿', 116.02, 30.0), // 钉在 idx5
            ],
          },
        ],
      };
      const before = totalKm(plan.days[0]!.items);
      service['optimizePlan'](plan);
      const items = plan.days[0]!.items;
      expect(items[2]!.title).toBe('午餐'); // FOOD 位置不动
      expect(items[5]!.title).toBe('住宿'); // HOTEL 位置不动
      // 穷举取到全局最优:远端 B 被移到链端,总里程不到原来六成
      expect(totalKm(items)).toBeLessThan(before * 0.6);
    });

    it('两个可动项:交换后总里程显著更短则交换(精确求解)', () => {
      const plan: OptPlan = {
        days: [
          {
            dayIndex: 0,
            items: [
              mkItem('SPOT', 'A', 116.0, 30.0),
              mkItem('SPOT', 'B', 117.0, 30.0), // ~96km
              mkItem('HOTEL', '住宿', 116.0, 30.0), // 钉在末尾
            ],
          },
        ],
      };
      const before = totalKm(plan.days[0]!.items);
      service['optimizePlan'](plan);
      // B→A→住宿 ≈ 96km,远优于 A→B→住宿 ≈ 193km
      expect(plan.days[0]!.items.map((i) => i.title)).toEqual([
        'B',
        'A',
        '住宿',
      ]);
      expect(totalKm(plan.days[0]!.items)).toBeLessThan(before);
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

    it('拿到 poiId 后写入 POI 详情的评分与细分类目', async () => {
      const plan: EnrichPlan = {
        days: [
          {
            dayIndex: 0,
            items: [
              {
                type: 'SPOT' as const,
                title: '颐和园',
                poiName: '颐和园',
                startTime: '09:00',
                endTime: '11:00',
                cost: 30,
                note: null,
              },
            ],
          },
        ],
      };
      geoMock.getCityCenter.mockResolvedValue({ lng: 116.3, lat: 39.9 }); // 北京
      geoMock.searchPoi.mockResolvedValue([
        {
          id: 'B000A7O1CU',
          name: '颐和园',
          type: '风景名胜',
          address: '',
          lng: 116.27,
          lat: 39.99,
        },
      ]);
      geoMock.getPoiDetail.mockResolvedValue({
        id: 'B000A7O1CU',
        name: '颐和园',
        type: '风景名胜;风景名胜;世界遗产',
        tel: '010-62881144',
        rating: 4.9,
      });
      await service['enrichCoordinates'](plan, '北京');
      const spot = plan.days[0]!.items[0]!;
      expect(spot.poiId).toBe('B000A7O1CU');
      expect((spot as { rating?: number }).rating).toBe(4.9);
      expect((spot as { poiType?: string }).poiType).toContain('世界遗产');
    });

    it('SPOT 距锚点超 60km 但在目的地半径内:保留坐标(漠河北极村场景)', async () => {
      const plan: EnrichPlan = {
        days: [
          {
            dayIndex: 0,
            items: [
              {
                type: 'SPOT' as const,
                title: '漠河市区广场',
                poiName: '北极星广场',
                startTime: '09:00',
                endTime: '10:00',
                cost: 0,
                note: null,
              },
              {
                type: 'SPOT' as const,
                title: '北极村',
                poiName: '北极村',
                startTime: '10:30',
                endTime: '17:00',
                cost: 68,
                note: null,
              },
            ],
          },
        ],
      };
      // 目的地中心=漠河市区;北极村距市区 ~170km(≤200km 半径,真实远景点)
      geoMock.searchPoi.mockImplementation((name: string) => {
        if (name === '北极星广场') {
          return Promise.resolve([
            { id: 'sq', name, type: '风景名胜', address: '', lng: 116.0, lat: 30.0 },
          ]);
        }
        return Promise.resolve([
          { id: 'bjc', name, type: '风景名胜', address: '', lng: 117.5, lat: 31.0 },
        ]);
      });
      await service['enrichCoordinates'](plan, '漠河');
      const village = plan.days[0]!.items[1]!;
      expect(village.poiId).toBe('bjc');
      expect(village.lng).toBeCloseTo(117.5);
    });

    it('候选均超出目的地半径(外省重名,漠河实测 2308km):剔除并放弃坐标', async () => {
      const plan: EnrichPlan = {
        days: [
          {
            dayIndex: 0,
            items: [
              {
                type: 'SPOT' as const,
                title: '漠河市区广场',
                poiName: '北极星广场',
                startTime: '09:00',
                endTime: '10:00',
                cost: 0,
                note: null,
              },
              {
                type: 'SPOT' as const,
                title: '松苑原始森林公园',
                poiName: '松苑原始森林公园',
                startTime: '10:30',
                endTime: '12:00',
                cost: 0,
                note: null,
              },
            ],
          },
        ],
      };
      geoMock.searchPoi.mockImplementation((name: string) => {
        if (name === '北极星广场') {
          return Promise.resolve([
            { id: 'sq', name, type: '风景名胜', address: '', lng: 116.0, lat: 30.0 },
          ]);
        }
        // 高德返回的「建议结果」全在 2300km 外的外省
        return Promise.resolve([
          { id: 'junk', name, type: '风景名胜', address: '', lng: 116.4, lat: 39.9 },
        ]);
      });
      await service['enrichCoordinates'](plan, '漠河');
      const park = plan.days[0]!.items[1]!;
      expect(park.poiId).toBeUndefined();
      expect(park.lng).toBeUndefined();
    });

    it('城市限定无结果:用「目的地+名称」重搜(圣诞村场景)', async () => {
      const plan: EnrichPlan = {
        days: [
          {
            dayIndex: 0,
            items: [
              {
                type: 'SPOT' as const,
                title: '圣诞村',
                poiName: '圣诞村',
                startTime: '14:00',
                endTime: '16:00',
                cost: 60,
                note: null,
              },
            ],
          },
        ],
      };
      geoMock.searchPoi.mockImplementation((keyword: string, city?: string) => {
        if (city === '漠河') return Promise.resolve([]); // 城市限定搜不到
        return Promise.resolve([
          { id: 'xms', name: '北极圣诞村', type: '风景名胜', address: '', lng: 116.3, lat: 30.1 },
        ]);
      });
      await service['enrichCoordinates'](plan, '漠河');
      expect(geoMock.searchPoi).toHaveBeenCalledWith('圣诞村', '漠河');
      expect(geoMock.searchPoi).toHaveBeenCalledWith('漠河圣诞村');
      const spot = plan.days[0]!.items[0]!;
      expect(spot.poiId).toBe('xms');
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

  describe('buildWeatherHint(逐日天气提示词)', () => {
    const casts = [
      {
        date: '2026-10-22',
        dayWeather: '小雨',
        nightWeather: '阴',
        dayTemp: 19,
        nightTemp: 13,
      },
      {
        date: '2026-10-23',
        dayWeather: '晴',
        nightWeather: '晴',
        dayTemp: 24,
        nightTemp: 15,
      },
    ];
    const start = new Date('2026-10-22T00:00:00.000Z');

    it('重叠窗口内的天输出天气行;早晚同天不写「转」', async () => {
      configMock.get.mockReturnValue('amap-key');
      geoMock.getWeather.mockResolvedValue(casts);
      const hint = await service['buildWeatherHint']('安庆', start, 4);
      expect(hint).toContain('天气预报:');
      expect(hint).toContain('第1天 10-22:小雨转阴 13~19°C');
      expect(hint).toContain('第2天 10-23:晴 15~24°C');
      expect(hint).not.toContain('第3天'); // 超出预报窗口
    });

    it('行程与预报窗口完全不重叠:返回空串', async () => {
      configMock.get.mockReturnValue('amap-key');
      geoMock.getWeather.mockResolvedValue(casts);
      const hint = await service['buildWeatherHint'](
        '安庆',
        new Date('2027-01-01T00:00:00.000Z'),
        3,
      );
      expect(hint).toBe('');
    });

    it('天气接口失败:静默降级为空串,不影响生成', async () => {
      configMock.get.mockReturnValue('amap-key');
      geoMock.getWeather.mockRejectedValue(new Error('高德挂了'));
      const hint = await service['buildWeatherHint']('安庆', start, 3);
      expect(hint).toBe('');
    });

    it('未配置 AMAP_KEY:返回空串且不调天气接口', async () => {
      configMock.get.mockReturnValue('');
      const hint = await service['buildWeatherHint']('安庆', start, 3);
      expect(hint).toBe('');
      expect(geoMock.getWeather).not.toHaveBeenCalled();
    });
  });

  describe('buildWeatherMap(逐日天气 Map)', () => {
    const casts = [
      {
        date: '2026-10-22',
        dayWeather: '小雨',
        nightWeather: '阴',
        dayTemp: 19,
        nightTemp: 13,
      },
      {
        date: '2026-10-23',
        dayWeather: '晴',
        nightWeather: '晴',
        dayTemp: 24,
        nightTemp: 15,
      },
    ];

    it('窗口内的天进 Map,窗口外不进', async () => {
      configMock.get.mockReturnValue('amap-key');
      geoMock.getWeather.mockResolvedValue(casts);
      const map = await service['buildWeatherMap'](
        '安庆',
        new Date('2026-10-22T00:00:00.000Z'),
        4,
      );
      expect(map.size).toBe(2);
      expect(map.get(0)?.dayWeather).toBe('小雨');
      expect(map.get(1)?.dayWeather).toBe('晴');
      expect(map.has(2)).toBe(false);
    });

    it('接口失败:返回空 Map 不抛错', async () => {
      configMock.get.mockReturnValue('amap-key');
      geoMock.getWeather.mockRejectedValue(new Error('高德挂了'));
      const map = await service['buildWeatherMap'](
        '安庆',
        new Date('2026-10-22T00:00:00.000Z'),
        3,
      );
      expect(map.size).toBe(0);
    });
  });
});
