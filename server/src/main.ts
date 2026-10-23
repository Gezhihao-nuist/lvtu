import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // 全局前缀:所有 REST 端点挂在 /api/v1 下
  app.setGlobalPrefix('api/v1');
  app.use(helmet());
  app.use(cookieParser());
  // 允许的来源走 env(逗号分隔),默认本地开发端口
  app.enableCors({
    origin: (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
      .split(',')
      .map((o) => o.trim()),
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
