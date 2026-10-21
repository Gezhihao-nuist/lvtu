import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import {
  PoiQueryDto,
  RouteQueryDto,
  RoutesBodyDto,
} from './dto/geo-query.dto.js';
import { GeoService } from './geo.service.js';

@UseGuards(JwtAuthGuard)
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

  @Post('routes')
  routes(@Body() body: RoutesBodyDto) {
    return this.geo.routes(body.points, body.mode);
  }
}
