import {
  Body,
  Controller,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { TripRoles } from './decorators/trip-roles.decorator.js';
import { CreateItemDto, UpdateDayDto } from './dto/trip.dto.js';
import { TripAccessGuard } from './guards/trip-access.guard.js';
import { TripService } from './trip.service.js';

@Controller('days')
@UseGuards(JwtAuthGuard, TripAccessGuard)
export class TripDayController {
  constructor(private readonly trip: TripService) {}

  @Patch(':dayId')
  @TripRoles('OWNER', 'EDITOR')
  updateDay(@Param('dayId') dayId: string, @Body() dto: UpdateDayDto) {
    return this.trip.updateDay(dayId, dto);
  }

  @Post(':dayId/items')
  @TripRoles('OWNER', 'EDITOR')
  createItem(@Param('dayId') dayId: string, @Body() dto: CreateItemDto) {
    return this.trip.createItem(dayId, dto);
  }
}
