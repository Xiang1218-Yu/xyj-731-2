import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';

/**
 * Redis 全局模块。
 * 使用 @Global 使 RedisService 在整个应用中可注入，无需重复 import。
 */
@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
