/**
 * 认证模块
 *
 * 组装所有认证相关组件:
 *  - 三种认证策略 (JWT/OAuth2/LDAP) 及其工厂;
 *  - Passport JWT 策略与认证守卫;
 *  - 认证服务与控制器;
 *  - 角色权限守卫;
 *  - 受保护资源示例控制器。
 *
 * 同时注册全局 JWT 配置（JwtModule），供签发/校验令牌使用。
 */
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { SessionModule } from '../session/session.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { ResourceController } from './resource.controller';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { AuthStrategyFactory } from './strategies/auth-strategy.factory';
import { JwtPassportStrategy } from './strategies/jwt-passport.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';
import { LdapStrategy } from './strategies/ldap.strategy';
import { OAuth2Strategy } from './strategies/oauth2.strategy';

@Module({
  imports: [
    UsersModule,
    SessionModule,
    PassportModule,
    // 异步配置 JwtModule，从 ConfigService 读取密钥与过期时间
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwt.secret'),
        signOptions: {
          expiresIn: config.get<string>('jwt.expiresIn'),
          issuer: config.get<string>('jwt.issuer'),
        },
      }),
    }),
  ],
  controllers: [AuthController, ResourceController],
  providers: [
    AuthService,
    // 三种认证策略
    JwtStrategy,
    OAuth2Strategy,
    LdapStrategy,
    // 策略工厂（运行时动态选择策略）
    AuthStrategyFactory,
    // Passport JWT 校验策略
    JwtPassportStrategy,
    // 守卫
    JwtAuthGuard,
    RolesGuard,
  ],
  exports: [AuthService, JwtAuthGuard, RolesGuard],
})
export class AuthModule {}
