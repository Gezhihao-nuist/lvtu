import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ItineraryItem, Prisma, Trip, TripDay } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  CreateItemDto,
  CreateTripDto,
  ReorderItemsDto,
  UpdateDayDto,
  UpdateItemDto,
  UpdateTripDto,
} from './dto/trip.dto.js';

const toNum = (v: unknown): number | null =>
  v === null || v === undefined ? null : Number(v);

const dateKey = (d: Date) => d.toISOString().slice(0, 10);

/** 枚举 [start, end] 每一天(按 UTC 零点) */
function eachDate(start: Date, end: Date): Date[] {
  const out: Date[] = [];
  const cur = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()),
  );
  const last = Date.UTC(
    end.getUTCFullYear(),
    end.getUTCMonth(),
    end.getUTCDate(),
  );
  while (cur.getTime() <= last) {
    out.push(new Date(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

@Injectable()
export class TripService {
  constructor(private readonly prisma: PrismaService) {}

  /** 列出当前用户 owner 或协作的所有行程(按更新时间降序) */
  async list(userId: string) {
    const trips = await this.prisma.trip.findMany({
      where: {
        OR: [{ ownerId: userId }, { collaborators: { some: { userId } } }],
      },
      orderBy: { updatedAt: 'desc' },
      include: {
        collaborators: { where: { userId }, select: { role: true } },
        days: { select: { _count: { select: { items: true } } } },
      },
    });
    return trips.map((t) => ({
      id: t.id,
      title: t.title,
      destination: t.destination,
      startDate: t.startDate,
      endDate: t.endDate,
      coverUrl: t.coverUrl,
      budgetTotal: toNum(t.budgetTotal),
      visibility: t.visibility,
      role: t.ownerId === userId ? 'OWNER' : (t.collaborators[0]?.role ?? 'VIEWER'),
      dayCount: t.days.length,
      itemCount: t.days.reduce((sum, d) => sum + d._count.items, 0),
      updatedAt: t.updatedAt,
    }));
  }

  /** 创建行程,自动为日期区间每一天建 TripDay,并写入 owner 协作记录 */
  async create(userId: string, dto: CreateTripDto) {
    const dates = this.parseRange(dto.startDate, dto.endDate);
    const trip = await this.prisma.$transaction(async (tx) => {
      const created = await tx.trip.create({
        data: {
          ownerId: userId,
          title: dto.title,
          destination: dto.destination,
          startDate: dates[0],
          endDate: dates[dates.length - 1],
          budgetTotal: dto.budgetTotal ?? null,
        },
      });
      await tx.tripDay.createMany({
        data: dates.map((date, i) => ({
          tripId: created.id,
          dayIndex: i,
          date,
        })),
      });
      await tx.tripCollaborator.create({
        data: { tripId: created.id, userId, role: 'OWNER' },
      });
      return created;
    });
    return this.detail(trip.id);
  }

  /** 行程详情:days 按 dayIndex 升序,items 按 orderIndex 升序 */
  async detail(id: string) {
    const trip = await this.prisma.trip.findUnique({
      where: { id },
      include: {
        days: {
          orderBy: { dayIndex: 'asc' },
          include: { items: { orderBy: { orderIndex: 'asc' } } },
        },
      },
    });
    if (!trip) throw new NotFoundException('行程不存在');
    return this.serializeTrip(trip);
  }

  /** 更新行程;日期变化时同步 days(保留重合日期,补建缺失,删除多余) */
  async update(id: string, dto: UpdateTripDto) {
    const trip = await this.prisma.trip.findUnique({
      where: { id },
      include: { days: true },
    });
    if (!trip) throw new NotFoundException('行程不存在');

    const datesChanged =
      dto.startDate !== undefined || dto.endDate !== undefined;
    const dates = datesChanged
      ? this.parseRange(
          dto.startDate ?? dateKey(trip.startDate),
          dto.endDate ?? dateKey(trip.endDate),
        )
      : null;

    await this.prisma.$transaction(async (tx) => {
      await tx.trip.update({
        where: { id },
        data: {
          title: dto.title,
          destination: dto.destination,
          budgetTotal: dto.budgetTotal,
          coverUrl: dto.coverUrl,
          ...(dates ? { startDate: dates[0], endDate: dates[dates.length - 1] } : {}),
        },
      });
      if (dates) await this.syncDays(tx, id, trip.days, dates);
    });
    return this.detail(id);
  }

  /** 删除行程(级联删除 days/items/协作记录) */
  async remove(id: string) {
    await this.prisma.trip.delete({ where: { id } });
  }

  /**
   * 预算汇总:按类型/按天聚合条目预计花费,计算人均。
   * 成员数 = 协作者记录数(owner 也在 collaborators 表里,无需 +1)。
   */
  async budget(id: string) {
    const trip = await this.prisma.trip.findUnique({
      where: { id },
      include: {
        days: { orderBy: { dayIndex: 'asc' }, include: { items: true } },
        _count: { select: { collaborators: true } },
      },
    });
    if (!trip) throw new NotFoundException('行程不存在');

    const byType: Record<string, number> = {
      SPOT: 0,
      FOOD: 0,
      HOTEL: 0,
      TRANSPORT: 0,
    };
    let costedItemCount = 0;
    const byDay = trip.days.map((d) => {
      let total = 0;
      for (const it of d.items) {
        const c = toNum(it.cost);
        if (c !== null) {
          total += c;
          byType[it.type] = (byType[it.type] ?? 0) + c;
          costedItemCount++;
        }
      }
      return { dayIndex: d.dayIndex, date: dateKey(d.date), total };
    });
    const plannedTotal = byDay.reduce((s, d) => s + d.total, 0);
    const itemCount = trip.days.reduce((s, d) => s + d.items.length, 0);
    const memberCount = Math.max(trip._count.collaborators, 1);
    return {
      budgetTotal: toNum(trip.budgetTotal),
      plannedTotal,
      byType,
      byDay,
      itemCount,
      costedItemCount,
      memberCount,
      perPerson: plannedTotal / memberCount,
    };
  }

  /** 深拷贝行程 + days + items 为当前用户的新行程 */
  async copy(sourceId: string, userId: string) {
    const src = await this.prisma.trip.findUnique({
      where: { id: sourceId },
      include: {
        days: {
          orderBy: { dayIndex: 'asc' },
          include: { items: { orderBy: { orderIndex: 'asc' } } },
        },
      },
    });
    if (!src) throw new NotFoundException('行程不存在');

    const created = await this.prisma.$transaction(async (tx) => {
      const trip = await tx.trip.create({
        data: {
          ownerId: userId,
          title: `${src.title} 副本`,
          destination: src.destination,
          startDate: src.startDate,
          endDate: src.endDate,
          budgetTotal: src.budgetTotal,
          coverUrl: src.coverUrl,
        },
      });
      await tx.tripCollaborator.create({
        data: { tripId: trip.id, userId, role: 'OWNER' },
      });
      for (const day of src.days) {
        const newDay = await tx.tripDay.create({
          data: {
            tripId: trip.id,
            dayIndex: day.dayIndex,
            date: day.date,
            note: day.note,
          },
        });
        if (day.items.length) {
          await tx.itineraryItem.createMany({
            data: day.items.map((it) => ({
              dayId: newDay.id,
              orderIndex: it.orderIndex,
              type: it.type,
              title: it.title,
              poiId: it.poiId,
              lng: it.lng,
              lat: it.lat,
              startTime: it.startTime,
              endTime: it.endTime,
              cost: it.cost,
              note: it.note,
              rawAi:
                it.rawAi === null
                  ? Prisma.JsonNull
                  : (it.rawAi as Prisma.InputJsonValue),
            })),
          });
        }
      }
      return trip;
    });
    return this.detail(created.id);
  }

  /** 更新某一天的备注 */
  async updateDay(dayId: string, dto: UpdateDayDto) {
    const day = await this.prisma.tripDay.update({
      where: { id: dayId },
      data: { note: dto.note },
    });
    await this.bump(day.tripId);
    return day;
  }

  /** 在指定日期末尾追加条目(orderIndex = max + 1) */
  async createItem(dayId: string, dto: CreateItemDto) {
    const day = await this.prisma.tripDay.findUnique({ where: { id: dayId } });
    if (!day) throw new NotFoundException('行程日期不存在');
    const agg = await this.prisma.itineraryItem.aggregate({
      where: { dayId },
      _max: { orderIndex: true },
    });
    const item = await this.prisma.itineraryItem.create({
      data: {
        dayId,
        orderIndex: (agg._max.orderIndex ?? 0) + 1,
        type: dto.type ?? 'SPOT',
        title: dto.title,
        poiId: dto.poiId,
        lng: dto.lng,
        lat: dto.lat,
        startTime: dto.startTime,
        endTime: dto.endTime,
        cost: dto.cost,
        note: dto.note,
      },
    });
    await this.bump(day.tripId);
    return this.serializeItem(item);
  }

  /** 部分更新条目;传 dayId 可跨天移动(未给 orderIndex 时排到末尾) */
  async updateItem(itemId: string, dto: UpdateItemDto, tripId: string) {
    const item = await this.prisma.itineraryItem.findUnique({
      where: { id: itemId },
      include: { day: true },
    });
    if (!item) throw new NotFoundException('条目不存在');

    const data: Prisma.ItineraryItemUpdateInput = {
      type: dto.type,
      title: dto.title,
      poiId: dto.poiId,
      lng: dto.lng,
      lat: dto.lat,
      startTime: dto.startTime,
      endTime: dto.endTime,
      cost: dto.cost,
      note: dto.note,
    };
    if (dto.dayId && dto.dayId !== item.dayId) {
      const target = await this.prisma.tripDay.findUnique({
        where: { id: dto.dayId },
      });
      if (!target || target.tripId !== tripId) {
        throw new BadRequestException('目标日期不属于该行程');
      }
      data.day = { connect: { id: dto.dayId } };
      if (dto.orderIndex === undefined) {
        const agg = await this.prisma.itineraryItem.aggregate({
          where: { dayId: dto.dayId },
          _max: { orderIndex: true },
        });
        data.orderIndex = (agg._max.orderIndex ?? 0) + 1;
      } else {
        data.orderIndex = dto.orderIndex;
      }
    } else if (dto.orderIndex !== undefined) {
      data.orderIndex = dto.orderIndex;
    }

    const updated = await this.prisma.itineraryItem.update({
      where: { id: itemId },
      data,
    });
    await this.bump(tripId);
    return this.serializeItem(updated);
  }

  /** 删除条目 */
  async removeItem(itemId: string, tripId: string) {
    await this.prisma.itineraryItem.delete({ where: { id: itemId } });
    await this.bump(tripId);
  }

  /** 按数组顺序把某日条目重排为 orderIndex 1..n */
  async reorder(dto: ReorderItemsDto) {
    const day = await this.prisma.tripDay.findUnique({
      where: { id: dto.dayId },
    });
    if (!day) throw new NotFoundException('行程日期不存在');
    const items = await this.prisma.itineraryItem.findMany({
      where: { id: { in: dto.itemIds } },
    });
    if (
      items.length !== dto.itemIds.length ||
      items.some((i) => i.dayId !== dto.dayId)
    ) {
      throw new BadRequestException('存在不属于该日期的条目');
    }
    await this.prisma.$transaction(
      dto.itemIds.map((id, idx) =>
        this.prisma.itineraryItem.update({
          where: { id },
          data: { orderIndex: idx + 1 },
        }),
      ),
    );
    await this.bump(day.tripId);
    return { ok: true };
  }

  /** 同步 days:重合日期保留(必要时重排 dayIndex),缺失补建,多余删除 */
  private async syncDays(
    tx: Prisma.TransactionClient,
    tripId: string,
    existing: TripDay[],
    dates: Date[],
  ) {
    const indexOf = new Map(dates.map((d, i) => [dateKey(d), i]));
    const kept = existing.filter((d) => indexOf.has(dateKey(d.date)));
    await tx.tripDay.deleteMany({
      where: { tripId, date: { notIn: dates } },
    });
    // 两遍重排,避免 (tripId, dayIndex) 唯一约束中间态冲突
    for (const d of kept) {
      await tx.tripDay.update({
        where: { id: d.id },
        data: { dayIndex: -(indexOf.get(dateKey(d.date))! + 1) },
      });
    }
    for (const d of kept) {
      await tx.tripDay.update({
        where: { id: d.id },
        data: { dayIndex: indexOf.get(dateKey(d.date))! },
      });
    }
    const existingKeys = new Set(existing.map((d) => dateKey(d.date)));
    const toCreate = dates
      .map((date, i) => ({ tripId, dayIndex: i, date }))
      .filter((d) => !existingKeys.has(dateKey(d.date)));
    if (toCreate.length) {
      await tx.tripDay.createMany({ data: toCreate });
    }
  }

  private parseRange(startStr: string, endStr: string): Date[] {
    const start = new Date(startStr);
    const end = new Date(endStr);
    if (
      Number.isNaN(+start) ||
      Number.isNaN(+end) ||
      end.getTime() < start.getTime()
    ) {
      throw new BadRequestException('日期区间不合法');
    }
    const dates = eachDate(start, end);
    if (dates.length > 30) {
      throw new BadRequestException('日期区间不能超过 30 天');
    }
    return dates;
  }

  /** 触发 trip.updatedAt 刷新(列表按它排序) */
  private async bump(tripId: string) {
    await this.prisma.trip.update({
      where: { id: tripId },
      data: { updatedAt: new Date() },
    });
  }

  private serializeItem(it: ItineraryItem) {
    return { ...it, cost: toNum(it.cost) };
  }

  private serializeTrip(
    trip: Trip & { days: (TripDay & { items: ItineraryItem[] })[] },
  ) {
    return {
      ...trip,
      budgetTotal: toNum(trip.budgetTotal),
      days: trip.days.map((d) => ({
        ...d,
        items: d.items.map((i) => this.serializeItem(i)),
      })),
    };
  }
}
