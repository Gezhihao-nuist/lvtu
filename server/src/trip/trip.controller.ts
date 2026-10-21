import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import type { AuthUser } from '../common/guards/jwt-auth.guard.js';
import { TripRoles } from './decorators/trip-roles.decorator.js';
import { CreateTripDto, UpdateTripDto } from './dto/trip.dto.js';
import { TripAccessGuard } from './guards/trip-access.guard.js';
import { TripService } from './trip.service.js';

@Controller('trips')
@UseGuards(JwtAuthGuard)
export class TripController {
  constructor(private readonly trip: TripService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.trip.list(user.sub);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTripDto) {
    return this.trip.create(user.sub, dto);
  }

  @Get(':id')
  @UseGuards(TripAccessGuard)
  detail(@Param('id') id: string) {
    return this.trip.detail(id);
  }

  @Patch(':id')
  @UseGuards(TripAccessGuard)
  @TripRoles('OWNER', 'EDITOR')
  update(@Param('id') id: string, @Body() dto: UpdateTripDto) {
    return this.trip.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(TripAccessGuard)
  @TripRoles('OWNER')
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    await this.trip.remove(id);
  }

  @Post(':id/copy')
  @UseGuards(TripAccessGuard)
  copy(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.trip.copy(id, user.sub);
  }
}
