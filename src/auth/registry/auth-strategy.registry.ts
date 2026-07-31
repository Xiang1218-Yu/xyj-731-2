import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  AuthStrategyType,
  IAuthStrategy,
} from '../interfaces/auth-strategy.interface';
import { JwtStrategy } from '../strategies/jwt.strategy';
import { OAuth2Strategy } from '../strategies/oauth2.strategy';
import { LdapStrategy } from '../strategies/ldap.strategy';

/**
 * 认证策略注册中心（策略模式的上下文 / 工厂）。
 *
 * 作用：
 * - 在启动时把所有 IAuthStrategy 实现按类型注册到一张表中。
 * - 登录时根据请求携带的 strategy 名称，在运行时动态取出对应策略，
 *   从而实现"运行时动态切换认证方式"。
 * - 新增认证方式时，只需实现 IAuthStrategy 并在此注册，符合开闭原则。
 */
@Injectable()
export class AuthStrategyRegistry {
  private readonly logger = new Logger(AuthStrategyRegistry.name);
  private readonly strategies = new Map<AuthStrategyType, IAuthStrategy>();

  constructor(
    private readonly jwtStrategy: JwtStrategy,
    private readonly oauth2Strategy: OAuth2Strategy,
    private readonly ldapStrategy: LdapStrategy,
  ) {
    // 注册所有可用策略
    this.register(jwtStrategy);
    this.register(oauth2Strategy);
    this.register(ldapStrategy);
    this.logger.log(
      `已注册认证策略：${Array.from(this.strategies.keys()).join(', ')}`,
    );
  }

  /** 注册单个策略 */
  private register(strategy: IAuthStrategy): void {
    this.strategies.set(strategy.type, strategy);
  }

  /**
   * 根据类型获取策略实例（运行时动态切换的入口）。
   * @param type 策略类型，非法值将抛出 400。
   */
  getStrategy(type: string): IAuthStrategy {
    const strategy = this.strategies.get(type as AuthStrategyType);
    if (!strategy) {
      throw new BadRequestException(
        `不支持的认证策略：${type}，可选值：${this.getAvailableStrategies().join(', ')}`,
      );
    }
    return strategy;
  }

  /** 列出当前所有可用策略类型，供文档 / 校验使用 */
  getAvailableStrategies(): AuthStrategyType[] {
    return Array.from(this.strategies.keys());
  }
}
