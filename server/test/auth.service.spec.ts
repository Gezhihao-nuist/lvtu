import {
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { User } from '@prisma/client';
import bcrypt from 'bcrypt';
import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../src/auth/auth.service.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';

const fakeUser = (overrides: Partial<User> = {}): User =>
  ({
    id: 'u1',
    email: 'demo@lvtu.cn',
    passwordHash: 'x',
    nickname: 'Demo',
    avatarUrl: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  }) as User;

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

describe('AuthService', () => {
  let service: AuthService;
  let jwt: JwtService;
  let prismaMock: {
    user: {
      findUnique: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
    };
    refreshToken: {
      create: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
      deleteMany: ReturnType<typeof vi.fn>;
    };
  };
  let configMock: { get: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    jwt = new JwtService({ secret: 'test' });
    prismaMock = {
      user: { findUnique: vi.fn(), create: vi.fn() },
      refreshToken: {
        create: vi.fn(),
        findUnique: vi.fn(),
        delete: vi.fn(),
        deleteMany: vi.fn(),
      },
    };
    configMock = { get: vi.fn().mockReturnValue(undefined) };
    service = new AuthService(
      prismaMock as unknown as PrismaService,
      jwt,
      configMock as unknown as ConfigService,
    );
  });

  describe('register', () => {
    it('邮箱归一化:findUnique / create 收到 trim + 小写后的 email', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      prismaMock.user.create.mockResolvedValue(fakeUser());

      await service.register({
        email: '  Demo@LVTU.cn  ',
        password: 'secret123',
        nickname: 'Demo',
      });

      expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'demo@lvtu.cn' },
      });
      expect(prismaMock.user.create).toHaveBeenCalledTimes(1);
      const createArg = prismaMock.user.create.mock.calls[0]?.[0] as {
        data: { email: string; passwordHash: string; nickname: string };
      };
      expect(createArg.data.email).toBe('demo@lvtu.cn');
      expect(createArg.data.passwordHash).not.toBe('secret123');
    });

    it('重复注册:findUnique 返回已有用户 → ConflictException(409)', async () => {
      prismaMock.user.findUnique.mockResolvedValue(fakeUser());
      const err = await service
        .register({
          email: 'demo@lvtu.cn',
          password: 'secret123',
          nickname: 'Demo',
        })
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ConflictException);
      expect((err as ConflictException).getStatus()).toBe(409);
      expect(prismaMock.user.create).not.toHaveBeenCalled();
    });

    it('注册成功:服务端落一条 refresh 会话(sha256 哈希)', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      prismaMock.user.create.mockResolvedValue(fakeUser());
      const result = await service.register({
        email: 'demo@lvtu.cn',
        password: 'secret123',
        nickname: 'Demo',
      });
      expect(prismaMock.refreshToken.create).toHaveBeenCalledTimes(1);
      const arg = prismaMock.refreshToken.create.mock.calls[0]?.[0] as {
        data: { userId: string; tokenHash: string; expiresAt: Date };
      };
      expect(arg.data.userId).toBe('u1');
      expect(arg.data.tokenHash).toBe(sha256(result.refreshToken));
      expect(arg.data.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('login', () => {
    it('密码错误(bcrypt.compare 为 false)→ UnauthorizedException', async () => {
      const passwordHash = await bcrypt.hash('correct-pass', 10);
      prismaMock.user.findUnique.mockResolvedValue(fakeUser({ passwordHash }));
      await expect(
        service.login({ email: 'demo@lvtu.cn', password: 'wrong-pass' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('密码正确 → 返回令牌对并落会话', async () => {
      const passwordHash = await bcrypt.hash('correct-pass', 10);
      prismaMock.user.findUnique.mockResolvedValue(fakeUser({ passwordHash }));
      const result = await service.login({
        email: 'demo@lvtu.cn',
        password: 'correct-pass',
      });
      expect(result.accessToken).toBeTruthy();
      expect(result.refreshToken).toBeTruthy();
      expect(result.user.email).toBe('demo@lvtu.cn');
      expect(prismaMock.refreshToken.create).toHaveBeenCalledTimes(1);
    });

    it('jti 回归:同一秒内连续签发,两个 refresh token 必须不同', async () => {
      const passwordHash = await bcrypt.hash('correct-pass', 10);
      prismaMock.user.findUnique.mockResolvedValue(fakeUser({ passwordHash }));
      const r1 = await service.login({
        email: 'demo@lvtu.cn',
        password: 'correct-pass',
      });
      const r2 = await service.login({
        email: 'demo@lvtu.cn',
        password: 'correct-pass',
      });
      expect(r1.refreshToken).not.toBe(r2.refreshToken);
    });
  });

  describe('refresh(服务端会话轮换)', () => {
    const sessionOf = (token: string, expired = false) => ({
      id: 'rt1',
      userId: 'u1',
      tokenHash: sha256(token),
      expiresAt: new Date(
        Date.now() + (expired ? -1000 : 7 * 24 * 3600 * 1000),
      ),
      createdAt: new Date(),
      user: fakeUser(),
    });

    it('无 type:refresh 的 access token → UnauthorizedException', async () => {
      const token = jwt.sign({ sub: 'u1', email: 'demo@lvtu.cn' });
      await expect(service.refresh(token)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('伪造 token(签名错误)→ UnauthorizedException', async () => {
      const other = new JwtService({ secret: 'other-secret' });
      const token = other.sign({ sub: 'u1', type: 'refresh' });
      await expect(service.refresh(token)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('合法会话 → 轮换:旧哈希删除 + 新会话落库 + 返回新令牌对', async () => {
      const token = jwt.sign({ sub: 'u1', type: 'refresh' });
      prismaMock.refreshToken.findUnique.mockResolvedValue(sessionOf(token));
      const result = await service.refresh(token);
      expect(result.accessToken).toBeTruthy();
      expect(result.refreshToken).toBeTruthy();
      // 旧会话一次性作废
      expect(prismaMock.refreshToken.delete).toHaveBeenCalledWith({
        where: { id: 'rt1' },
      });
      // 新会话落库
      expect(prismaMock.refreshToken.create).toHaveBeenCalledTimes(1);
      const payload = jwt.decode(result.refreshToken) as {
        sub: string;
        type?: string;
      };
      expect(payload.sub).toBe('u1');
      expect(payload.type).toBe('refresh');
    });

    it('JWT 合法但服务端无此会话(旧 token 重用)→ 吊销全部会话 + 401', async () => {
      const token = jwt.sign({ sub: 'u1', type: 'refresh' });
      prismaMock.refreshToken.findUnique.mockResolvedValue(null);
      prismaMock.user.findUnique.mockResolvedValue(fakeUser());
      await expect(service.refresh(token)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(prismaMock.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'u1' },
      });
      expect(prismaMock.refreshToken.create).not.toHaveBeenCalled();
    });

    it('会话已过期 → 删除该行 + 401', async () => {
      const token = jwt.sign({ sub: 'u1', type: 'refresh' });
      prismaMock.refreshToken.findUnique.mockResolvedValue(
        sessionOf(token, true),
      );
      await expect(service.refresh(token)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(prismaMock.refreshToken.delete).toHaveBeenCalledWith({
        where: { id: 'rt1' },
      });
      expect(prismaMock.refreshToken.create).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('删除对应哈希的服务端会话', async () => {
      const token = jwt.sign({ sub: 'u1', type: 'refresh' });
      await service.logout(token);
      expect(prismaMock.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { tokenHash: sha256(token) },
      });
    });

    it('无 token:静默返回,不查库', async () => {
      await service.logout(undefined);
      expect(prismaMock.refreshToken.deleteMany).not.toHaveBeenCalled();
    });
  });
});
