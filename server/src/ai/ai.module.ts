import { Module } from '@nestjs/common';
import { GeoModule } from '../geo/geo.module.js';
import { TripModule } from '../trip/trip.module.js';
import { AiController } from './ai.controller.js';
import { AiService } from './ai.service.js';

@Module({
  imports: [GeoModule, TripModule],
  controllers: [AiController],
  providers: [AiService],
})
export class AiModule {}
