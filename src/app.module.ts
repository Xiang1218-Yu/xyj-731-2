/**
 * 应用根模块
 *
 * 组装所有功能模块:
 *  - ConfigModule: 全局环境配置
 *  - AuthModule: 统一身份认证（JWT/OAuth2/LDAP + 策略模式 + 守卫）
 *  - SessionModule: Redis 会话存储
 *  - UsersModule: 用户数据服务
 *  - HealthController: 健康检查
 */
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import configuration from './config/configuration';
import { HealthController } from './health.controller';
import { SessionModule } from './session/session.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    // 全局配置模块，加载 .env 并提供类型化配置
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: ['.env'],
    }),
    UsersModule,
    SessionModule,
    AuthModule,
  ],
  controllers: [HealthController],
  providers: [
    // 全局异常过滤器，统一错误响应格式
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
  ],
})
export class AppModule {}
