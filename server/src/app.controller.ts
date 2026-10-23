import { Controller, Get } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service.js';

@Controller()
export class AppController {
  constructor(private readonly prisma: PrismaService) {}

  /** 就绪探针:DB 不通直接 500(K8s readiness / 部署健康检查用) */
  @Get('health')
  async health() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', db: 'up', service: 'lvtu-server' };
  }
}
