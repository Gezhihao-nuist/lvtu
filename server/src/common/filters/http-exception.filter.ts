import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';

/** Prisma 已知请求错误 → HTTP 映射;未列出的 code 走 500 */
const PRISMA_ERROR_MAP: Record<string, { status: number; message: string }> = {
  P2002: { status: 409, message: '记录已存在或与现有数据冲突' },
  P2025: { status: 404, message: '记录不存在或已被删除' },
};

/**
 * 全局异常过滤器(@Catch() 全捕获):
 * - HttpException 保持 {statusCode, message, timestamp} 格式;
 * - Prisma 已知错误映射为友好 4xx,不再裸 500;
 * - 未知异常统一 500 兜底,细节只进日志不外泄。
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const message =
        typeof body === 'string'
          ? body
          : ((body as { message?: unknown }).message ?? exception.message);
      res.status(status).json({
        statusCode: status,
        message,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const hit = PRISMA_ERROR_MAP[exception.code];
      if (!hit) {
        this.logger.error(`Prisma 未映射错误 ${exception.code}: ${exception.message}`);
      }
      const status = hit?.status ?? 500;
      res.status(status).json({
        statusCode: status,
        message: hit?.message ?? '数据库操作失败',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    this.logger.error(
      `未捕获异常: ${exception instanceof Error ? (exception.stack ?? exception.message) : String(exception)}`,
    );
    res.status(500).json({
      statusCode: 500,
      message: '服务器内部错误',
      timestamp: new Date().toISOString(),
    });
  }
}
