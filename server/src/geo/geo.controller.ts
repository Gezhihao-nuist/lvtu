import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import {
  DistrictQueryDto,
  PoiQueryDto,
  RouteQueryDto,
  RoutesBodyDto,
  WeatherQueryDto,
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

  @Get('tips')
  async tips(@Query() query: PoiQueryDto) {
    const tips = await this.geo.getTips(query.keyword, query.city);
    return { tips };
  }

  @Get('weather')
  async weather(@Query() query: WeatherQueryDto) {
    const casts = await this.geo.getWeather(query.city);
    return { casts };
  }

  /** 城市中心坐标(足迹地图用) */
  @Get('district')
  async district(@Query() query: DistrictQueryDto) {
    const center = await this.geo.getCityCenter(query.city);
    return { center };
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
