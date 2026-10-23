import {
  BadRequestException,
  NotFoundException,
  type ArgumentsHost,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter.js';

/** 构造最小 ArgumentsHost,捕获 status/json 调用 */
function mockHost() {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  return {
    host: {
      switchToHttp: () => ({ getResponse: () => ({ status }) }),
    } as unknown as ArgumentsHost,
    status,
    json,
  };
}

describe('HttpExceptionFilter(全局兜底)', () => {
  const filter = new HttpExceptionFilter();

  it('HttpException:保持 {statusCode, message, timestamp} 格式', () => {
    const { host, status, json } = mockHost();
    filter.catch(new NotFoundException('行程不存在'), host);
    expect(status).toHaveBeenCalledWith(404);
    const body = json.mock.calls[0]?.[0] as {
      statusCode: number;
      message: string;
      timestamp: string;
    };
    expect(body.statusCode).toBe(404);
    expect(body.message).toBe('行程不存在');
    expect(body.timestamp).toBeTruthy();
  });

  it('HttpException:message 为数组时原样带出(class-validator 场景)', () => {
    const { host, json } = mockHost();
    filter.catch(
      new BadRequestException({ message: ['密码需至少 8 位'] }),
      host,
    );
    const body = json.mock.calls[0]?.[0] as { message: string[] };
    expect(body.message).toEqual(['密码需至少 8 位']);
  });

  it('Prisma P2002(唯一约束冲突)→ 409,不裸 500', () => {
    const { host, status, json } = mockHost();
    const err = new Prisma.PrismaClientKnownRequestError('Unique constraint', {
      code: 'P2002',
      clientVersion: '6.19.3',
    });
    filter.catch(err, host);
    expect(status).toHaveBeenCalledWith(409);
    const body = json.mock.calls[0]?.[0] as { message: string };
    expect(body.message).toContain('冲突');
  });

  it('Prisma P2025(记录不存在)→ 404', () => {
    const { host, status } = mockHost();
    const err = new Prisma.PrismaClientKnownRequestError('Record not found', {
      code: 'P2025',
      clientVersion: '6.19.3',
    });
    filter.catch(err, host);
    expect(status).toHaveBeenCalledWith(404);
  });

  it('未知异常 → 500 通用文案,不泄露内部细节', () => {
    const { host, status, json } = mockHost();
    filter.catch(new Error('DB 连接串是 postgres://secret@host/db'), host);
    expect(status).toHaveBeenCalledWith(500);
    const body = json.mock.calls[0]?.[0] as {
      statusCode: number;
      message: string;
    };
    expect(body.statusCode).toBe(500);
    expect(body.message).toBe('服务器内部错误');
    expect(body.message).not.toContain('secret');
  });
});
