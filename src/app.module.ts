import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './auth/auth.module';

/**
 * 应用根模块。
 * - ConfigModule 全局加载配置（.env + configuration 工厂）。
 * - RedisModule 提供全局 Redis 会话存储能力。
 * - AuthModule 提供统一认证能力。
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: ['.env', '.env.example'],
    }),
    RedisModule,
    AuthModule,
  ],
})
export class AppModule {}
