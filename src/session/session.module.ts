/**
 * 会话模块
 *
 * 组装 Redis 存储、内存存储与会话服务，并对外导出 SessionService。
 */
import { Module } from '@nestjs/common';
import { MemorySessionStore } from './memory-session.store';
import { RedisSessionStore } from './redis-session.store';
import { SessionService } from './session.service';

@Module({
  providers: [RedisSessionStore, MemorySessionStore, SessionService],
  exports: [SessionService],
})
export class SessionModule {}
