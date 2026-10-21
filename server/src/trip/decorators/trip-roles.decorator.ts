import { SetMetadata } from '@nestjs/common';
import { CollabRole } from '@prisma/client';

export const TRIP_ROLES_KEY = 'tripRoles';

/** 声明路由允许的成员角色;不标注则默认 OWNER/EDITOR/VIEWER 均可(读) */
export const TripRoles = (...roles: CollabRole[]) =>
  SetMetadata(TRIP_ROLES_KEY, roles);
