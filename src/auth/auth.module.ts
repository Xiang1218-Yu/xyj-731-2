import {
  MiddlewareConsumer,
  Module,
  NestModule,
} from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './services/auth.service';
import { SessionService } from './services/session.service';
import { TokenService } from './services/token.service';
import { AuthStrategyRegistry } from './registry/auth-strategy.registry';
import { JwtStrategy } from './strategies/jwt.strategy';
import { OAuth2Strategy } from './strategies/oauth2.strategy';
import { LdapStrategy } from './strategies/ldap.strategy';
import { AuthGuard } from './guards/auth.guard';
import { PermissionGuard } from './guards/permission.guard';
import { AuthMiddleware } from './middleware/auth.middleware';

/**
 * 认证模块：聚合策略、服务、守卫与控制器。
 * JwtModule 采用默认注册，具体密钥与过期时间在 TokenService 中按需传入，
 * 便于 access / refresh 使用不同过期时间。
 */
@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    // 业务服务
    AuthService,
    SessionService,
    TokenService,
    // 策略与注册中心
    AuthStrategyRegistry,
    JwtStrategy,
    OAuth2Strategy,
    LdapStrategy,
    // 守卫（在控制器中按需 @UseGuards 使用）
    AuthGuard,
    PermissionGuard,
  ],
  exports: [AuthService, TokenService, SessionService],
})
export class AuthModule implements NestModule {
  /**
   * 注册认证中间件到所有路由。
   * 中间件做尽力而为的令牌预解析与日志，不做强制拦截。
   */
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AuthMiddleware).forRoutes('*');
  }
}
