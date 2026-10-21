import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

export interface AuthUser {
  sub: string;
  email: string;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  /** 校验 Authorization 头中的 access token,通过后把载荷挂到 request.user */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const header: string | undefined = req.headers?.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('缺少访问令牌');
    }
    try {
      req.user = await this.jwt.verifyAsync<AuthUser>(header.slice(7));
    } catch {
      throw new UnauthorizedException('访问令牌无效或已过期');
    }
    return true;
  }
}
