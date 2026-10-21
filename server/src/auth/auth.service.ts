import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly cfg: ConfigService,
  ) {}

  /** 注册新用户并签发令牌对 */
  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();
    const exists = await this.prisma.user.findUnique({
      where: { email },
    });
    if (exists) throw new ConflictException('该邮箱已被注册');
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: { email, passwordHash, nickname: dto.nickname.trim() },
    });
    return this.buildAuthPayload(user);
  }

  /** 校验邮箱密码并签发令牌对 */
  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.trim().toLowerCase() },
    });
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('邮箱或密码错误');
    }
    return this.buildAuthPayload(user);
  }

  /** 校验 refresh token 并轮换签发新令牌对 */
  async refresh(token: string) {
    let payload: { sub: string; type?: string };
    try {
      payload = await this.jwt.verifyAsync(token);
    } catch {
      throw new UnauthorizedException('refresh token 无效或已过期');
    }
    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('refresh token 无效或已过期');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user) throw new UnauthorizedException('用户不存在');
    return this.buildAuthPayload(user);
  }

  /** 按 ID 查询当前用户信息 */
  async me(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('用户不存在');
    return this.serializeUser(user);
  }

  private buildAuthPayload(user: User) {
    const accessToken = this.jwt.sign(
      { sub: user.id, email: user.email },
      { expiresIn: this.cfg.get('JWT_ACCESS_TTL') ?? '15m' },
    );
    const refreshToken = this.jwt.sign(
      { sub: user.id, type: 'refresh' },
      { expiresIn: this.cfg.get('JWT_REFRESH_TTL') ?? '7d' },
    );
    return { user: this.serializeUser(user), accessToken, refreshToken };
  }

  private serializeUser(user: User) {
    return {
      id: user.id,
      email: user.email,
      nickname: user.nickname,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt,
    };
  }
}
