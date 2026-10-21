import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CollabRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { TRIP_ROLES_KEY } from '../decorators/trip-roles.decorator.js';

export interface TripAccess {
  tripId: string;
  role: CollabRole;
}

/**
 * 行程成员守卫:从路由参数(params.tripId / params.id / params.dayId)
 * 或请求体(body.dayId)定位 trip,校验当前用户的成员身份与角色,
 * 通过后把 { tripId, role } 挂到 request.tripAccess。
 */
@Injectable()
export class TripAccessGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const user = req.user as { sub: string } | undefined;
    if (!user) throw new UnauthorizedException('未登录');

    const required =
      this.reflector.getAllAndOverride<CollabRole[]>(TRIP_ROLES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? ['OWNER', 'EDITOR', 'VIEWER'];

    const tripId = await this.resolveTripId(req);
    if (!tripId) throw new BadRequestException('无法从请求中定位行程');

    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { ownerId: true },
    });
    if (!trip) throw new NotFoundException('行程不存在');

    let role: CollabRole | null = null;
    if (trip.ownerId === user.sub) {
      role = 'OWNER';
    } else {
      const collab = await this.prisma.tripCollaborator.findUnique({
        where: { tripId_userId: { tripId, userId: user.sub } },
        select: { role: true },
      });
      role = collab?.role ?? null;
    }
    if (!role) throw new ForbiddenException('你不是该行程的成员');
    if (!required.includes(role)) {
      throw new ForbiddenException(
        required.length === 1 && required[0] === 'OWNER'
          ? '仅行程创建者可执行此操作'
          : '需要该行程的编辑权限',
      );
    }

    req.tripAccess = { tripId, role } satisfies TripAccess;
    return true;
  }

  private async resolveTripId(req: any): Promise<string | null> {
    const params = req.params ?? {};
    if (params.tripId) return params.tripId as string;
    if (params.dayId) {
      const day = await this.prisma.tripDay.findUnique({
        where: { id: params.dayId },
        select: { tripId: true },
      });
      return day?.tripId ?? null;
    }
    if (params.id) {
      const trip = await this.prisma.trip.findUnique({
        where: { id: params.id },
        select: { id: true },
      });
      if (trip) return trip.id;
      const item = await this.prisma.itineraryItem.findUnique({
        where: { id: params.id },
        select: { day: { select: { tripId: true } } },
      });
      return item?.day.tripId ?? null;
    }
    if (req.body?.dayId) {
      const day = await this.prisma.tripDay.findUnique({
        where: { id: req.body.dayId },
        select: { tripId: true },
      });
      return day?.tripId ?? null;
    }
    return null;
  }
}
