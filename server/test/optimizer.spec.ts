import { describe, expect, it, vi } from 'vitest';
import {
  haversineKm,
  optimizeDayOrder,
  rebalanceDays,
  reflowDayTimes,
  sequenceCost,
  type OptItem,
} from '../src/ai/optimizer.js';

const mk = (
  type: OptItem['type'],
  title: string,
  lng: number | null,
  lat: number | null,
  startTime: string | null = '09:00',
  endTime: string | null = '11:00',
): OptItem => ({ type, title, startTime, endTime, lng, lat });

/** 朴素直线总里程(不含绕行系数与罚项,便于直观比较) */
const totalKm = (items: OptItem[]) => {
  let sum = 0;
  for (let i = 0; i + 1 < items.length; i++) {
    const a = items[i];
    const b = items[i + 1];
    if (a?.lng != null && b?.lng != null) {
      sum += haversineKm(
        { lng: a.lng, lat: a.lat! },
        { lng: b.lng, lat: b.lat! },
      );
    }
  }
  return sum;
};

describe('haversineKm', () => {
  it('赤道上 1 个经度 ≈ 111.2km', () => {
    const d = haversineKm({ lng: 0, lat: 0 }, { lng: 1, lat: 0 });
    expect(d).toBeGreaterThan(110);
    expect(d).toBeLessThan(112.5);
  });

  it('同一个点距离为 0', () => {
    expect(haversineKm({ lng: 116.4, lat: 39.9 }, { lng: 116.4, lat: 39.9 })).toBe(0);
  });
});

describe('sequenceCost(里程 + 转向惩罚)', () => {
  // A(116) → B(117) 约 96km
  const A = mk('SPOT', 'A', 116.0, 30.0);
  const B = mk('SPOT', 'B', 117.0, 30.0);
  const C = mk('SPOT', 'C', 116.02, 30.0); // 紧邻 A

  it('折返序列代价远高于顺路序列', () => {
    // A→96km 外 B→回到 A 旁的 C:典型 zigzag
    expect(sequenceCost([A, B, C])).toBeGreaterThan(sequenceCost([A, C, B]) * 2);
  });

  it('U 型折返产生显著罚项(超出纯里程部分)', () => {
    const A2 = mk('SPOT', 'A2', 116.001, 30.0); // 紧邻 A
    const pureDistance =
      1.3 *
      (haversineKm({ lng: 116.0, lat: 30.0 }, { lng: 117.0, lat: 30.0 }) +
        haversineKm({ lng: 117.0, lat: 30.0 }, { lng: 116.001, lat: 30.0 }));
    // 跑到 96km 外立刻掉头折返:罚项应超过 25km 等效里程
    expect(sequenceCost([A, B, A2]) - pureDistance).toBeGreaterThan(25);
  });
});

describe('optimizeDayOrder(日内精确排序)', () => {
  it('zigzag 四景点取到全局最优:远端点移到链端,总里程大幅下降', () => {
    const items = [
      mk('SPOT', 'A', 116.0, 30.0),
      mk('SPOT', 'B', 117.0, 30.0), // ~96km 外
      mk('SPOT', 'C', 116.03, 30.0),
      mk('SPOT', 'D', 116.05, 30.02),
    ];
    const before = totalKm(items);
    optimizeDayOrder(items);
    expect(totalKm(items)).toBeLessThan(before * 0.6);
    // 最优解中远端 B 与最近的 D 相邻(链的两端为 B 与 A)
    const idxB = items.findIndex((i) => i.title === 'B');
    const idxD = items.findIndex((i) => i.title === 'D');
    expect(Math.abs(idxB - idxD)).toBe(1);
  });

  it('FOOD/HOTEL 钉位不动,可动项绕其重排', () => {
    const items = [
      mk('SPOT', 'A', 116.0, 30.0),
      mk('FOOD', '午餐', 116.01, 30.0), // idx1 钉住
      mk('SPOT', 'B', 117.0, 30.0),
      mk('HOTEL', '住宿', 116.0, 30.01), // idx3 钉住
    ];
    optimizeDayOrder(items);
    expect(items[1]!.title).toBe('午餐');
    expect(items[3]!.title).toBe('住宿');
    // B→午餐→A→住宿 ≈ 98km,优于 A→午餐→B→住宿 ≈ 193km
    expect(items[0]!.title).toBe('B');
  });

  it('只有一个可动项时保持不变', () => {
    const items = [
      mk('SPOT', 'A', 116.0, 30.0),
      mk('HOTEL', '住宿', 117.0, 30.0),
    ];
    optimizeDayOrder(items);
    expect(items.map((i) => i.title)).toEqual(['A', '住宿']);
  });

  it('交换无显著收益时保持原顺序', () => {
    // 无坐标项视为钉住;A/B 交换后代价相同,不应打乱 AI 原顺序
    const items = [
      mk('SPOT', 'A', 116.0, 30.0),
      mk('SPOT', '未知小馆', null, null),
      mk('SPOT', 'B', 117.0, 30.0),
    ];
    optimizeDayOrder(items);
    expect(items.map((i) => i.title)).toEqual(['A', '未知小馆', 'B']);
  });
});

describe('rebalanceDays(跨天离群点重分配)', () => {
  const day = (dayIndex: number, items: OptItem[]) => ({ dayIndex, items });
  const nearA = () => [
    mk('SPOT', 'A1', 116.0, 30.0),
    mk('SPOT', 'A2', 116.01, 30.0),
    mk('SPOT', 'A3', 116.02, 30.0),
  ];
  const nearB = () => [
    mk('SPOT', 'B1', 118.01, 30.0),
    mk('SPOT', 'B2', 118.02, 30.0),
    mk('SPOT', 'B3', 118.0, 30.01),
  ];

  it('离群 190km 的景点被迁到 1km 内的另一天', () => {
    const days = [
      day(0, [...nearA(), mk('SPOT', '离群X', 118.0, 30.0)]),
      day(1, nearB()),
    ];
    const warn = vi.fn();
    rebalanceDays(days, warn);
    expect(days[0]!.items.map((i) => i.title)).not.toContain('离群X');
    expect(days[1]!.items.map((i) => i.title)).toContain('离群X');
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('离群点附近没有更近的天时保持不动', () => {
    const days = [
      day(0, [...nearA(), mk('SPOT', '离群X', 118.0, 30.0)]),
      day(1, [mk('SPOT', 'C1', 116.03, 30.0), mk('SPOT', 'C2', 116.04, 30.0)]),
    ];
    rebalanceDays(days);
    expect(days[0]!.items.map((i) => i.title)).toContain('离群X');
  });

  it('目标天已达 6 项上限时不迁移', () => {
    const days = [
      day(0, [...nearA(), mk('SPOT', '离群X', 118.0, 30.0)]),
      day(1, [
        ...nearB(),
        mk('SPOT', 'B4', 118.03, 30.0),
        mk('SPOT', 'B5', 118.04, 30.0),
        mk('SPOT', 'B6', 118.05, 30.0),
      ]),
    ];
    rebalanceDays(days);
    expect(days[0]!.items.map((i) => i.title)).toContain('离群X');
    expect(days[1]!.items).toHaveLength(6);
  });

  it('源天只剩 3 项下限时不迁移', () => {
    const days = [
      day(0, [
        mk('SPOT', 'A1', 116.0, 30.0),
        mk('SPOT', 'A2', 116.01, 30.0),
        mk('SPOT', '离群X', 118.0, 30.0),
      ]),
      day(1, nearB()),
    ];
    rebalanceDays(days);
    expect(days[0]!.items.map((i) => i.title)).toContain('离群X');
  });

  it('单天行程直接返回', () => {
    const days = [day(0, [...nearA(), mk('SPOT', '远点', 118.0, 30.0)])];
    rebalanceDays(days);
    expect(days[0]!.items).toHaveLength(4);
  });
});

describe('reflowDayTimes(交通耗时感知的时间轴)', () => {
  const toMin = (t: string | null) =>
    t ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3)) : null;

  it('时间严格递增;HOTEL 的 endTime 为 null', () => {
    const items = [
      mk('SPOT', 'A', 116.0, 30.0),
      mk('FOOD', '午餐', 116.01, 30.0),
      mk('SPOT', 'B', 116.02, 30.0),
      mk('HOTEL', '住宿', 116.0, 30.01),
    ];
    reflowDayTimes(items);
    let prevEnd = -1;
    for (const it of items) {
      const s = toMin(it.startTime)!;
      expect(s).toBeGreaterThanOrEqual(prevEnd);
      const e = toMin(it.endTime);
      prevEnd = e ?? s;
    }
    expect(items[3]!.endTime).toBeNull();
  });

  it('远距腿的交通间隔显著大于近距腿', () => {
    const items = [
      mk('SPOT', 'A', 116.0, 30.0),
      mk('SPOT', 'B', 116.01, 30.0), // ~1km
      mk('SPOT', 'C', 118.0, 30.0), // ~190km
    ];
    reflowDayTimes(items);
    const gap1 = toMin(items[1]!.startTime)! - toMin(items[0]!.endTime)!;
    const gap2 = toMin(items[2]!.startTime)! - toMin(items[1]!.endTime)!;
    expect(gap2).toBeGreaterThan(gap1);
    expect(gap2).toBeLessThanOrEqual(90); // 间隔钳制上限
  });

  it('无坐标项回退为 30 分钟固定缓冲', () => {
    const items = [
      mk('SPOT', 'A', 116.0, 30.0),
      mk('FOOD', '神秘餐厅', null, null),
    ];
    reflowDayTimes(items);
    const gap = toMin(items[1]!.startTime)! - toMin(items[0]!.endTime)!;
    expect(gap).toBe(30);
  });

  it('保留原有合法时长', () => {
    const items = [mk('SPOT', 'A', 116.0, 30.0, '09:00', '10:30')];
    reflowDayTimes(items);
    expect(items[0]!.startTime).toBe('09:00');
    expect(items[0]!.endTime).toBe('10:30'); // 90 分钟原时长不变
  });
});
