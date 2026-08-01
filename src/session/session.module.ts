import { Global, Module } from '@nestjs/common';
import { SessionService } from './session.service';

/**
 * 会话模块（全局）
 * 提供基于 Redis 的会话存储能力，Redis 不可用时自动降级为内存存储
 */
@Global()
@Module({
  providers: [SessionService],
  exports: [SessionService],
})
export class SessionModule {}
