import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import { TripService } from '../src/trip/trip.service.js';

const day = (id: string, date: string, dayIndex: number) => ({
  id,
  tripId: 't1',
  dayIndex,
  date: new Date(`${date}T00:00:00.000Z`),
  note: null,
});

describe('TripService', () => {
  let service: TripService;
  let prismaMock: {
    trip: {
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    tripDay: {
      findUnique: ReturnType<typeof vi.fn>;
      createMany: ReturnType<typeof vi.fn>;
      deleteMany: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    tripCollaborator: { create: ReturnType<typeof vi.fn> };
    itineraryItem: {
      findUnique: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      aggregate: ReturnType<typeof vi.fn>;
    };
    $transaction: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock = {
      trip: { findUnique: vi.fn(), update: vi.fn() },
      tripDay: {
        findUnique: vi.fn(),
        createMany: vi.fn(),
        deleteMany: vi.fn(),
        update: vi.fn(),
      },
      tripCollaborator: { create: vi.fn() },
      itineraryItem: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
        aggregate: vi.fn(),
      },
      $transaction: vi.fn(),
    };
    service = new TripService(prismaMock as unknown as PrismaService);
  });

  describe('parseRange', () => {
    it('endDate < startDate → BadRequestException', () => {
      expect(() => service['parseRange']('2026-11-03', '2026-11-01')).toThrow(
        BadRequestException,
      );
    });

    it('超过 30 天 → BadRequestException', () => {
      expect(() => service['parseRange']('2026-01-01', '2026-02-15')).toThrow(
        BadRequestException,
      );
    });

    it('正常 3 天区间 → 返回 3 个 Date', () => {
      const dates = service['parseRange']('2026-11-01', '2026-11-03');
      expect(dates).toHaveLength(3);
      expect(dates.every((d) => d instanceof Date)).toBe(true);
      expect(dates[0]?.toISOString().slice(0, 10)).toBe('2026-11-01');
      expect(dates[2]?.toISOString().slice(0, 10)).toBe('2026-11-03');
    });
  });

  describe('create', () => {
    it('3 天区间:createMany 建 3 个 TripDay,并写 owner 协作记录', async () => {
      const tx = {
        trip: { create: vi.fn().mockResolvedValue({ id: 't1' }) },
        tripDay: { createMany: vi.fn() },
        tripCollaborator: { create: vi.fn() },
      };
      prismaMock.$transaction.mockImplementation(
        async (cb: (tx: unknown) => unknown) => cb(tx),
      );
      prismaMock.trip.findUnique.mockResolvedValue({
        id: 't1',
        title: '北京之旅',
        destination: '北京',
        startDate: new Date('2026-11-01T00:00:00.000Z'),
        endDate: new Date('2026-11-03T00:00:00.000Z'),
        coverUrl: null,
        budgetTotal: null,
        visibility: 'PRIVATE',
        ownerId: 'u1',
        updatedAt: new Date(),
        days: [],
      });

      await service.create('u1', {
        title: '北京之旅',
        destination: '北京',
        startDate: '2026-11-01',
        endDate: '2026-11-03',
      });

      expect(tx.tripDay.createMany).toHaveBeenCalledTimes(1);
      const createManyArg = tx.tripDay.createMany.mock.calls[0]?.[0] as {
        data: { tripId: string; dayIndex: number; date: Date }[];
      };
      expect(createManyArg.data).toHaveLength(3);
      expect(createManyArg.data.map((d) => d.dayIndex)).toEqual([0, 1, 2]);
      expect(tx.tripCollaborator.create).toHaveBeenCalledWith({
        data: { tripId: 't1', userId: 'u1', role: 'OWNER' },
      });
    });
  });

  describe('reorder 校验', () => {
    it('itemIds 里有不属于该 day 的 item → BadRequestException', async () => {
      prismaMock.tripDay.findUnique.mockResolvedValue({
        id: 'day1',
        tripId: 't1',
      });
      prismaMock.itineraryItem.findMany.mockResolvedValue([
        { id: 'i1', dayId: 'day1' },
        { id: 'i2', dayId: 'other-day' },
      ]);
      await expect(
        service.reorder({ dayId: 'day1', itemIds: ['i1', 'i2'] }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('itemIds 数量对不上(有不存在的 id)→ BadRequestException', async () => {
      prismaMock.tripDay.findUnique.mockResolvedValue({
        id: 'day1',
        tripId: 't1',
      });
      prismaMock.itineraryItem.findMany.mockResolvedValue([
        { id: 'i1', dayId: 'day1' },
      ]);
      await expect(
        service.reorder({ dayId: 'day1', itemIds: ['i1', 'ghost'] }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('updateItem 跨天移动', () => {
    beforeEach(() => {
      prismaMock.itineraryItem.findUnique.mockResolvedValue({
        id: 'i1',
        dayId: 'd1',
        day: { id: 'd1', tripId: 't1' },
      });
    });

    it('目标 day 不属于该 trip → BadRequestException', async () => {
      prismaMock.tripDay.findUnique.mockResolvedValue({
        id: 'd2',
        tripId: 'other-trip',
      });
      await expect(
        service.updateItem('i1', { dayId: 'd2' }, 't1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prismaMock.itineraryItem.update).not.toHaveBeenCalled();
    });

    it('目标 day 属于该 trip → connect 且 orderIndex 排到末尾', async () => {
      prismaMock.tripDay.findUnique.mockResolvedValue({
        id: 'd2',
        tripId: 't1',
      });
      prismaMock.itineraryItem.aggregate.mockResolvedValue({
        _max: { orderIndex: 5 },
      });
      prismaMock.itineraryItem.update.mockResolvedValue({
        id: 'i1',
        dayId: 'd2',
        cost: null,
      });
      prismaMock.trip.update.mockResolvedValue({});

      await service.updateItem('i1', { dayId: 'd2' }, 't1');

      expect(prismaMock.itineraryItem.update).toHaveBeenCalledTimes(1);
      const updateArg = prismaMock.itineraryItem.update.mock.calls[0]?.[0] as {
        data: { day?: unknown; orderIndex?: number };
      };
      expect(updateArg.data.day).toEqual({ connect: { id: 'd2' } });
      expect(updateArg.data.orderIndex).toBe(6);
    });
  });

  describe('update 日期同步 syncDays', () => {
    it('11-01~11-03 改为 11-02~11-04:删 11-01、保留中间两天、只新建 11-04', async () => {
      const trip = {
        id: 't1',
        title: '北京之旅',
        destination: '北京',
        budgetTotal: null,
        coverUrl: null,
        startDate: new Date('2026-11-01T00:00:00.000Z'),
        endDate: new Date('2026-11-03T00:00:00.000Z'),
        days: [
          day('d0', '2026-11-01', 0),
          day('d1', '2026-11-02', 1),
          day('d2', '2026-11-03', 2),
        ],
      };
      prismaMock.trip.findUnique
        .mockResolvedValueOnce(trip) // update() 里的查询
        .mockResolvedValue({
          ...trip,
          days: trip.days.map((d) => ({ ...d, items: [] })),
        }); // detail() 里的查询
      const tx = {
        trip: { update: vi.fn() },
        tripDay: {
          deleteMany: vi.fn(),
          update: vi.fn(),
          createMany: vi.fn(),
        },
      };
      prismaMock.$transaction.mockImplementation(
        async (cb: (tx: unknown) => unknown) => cb(tx),
      );

      await service.update('t1', {
        startDate: '2026-11-02',
        endDate: '2026-11-04',
      });

      // 删除条件:notIn 新区间(即 11-01 命中删除)
      expect(tx.tripDay.deleteMany).toHaveBeenCalledTimes(1);
      const delArg = tx.tripDay.deleteMany.mock.calls[0]?.[0] as {
        where: { tripId: string; date: { notIn: Date[] } };
      };
      expect(delArg.where.tripId).toBe('t1');
      expect(
        delArg.where.date.notIn.map((d) => d.toISOString().slice(0, 10)),
      ).toEqual(['2026-11-02', '2026-11-03', '2026-11-04']);

      // 保留的 d1/d2 重排 dayIndex(两遍),d0 不再更新
      const updatedIds = tx.tripDay.update.mock.calls.map(
        (c) => (c[0] as { where: { id: string } }).where.id,
      );
      expect(updatedIds).toContain('d1');
      expect(updatedIds).toContain('d2');
      expect(updatedIds).not.toContain('d0');

      // 只新建 11-04,dayIndex=2
      expect(tx.tripDay.createMany).toHaveBeenCalledTimes(1);
      const createArg = tx.tripDay.createMany.mock.calls[0]?.[0] as {
        data: { tripId: string; dayIndex: number; date: Date }[];
      };
      expect(createArg.data).toHaveLength(1);
      expect(createArg.data[0]?.date.toISOString().slice(0, 10)).toBe(
        '2026-11-04',
      );
      expect(createArg.data[0]?.dayIndex).toBe(2);
    });
  });

  describe('budget(预算汇总)', () => {
    const item = (type: string, cost: number | null) => ({ type, cost });
    const tripRow = (days: unknown[], collaborators = 1) => ({
      id: 't1',
      budgetTotal: 3000,
      days,
      _count: { collaborators },
    });

    it('按类型/按天聚合;人均=总花费/成员数(owner 已在协作者表,不重复计)', async () => {
      prismaMock.trip.findUnique.mockResolvedValue(
        tripRow(
          [
            {
              dayIndex: 0,
              date: new Date('2026-11-01T00:00:00.000Z'),
              items: [item('SPOT', 60), item('FOOD', 80), item('FOOD', 100)],
            },
            {
              dayIndex: 1,
              date: new Date('2026-11-02T00:00:00.000Z'),
              items: [item('HOTEL', 300), item('TRANSPORT', 40)],
            },
          ],
          2,
        ),
      );
      const b = await service.budget('t1');
      expect(b.budgetTotal).toBe(3000);
      expect(b.plannedTotal).toBe(580);
      expect(b.byType).toEqual({
        SPOT: 60,
        FOOD: 180,
        HOTEL: 300,
        TRANSPORT: 40,
      });
      expect(b.byDay.map((d) => d.total)).toEqual([240, 340]);
      expect(b.memberCount).toBe(2);
      expect(b.perPerson).toBe(290);
      expect(b.itemCount).toBe(5);
      expect(b.costedItemCount).toBe(5);
    });

    it('无花费条目不参与汇总,costedItemCount 只计有价项', async () => {
      prismaMock.trip.findUnique.mockResolvedValue(
        tripRow([
          {
            dayIndex: 0,
            date: new Date('2026-11-01T00:00:00.000Z'),
            items: [item('SPOT', null), item('FOOD', 50)],
          },
        ]),
      );
      const b = await service.budget('t1');
      expect(b.plannedTotal).toBe(50);
      expect(b.itemCount).toBe(2);
      expect(b.costedItemCount).toBe(1);
      expect(b.byType.SPOT).toBe(0);
    });

    it('行程不存在:NotFoundException', async () => {
      prismaMock.trip.findUnique.mockResolvedValue(null);
      await expect(service.budget('tX')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
