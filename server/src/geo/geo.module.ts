import { Module } from '@nestjs/common';
import { GeoController } from './geo.controller.js';
import { GeoService } from './geo.service.js';

@Module({
  controllers: [GeoController],
  providers: [GeoService],
  exports: [GeoService],
})
export class GeoModule {}
