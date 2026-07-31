import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/config.module';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './auth/auth.module';

/**
 * 应用根模块
 *
 * 装配各功能模块：
 *  - AppConfigModule：全局环境配置
 *  - RedisModule：Redis 连接与会话存储（全局）
 *  - AuthModule：统一认证（策略模式 + JWT/OAuth2/LDAP + RBAC）
 */
@Module({
  imports: [AppConfigModule, RedisModule, AuthModule],
})
export class AppModule {}
