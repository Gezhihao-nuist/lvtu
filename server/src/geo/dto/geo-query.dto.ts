import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

const LNG_LAT = /^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/;

export class PoiQueryDto {
  @IsString()
  @MinLength(1)
  keyword: string;

  @IsOptional()
  @IsString()
  city?: string;
}

export class WeatherQueryDto {
  @IsString()
  @MinLength(1)
  city: string;
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

export class RoutePointDto {
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng: number;

  @IsNumber()
  @Min(-90)
  @Max(90)
  lat: number;
}

/** 批量路径规划:2~25 个途经点,mode=auto 时按直线距离自动选步行/驾车 */
export class RoutesBodyDto {
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(25)
  @ValidateNested({ each: true })
  @Type(() => RoutePointDto)
  points: RoutePointDto[];

  @IsOptional()
  @IsIn(['walking', 'driving', 'transit', 'auto'])
  mode: 'walking' | 'driving' | 'transit' | 'auto' = 'auto';
}
