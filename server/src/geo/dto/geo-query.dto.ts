import { IsIn, IsOptional, IsString, Matches, MinLength } from 'class-validator';

const LNG_LAT = /^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/;

export class PoiQueryDto {
  @IsString()
  @MinLength(1)
  keyword: string;

  @IsOptional()
  @IsString()
  city?: string;
}

export class RouteQueryDto {
  @Matches(LNG_LAT, { message: 'from 应为 lng,lat 格式' })
  from: string;

  @Matches(LNG_LAT, { message: 'to 应为 lng,lat 格式' })
  to: string;

  @IsOptional()
  @IsIn(['walking', 'driving', 'transit'])
  mode: 'walking' | 'driving' | 'transit' = 'walking';
}
