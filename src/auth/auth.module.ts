import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { StrategyManager } from './strategy-manager.service';
import { JwtStrategyImpl } from './strategies/jwt.strategy';
import { OAuth2StrategyImpl } from './strategies/oauth2.strategy';
import { LdapStrategyImpl } from './strategies/ldap.strategy';

/**
 * 认证模块
 * 组装三种认证策略、策略管理器与认证服务
 */
@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    StrategyManager,
    // 三种认证策略实现（策略模式的具体策略）
    JwtStrategyImpl,
    OAuth2StrategyImpl,
    LdapStrategyImpl,
  ],
})
export class AuthModule {}
