import { Global, Module } from '@nestjs/common';
import { redisClientProvider } from './redis.provider';
import { SessionService } from './session.service';

/**
 * Redis 模块
 *
 * 设为全局模块，导出 SessionService 和 REDIS_CLIENT，
 * 业务模块可直接注入 SessionService 进行会话操作。
 */
@Global()
@Module({
  providers: [redisClientProvider, SessionService],
  exports: [redisClientProvider, SessionService],
})
export class RedisModule {}
