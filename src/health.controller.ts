/**
 * 健康检查控制器
 *
 * 提供基础的服务健康检查接口，包含会话存储类型信息，
 * 可用于容器探针（liveness/readiness）与运维监控。
 */
import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from './common/decorators/public.decorator';
import { SessionService } from './session/session.service';

@ApiTags('health - 健康检查')
@Controller('health')
export class HealthController {
  constructor(private readonly sessionService: SessionService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: '健康检查' })
  check() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      sessionStore: this.sessionService.getStoreType(),
      uptime: process.uptime(),
    };
  }
}
