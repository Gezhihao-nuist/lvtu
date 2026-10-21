import {
  Body,
  Controller,
  Logger,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { TripRoles } from '../trip/decorators/trip-roles.decorator.js';
import { TripAccessGuard } from '../trip/guards/trip-access.guard.js';
import { AiService } from './ai.service.js';
import type { SseEmit } from './ai.service.js';
import { ChatDto, GenerateTripDto } from './dto/ai.dto.js';

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
    await this.runSse(res, (emit) =>
      this.ai.generate(tripId, dto.preferences, emit),
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
    await this.runSse(res, (emit) => this.ai.chat(tripId, dto.message, emit));
  }

  /** 初始化 SSE 响应并执行任务,保证结束时 res.end() */
  private async runSse(res: Response, task: (emit: SseEmit) => Promise<void>) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    const emit: SseEmit = (data) =>
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    try {
      await task(emit);
    } catch (e) {
      this.logger.error(`AI 任务异常: ${e instanceof Error ? e.message : e}`);
      emit({ type: 'error', message: '生成失败,请重试' });
    }
    res.end();
  }
}
