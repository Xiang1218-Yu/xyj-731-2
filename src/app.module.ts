import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import configuration from './config/configuration';
import { SessionModule } from './session/session.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { PermissionsGuard } from './auth/guards/permissions.guard';
import { TimeoutInterceptor } from './common/interceptors/timeout.interceptor';

const config = configuration();

/**
 * 应用根模块
 * 注册全局守卫：先校验 JWT 身份，再校验接口所需权限
 */
@Module({
  imports: [
    // 全局注册 JwtModule，供令牌签发 / 校验使用
    JwtModule.register({
      global: true,
      secret: config.jwt.secret,
      signOptions: { expiresIn: config.jwt.accessTokenTtl },
    }),
    SessionModule,
    AuthModule,
  ],
  providers: [
    // 全局身份认证守卫：验证访问令牌并加载会话
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // 全局权限校验守卫：基于 @RequirePermissions 元数据做鉴权
    { provide: APP_GUARD, useClass: PermissionsGuard },
    // 全局请求超时拦截器：限制请求整体处理时长，超时返回 408
    { provide: APP_INTERCEPTOR, useClass: TimeoutInterceptor },
  ],
})
export class AppModule {}
