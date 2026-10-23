import {
  Body,
  Controller,
  Logger,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { TripRoles } from '../trip/decorators/trip-roles.decorator.js';
import { TripAccessGuard } from '../trip/guards/trip-access.guard.js';
import { AiService } from './ai.service.js';
import type { SseEmit } from './ai.service.js';
import { ChatDto, FetchUrlDto, GenerateTripDto, ImportTripDto } from './dto/ai.dto.js';

@Controller('ai')
export class AiController {
  private readonly logger = new Logger(AiController.name);

  constructor(private readonly ai: AiService) {}

  @Post('trips/:id/generate')
  @UseGuards(JwtAuthGuard, TripAccessGuard)
  @TripRoles('OWNER', 'EDITOR')
  async generate(
    @Param('id') tripId: string,
    @Body() dto: GenerateTripDto,
    @Res() res: Response,
  ) {
    await this.runSse(res, (emit, signal) =>
      this.ai.generate(tripId, dto.preferences, emit, signal),
    );
  }

  @Post('trips/:id/chat')
  @UseGuards(JwtAuthGuard, TripAccessGuard)
  @TripRoles('OWNER', 'EDITOR')
  async chat(
    @Param('id') tripId: string,
    @Body() dto: ChatDto,
    @Res() res: Response,
  ) {
    await this.runSse(res, (emit, signal) =>
      this.ai.chat(tripId, dto.message, emit, signal),
    );
  }

  @Post('trips/:id/import')
  @UseGuards(JwtAuthGuard, TripAccessGuard)
  @TripRoles('OWNER', 'EDITOR')
  async importGuide(
    @Param('id') tripId: string,
    @Body() dto: ImportTripDto,
    @Res() res: Response,
  ) {
    await this.runSse(res, (emit, signal) =>
      this.ai.importFromText(tripId, dto.content, emit, signal),
    );
  }

  /** 为单独一天生成安排(空天/临时加的天);TripAccessGuard 按 dayId 定位行程 */
  @Post('days/:dayId/generate')
  @UseGuards(JwtAuthGuard, TripAccessGuard)
  @TripRoles('OWNER', 'EDITOR')
  async generateDay(@Param('dayId') dayId: string, @Res() res: Response) {
    await this.runSse(res, (emit, signal) =>
      this.ai.generateDay(dayId, emit, signal),
    );
  }

  /** 抓取攻略 URL 正文(尽力而为;反爬站点会失败,前端应允许用户改用手动粘贴) */
  @Post('fetch-url')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  fetchUrl(@Body() dto: FetchUrlDto) {
    return this.ai.fetchUrlText(dto.url);
  }

  /**
   * 初始化 SSE 响应并执行任务,保证结束时 res.end()。
   * 客户端断连:emit 变为空操作(避免向已关闭连接写入),
   * 同时 abort 信号传入 AI 任务——模型调用立即中断,且不再落库覆盖行程。
   */
  private async runSse(
    res: Response,
    task: (emit: SseEmit, signal: AbortSignal) => Promise<void>,
  ) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    const controller = new AbortController();
    let closed = false;
    res.on('close', () => {
      closed = true;
      controller.abort();
      this.logger.log('SSE 客户端提前断开连接,已通知 AI 任务取消');
    });
    const emit: SseEmit = (data) => {
      if (closed) return true;
      return res.write(`data: ${JSON.stringify(data)}\n\n`);
    };
    try {
      await task(emit, controller.signal);
    } catch (e) {
      // 客户端已断开时的取消异常属于正常路径,不再回报错误
      if (!closed) {
        this.logger.error(`AI 任务异常: ${e instanceof Error ? e.message : e}`);
        emit({ type: 'error', message: '生成失败,请重试' });
      }
    }
    if (!closed) res.end();
  }
}
