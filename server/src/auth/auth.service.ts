import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import bcrypt from 'bcrypt';
import { createHash, randomUUID } from 'node:crypto';
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

  /** 并发宽限窗:同一 token 30 秒内的重复使用视为多标签页并发刷新,容忍;超窗重放 = 被盗 */
  private static readonly REUSE_GRACE_MS = 30_000;

  /**
   * 校验 refresh token 并轮换签发新令牌对。
   * 会话行只打 consumedAt 标记不删除(原子 updateMany 消费,并发安全):
   * - 哈希不存在:不明 token(可能伪造)→ 吊销全部会话;
   * - 消费成功(并发中只有一方能抢到):正常轮换;
   * - 已被消费但在宽限窗内:多标签页并发竞态,容忍签发;
   * - 已被消费且超宽限窗:旧 token 重放(可能被盗)→ 吊销全部会话。
   */
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
    const tokenHash = this.hashToken(token);
    const session = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (!session) {
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });
      if (!user) throw new UnauthorizedException('用户不存在');
      await this.prisma.refreshToken.deleteMany({
        where: { userId: payload.sub },
      });
      throw new UnauthorizedException('登录状态异常,请重新登录');
    }
    if (session.expiresAt.getTime() < Date.now()) {
      await this.prisma.refreshToken.delete({ where: { id: session.id } });
      throw new UnauthorizedException('refresh token 无效或已过期');
    }

    // 原子消费:并发场景只有一个请求能把 consumedAt 从 null 打上标记
    const consumed = await this.prisma.refreshToken.updateMany({
      where: { id: session.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (consumed.count === 0) {
      // 已被消费过:重新读行判断是并发竞态还是超窗重放
      const fresh = await this.prisma.refreshToken.findUnique({
        where: { id: session.id },
      });
      const consumedAgo = fresh?.consumedAt
        ? Date.now() - fresh.consumedAt.getTime()
        : Number.POSITIVE_INFINITY;
      if (!fresh || consumedAgo > AuthService.REUSE_GRACE_MS) {
        await this.prisma.refreshToken.deleteMany({
          where: { userId: session.userId },
        });
        throw new UnauthorizedException('登录状态异常,请重新登录');
      }
    }
    // 顺手清理该用户过期会话
    await this.prisma.refreshToken.deleteMany({
      where: { userId: session.userId, expiresAt: { lt: new Date() } },
    });
    return this.buildAuthPayload(session.user);
  }

  /** 注销:删除服务端会话(尽力而为,token 无效也照常返回) */
  async logout(token: string | undefined) {
    if (!token) return;
    await this.prisma.refreshToken.deleteMany({
      where: { tokenHash: this.hashToken(token) },
    });
  }

  /** 按 ID 查询当前用户信息 */
  async me(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('用户不存在');
    return this.serializeUser(user);
  }

  private async buildAuthPayload(user: User) {
    const accessToken = this.jwt.sign(
      { sub: user.id, email: user.email },
      { expiresIn: this.cfg.get('JWT_ACCESS_TTL') ?? '15m' },
    );
    const refreshTtl = this.cfg.get('JWT_REFRESH_TTL') ?? '7d';
    // jti 保证每次签发的 token 唯一(否则同一秒内 payload 相同 → JWT 与哈希完全相同,轮换失效)
    const refreshToken = this.jwt.sign(
      { sub: user.id, type: 'refresh', jti: randomUUID() },
      { expiresIn: refreshTtl },
    );
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(refreshToken),
        expiresAt: new Date(Date.now() + this.ttlMs(refreshTtl)),
      },
    });
    return { user: this.serializeUser(user), accessToken, refreshToken };
  }

  /** token 用 sha256 落库:高熵值无需加盐,且规避 bcrypt 72 字节截断问题 */
  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  /** 解析 '7d'/'15m'/'30s'/'12h' 形式的 TTL,非法值回退 7 天 */
  private ttlMs(raw: string) {
    const m = /^(\d+)\s*([smhd])$/.exec(raw.trim());
    if (!m) return 7 * 24 * 3600 * 1000;
    const unit = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[
      m[2] as 's' | 'm' | 'h' | 'd'
    ];
    return Number(m[1]) * unit;
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
