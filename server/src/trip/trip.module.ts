import { Module } from '@nestjs/common';
import { GeoModule } from '../geo/geo.module.js';
import { TripAccessGuard } from './guards/trip-access.guard.js';
import { ShareController } from './share.controller.js';
import { TripDayController } from './trip-day.controller.js';
import { TripItemController } from './trip-item.controller.js';
import { TripController } from './trip.controller.js';
import { TripHealthService } from './trip-health.service.js';
import { TripService } from './trip.service.js';

@Module({
  imports: [GeoModule],
  controllers: [TripController, TripDayController, TripItemController, ShareController],
  providers: [TripService, TripHealthService, TripAccessGuard],
  exports: [TripAccessGuard],
})
export class TripModule {}
