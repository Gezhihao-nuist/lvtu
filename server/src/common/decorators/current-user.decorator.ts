import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthUser } from '../guards/jwt-auth.guard.js';

/** 从 request 上取出 JwtAuthGuard 写入的用户载荷 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser =>
    ctx.switchToHttp().getRequest().user,
);
