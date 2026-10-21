import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { TripRoles } from './decorators/trip-roles.decorator.js';
import { ReorderItemsDto, UpdateItemDto } from './dto/trip.dto.js';
import type { TripAccess } from './guards/trip-access.guard.js';
import { TripAccessGuard } from './guards/trip-access.guard.js';
import { TripService } from './trip.service.js';

@Controller('items')
@UseGuards(JwtAuthGuard, TripAccessGuard)
@TripRoles('OWNER', 'EDITOR')
export class TripItemController {
  constructor(private readonly trip: TripService) {}

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateItemDto,
    @Req() req: Request,
  ) {
    const access = (req as Request & { tripAccess: TripAccess }).tripAccess;
    return this.trip.updateItem(id, dto, access.tripId);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string, @Req() req: Request) {
    const access = (req as Request & { tripAccess: TripAccess }).tripAccess;
    await this.trip.removeItem(id, access.tripId);
  }

  @Post('reorder')
  reorder(@Body() dto: ReorderItemsDto) {
    return this.trip.reorder(dto);
  }
}
