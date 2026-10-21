import {
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { User } from '@prisma/client';
import bcrypt from 'bcrypt';
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

describe('AuthService', () => {
  let service: AuthService;
  let jwt: JwtService;
  let prismaMock: {
    user: {
      findUnique: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
    };
  };
  let configMock: { get: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    jwt = new JwtService({ secret: 'test' });
    prismaMock = {
      user: { findUnique: vi.fn(), create: vi.fn() },
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
  });

  describe('login', () => {
    it('密码错误(bcrypt.compare 为 false)→ UnauthorizedException', async () => {
      const passwordHash = await bcrypt.hash('correct-pass', 10);
      prismaMock.user.findUnique.mockResolvedValue(fakeUser({ passwordHash }));
      await expect(
        service.login({ email: 'demo@lvtu.cn', password: 'wrong-pass' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('密码正确 → 返回令牌对', async () => {
      const passwordHash = await bcrypt.hash('correct-pass', 10);
      prismaMock.user.findUnique.mockResolvedValue(fakeUser({ passwordHash }));
      const result = await service.login({
        email: 'demo@lvtu.cn',
        password: 'correct-pass',
      });
      expect(result.accessToken).toBeTruthy();
      expect(result.refreshToken).toBeTruthy();
      expect(result.user.email).toBe('demo@lvtu.cn');
    });
  });

  describe('refresh', () => {
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

    it('合法 refresh token 且用户存在 → 返回新令牌对', async () => {
      const token = jwt.sign({ sub: 'u1', type: 'refresh' });
      prismaMock.user.findUnique.mockResolvedValue(fakeUser());
      const result = await service.refresh(token);
      expect(result.accessToken).toBeTruthy();
      expect(result.refreshToken).toBeTruthy();
      const payload = jwt.decode(result.refreshToken) as {
        sub: string;
        type?: string;
      };
      expect(payload.sub).toBe('u1');
      expect(payload.type).toBe('refresh');
    });
  });
});
