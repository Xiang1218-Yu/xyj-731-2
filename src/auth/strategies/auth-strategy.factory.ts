/**
 * 认证策略工厂（策略模式的调度中心）
 *
 * 维护一个 AuthType -> AuthStrategy 实例的映射表。
 * AuthService 在运行时根据客户端传入的 authType 动态获取对应策略，
 * 实现"运行时动态切换认证方式"。
 *
 * 新增认证方式时，只需:
 *   1. 实现 AuthStrategy 接口;
 *   2. 在 AuthModule 的 providers 中注册;
 *   3. 注入到本工厂并在构造函数中 register。
 * 上层 AuthService 无需任何修改，符合开闭原则。
 */
import { Injectable } from '@nestjs/common';
import { AuthType } from '../../common/enums/auth-type.enum';
import { AuthStrategy } from './auth-strategy.interface';
import { JwtStrategy } from './jwt.strategy';
import { LdapStrategy } from './ldap.strategy';
import { OAuth2Strategy } from './oauth2.strategy';

@Injectable()
export class AuthStrategyFactory {
  /** 策略注册表: authType -> 策略实例 */
  private readonly strategies = new Map<AuthType, AuthStrategy>();

  constructor(
    private readonly jwtStrategy: JwtStrategy,
    private readonly oauth2Strategy: OAuth2Strategy,
    private readonly ldapStrategy: LdapStrategy,
  ) {
    // 注册所有内置策略
    this.register(this.jwtStrategy);
    this.register(this.oauth2Strategy);
    this.register(this.ldapStrategy);
  }

  /**
   * 注册一个认证策略
   */
  private register(strategy: AuthStrategy): void {
    this.strategies.set(strategy.type, strategy);
  }

  /**
   * 根据类型获取策略
   * @throws 当传入不支持的 authType 时抛出错误
   */
  getStrategy(type: AuthType | string): AuthStrategy {
    const strategy = this.strategies.get(type as AuthType);
    if (!strategy) {
      const supported = Array.from(this.strategies.keys()).join(', ');
      throw new Error(
        `不支持的认证类型: ${type}，当前支持: ${supported}`,
      );
    }
    return strategy;
  }

  /**
   * 获取所有已注册的策略类型
   */
  getSupportedTypes(): AuthType[] {
    return Array.from(this.strategies.keys());
  }
}
