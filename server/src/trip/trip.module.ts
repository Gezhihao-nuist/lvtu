import { Module } from '@nestjs/common';
import { TripAccessGuard } from './guards/trip-access.guard.js';
import { TripDayController } from './trip-day.controller.js';
import { TripItemController } from './trip-item.controller.js';
import { TripController } from './trip.controller.js';
import { TripService } from './trip.service.js';

@Module({
  controllers: [TripController, TripDayController, TripItemController],
  providers: [TripService, TripAccessGuard],
  exports: [TripAccessGuard],
})
export class TripModule {}
