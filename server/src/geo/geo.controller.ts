import { Controller, Get, Query } from '@nestjs/common';
import { PoiQueryDto, RouteQueryDto } from './dto/geo-query.dto.js';
import { GeoService } from './geo.service.js';

@Controller('geo')
export class GeoController {
  constructor(private readonly geo: GeoService) {}

  @Get('poi')
  async poi(@Query() query: PoiQueryDto) {
    const pois = await this.geo.searchPoi(query.keyword, query.city);
    return { pois };
  }

  @Get('route')
  route(@Query() query: RouteQueryDto) {
    return this.geo.route(query.from, query.to, query.mode);
  }
}
