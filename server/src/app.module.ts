import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { z } from 'zod';
import { AiModule } from './ai/ai.module.js';
import { AppController } from './app.controller.js';
import { AuthModule } from './auth/auth.module.js';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';
import { GeoModule } from './geo/geo.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { TripModule } from './trip/trip.module.js';

/** 启动时校验必需环境变量,缺失直接拒绝启动(而不是首次用到才 500) */
const envSchema = z.looseObject({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL 未配置'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET 至少 16 位'),
});

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (config) => envSchema.parse(config),
    }),
    // 全局限流:每 IP 每分钟 120 次;敏感端点在控制器上再收紧
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    PrismaModule,
    AuthModule,
    TripModule,
    AiModule,
    GeoModule,
  ],
  controllers: [AppController],
  providers: [
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
