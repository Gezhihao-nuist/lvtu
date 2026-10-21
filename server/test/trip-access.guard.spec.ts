import type { ExecutionContext } from '@nestjs/common';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import { TripAccessGuard } from '../src/trip/guards/trip-access.guard.js';

/** 构造最小可用的 ExecutionContext */
function ctx(req: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('TripAccessGuard(行程成员权限)', () => {
  let guard: TripAccessGuard;
  let prismaMock: {
    trip: { findUnique: ReturnType<typeof vi.fn> };
    tripCollaborator: { findUnique: ReturnType<typeof vi.fn> };
    tripDay: { findUnique: ReturnType<typeof vi.fn> };
    itineraryItem: { findUnique: ReturnType<typeof vi.fn> };
  };
  let reflectorMock: { getAllAndOverride: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock = {
      trip: { findUnique: vi.fn() },
      tripCollaborator: { findUnique: vi.fn() },
      tripDay: { findUnique: vi.fn() },
      itineraryItem: { findUnique: vi.fn() },
    };
    reflectorMock = { getAllAndOverride: vi.fn().mockReturnValue(undefined) };
    guard = new TripAccessGuard(
      prismaMock as unknown as PrismaService,
      reflectorMock as unknown as Reflector,
    );
  });

  it('未登录:UnauthorizedException', async () => {
    const err = await guard
      .canActivate(ctx({ params: { tripId: 't1' } }))
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UnauthorizedException);
  });

  it('行程创建者:直接通过,挂 tripAccess OWNER,不查协作者表', async () => {
    prismaMock.trip.findUnique.mockResolvedValue({ ownerId: 'u1' });
    const req = { user: { sub: 'u1' }, params: { tripId: 't1' } };
    await expect(guard.canActivate(ctx(req))).resolves.toBe(true);
    expect(
      (req as { tripAccess?: { role: string } }).tripAccess?.role,
    ).toBe('OWNER');
    expect(prismaMock.tripCollaborator.findUnique).not.toHaveBeenCalled();
  });

  it('EDITOR 协作者:默认要求(含 EDITOR)通过', async () => {
    prismaMock.trip.findUnique.mockResolvedValue({ ownerId: 'u0' });
    prismaMock.tripCollaborator.findUnique.mockResolvedValue({ role: 'EDITOR' });
    const req = { user: { sub: 'u2' }, params: { tripId: 't1' } };
    await expect(guard.canActivate(ctx(req))).resolves.toBe(true);
  });

  it('VIEWER 请求 OWNER-only 接口:Forbidden 且提示仅创建者', async () => {
    reflectorMock.getAllAndOverride.mockReturnValue(['OWNER']);
    prismaMock.trip.findUnique.mockResolvedValue({ ownerId: 'u0' });
    prismaMock.tripCollaborator.findUnique.mockResolvedValue({ role: 'VIEWER' });
    const err = await guard
      .canActivate(ctx({ user: { sub: 'u2' }, params: { tripId: 't1' } }))
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ForbiddenException);
    expect((err as ForbiddenException).message).toContain('仅行程创建者');
  });

  it('非成员:Forbidden 不是该行程的成员', async () => {
    prismaMock.trip.findUnique.mockResolvedValue({ ownerId: 'u0' });
    prismaMock.tripCollaborator.findUnique.mockResolvedValue(null);
    const err = await guard
      .canActivate(ctx({ user: { sub: 'u9' }, params: { tripId: 't1' } }))
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ForbiddenException);
    expect((err as ForbiddenException).message).toContain('不是该行程的成员');
  });

  it('行程不存在:NotFoundException', async () => {
    prismaMock.trip.findUnique.mockResolvedValue(null);
    const err = await guard
      .canActivate(ctx({ user: { sub: 'u1' }, params: { tripId: 'tX' } }))
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NotFoundException);
  });

  it('params.id 是条目 id:经 itineraryItem.day 定位 trip 并放行创建者', async () => {
    // 第一次按 trip 查不到,第二次按 item 查到 day.tripId,第三次按 trip 查 ownerId
    prismaMock.trip.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ownerId: 'u1' });
    prismaMock.itineraryItem.findUnique.mockResolvedValue({
      day: { tripId: 't1' },
    });
    const req = { user: { sub: 'u1' }, params: { id: 'item1' } };
    await expect(guard.canActivate(ctx(req))).resolves.toBe(true);
    expect(
      (req as { tripAccess?: { tripId: string } }).tripAccess?.tripId,
    ).toBe('t1');
  });

  it('无法从请求定位行程:BadRequestException', async () => {
    const err = await guard
      .canActivate(ctx({ user: { sub: 'u1' }, params: {}, body: {} }))
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BadRequestException);
  });
});
