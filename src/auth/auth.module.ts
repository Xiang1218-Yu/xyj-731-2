import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './services/auth.service';
import { TokenService } from './services/token.service';
import { JwtAuthStrategy } from './strategies/jwt-auth.strategy';
import { OAuth2AuthStrategy } from './strategies/oauth2-auth.strategy';
import { LdapAuthStrategy } from './strategies/ldap-auth.strategy';
import { AuthStrategyContext } from './strategies/auth-strategy.context';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { RedisModule } from '../redis/redis.module';

/**
 * 认证模块
 *
 * 装配策略模式的各个角色：
 *  - 具体策略：JwtAuthStrategy / OAuth2AuthStrategy / LdapAuthStrategy
 *  - 策略上下文：AuthStrategyContext（负责运行时调度与动态切换）
 *  - 领域服务：AuthService（统一登录/登出/刷新）、TokenService（JWT 签发校验）
 *  - 守卫：JwtAuthGuard（认证）、RolesGuard（框架层 RBAC 授权）
 *
 * RedisModule 为全局模块，直接提供 SessionService。
 */
@Module({
  imports: [
    PassportModule,
    // JwtModule 使用静态 secret，运行时通过 ConfigService 读取；这里注册即可
    JwtModule.register({}),
    RedisModule,
  ],
  controllers: [AuthController],
  providers: [
    // 策略模式相关
    JwtAuthStrategy,
    OAuth2AuthStrategy,
    LdapAuthStrategy,
    AuthStrategyContext,
    // 领域服务
    TokenService,
    AuthService,
    // 守卫（在控制器中通过 @UseGuards 引用）
    JwtAuthGuard,
    RolesGuard,
  ],
  exports: [AuthService, TokenService, AuthStrategyContext],
})
export class AuthModule {}
