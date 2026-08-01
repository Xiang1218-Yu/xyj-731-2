import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { IAuthStrategy } from './strategies/auth-strategy.interface';
import { JwtStrategyImpl } from './strategies/jwt.strategy';
import { OAuth2StrategyImpl } from './strategies/oauth2.strategy';
import { LdapStrategyImpl } from './strategies/ldap.strategy';
import configuration from '../config/configuration';

/**
 * 策略管理器（策略模式的上下文 / Context）
 * - 启动时注册全部认证策略
 * - 维护当前生效的策略
 * - 支持运行时动态切换认证方式
 */
@Injectable()
export class StrategyManager {
  private readonly logger = new Logger(StrategyManager.name);
  /** 策略注册表：策略名 -> 策略实例 */
  private readonly strategies = new Map<string, IAuthStrategy>();
  /** 当前生效的策略名 */
  private activeStrategy: string;

  constructor(
    jwtStrategy: JwtStrategyImpl,
    oauth2Strategy: OAuth2StrategyImpl,
    ldapStrategy: LdapStrategyImpl,
  ) {
    // 注册所有内置策略
    this.register(jwtStrategy);
    this.register(oauth2Strategy);
    this.register(ldapStrategy);

    // 以配置项决定初始策略
    this.activeStrategy = configuration().defaultStrategy;
    if (!this.strategies.has(this.activeStrategy)) {
      this.logger.warn(
        `配置的默认策略 ${this.activeStrategy} 不存在，回退为 jwt`,
      );
      this.activeStrategy = 'jwt';
    }
    this.logger.log(`当前认证策略: ${this.activeStrategy}`);
  }

  /** 注册策略（可用于扩展自定义策略） */
  register(strategy: IAuthStrategy): void {
    this.strategies.set(strategy.name, strategy);
  }

  /** 获取当前生效的策略实例 */
  getActive(): IAuthStrategy {
    return this.strategies.get(this.activeStrategy);
  }

  /** 按名称获取策略实例，不存在返回 undefined */
  getByName(name: string): IAuthStrategy | undefined {
    return this.strategies.get(name);
  }

  /** 获取当前生效的策略名 */
  getActiveName(): string {
    return this.activeStrategy;
  }

  /** 获取所有已注册的策略名 */
  listStrategies(): string[] {
    return [...this.strategies.keys()];
  }

  /**
   * 运行时动态切换认证策略
   * @param name 目标策略名
   * @throws BadRequestException 策略不存在时抛出
   */
  switchTo(name: string): void {
    if (!this.strategies.has(name)) {
      throw new BadRequestException(
        `不支持的认证策略: ${name}，可选值: ${this.listStrategies().join(', ')}`,
      );
    }
    this.activeStrategy = name;
    this.logger.log(`认证策略已切换为: ${name}`);
  }
}
