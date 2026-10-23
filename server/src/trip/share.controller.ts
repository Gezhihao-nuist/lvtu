import { Controller, Get, Param } from '@nestjs/common';
import { TripService } from './trip.service.js';

/**
 * 公开分享接口:故意不挂 JwtAuthGuard。
 * 行程 id 是不可猜测的 cuid,且仅当 owner 显式把 visibility
 * 设为 LINK 时才返回数据,关闭分享立即失效。
 */
@Controller('share')
export class ShareController {
  constructor(private readonly trip: TripService) {}

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.trip.publicDetail(id);
  }
}
