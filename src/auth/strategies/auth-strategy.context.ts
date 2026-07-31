import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthStrategy } from './auth-strategy.interface';
import { JwtAuthStrategy } from './jwt-auth.strategy';
import { OAuth2AuthStrategy } from './oauth2-auth.strategy';
import { LdapAuthStrategy } from './ldap-auth.strategy';
import { AuthStrategyType } from '../../common/enums/auth-strategy.enum';
import { CredentialPayload } from '../../common/interfaces/auth.interface';

/**
 * 认证策略上下文（Strategy Context）
 *
 * 策略模式的核心调度者：
 *  1. 持有所有已注册策略的映射表（Map<AuthStrategyType, AuthStrategy>）
 *  2. 维护"当前默认策略"，可在运行时动态切换（setStrategy）
 *  3. 提供 execute 方法，根据凭证中指定的策略或默认策略执行认证
 *
 * 运行时动态切换的两种方式：
 *  - 全局切换：调用 setStrategy(type) 改变系统默认策略，后续未显式指定策略的登录请求均走新策略
 *  - 单次切换：登录请求体中携带 strategy 字段，仅对当次请求生效
 */
@Injectable()
export class AuthStrategyContext implements OnModuleInit {
  /** 已注册的策略映射表 */
  private readonly strategies = new Map<AuthStrategyType, AuthStrategy>();
  /** 当前默认策略类型 */
  private currentStrategy: AuthStrategyType;

  constructor(
    private readonly config: ConfigService,
    private readonly jwtStrategy: JwtAuthStrategy,
    private readonly oauth2Strategy: OAuth2AuthStrategy,
    private readonly ldapStrategy: LdapAuthStrategy,
  ) {
    this.currentStrategy =
      (this.config.get<AuthStrategyType>('app.defaultStrategy')) ||
      AuthStrategyType.JWT;
  }

  /** 模块初始化时注册所有内置策略 */
  onModuleInit(): void {
    this.register(this.jwtStrategy);
    this.register(this.oauth2Strategy);
    this.register(this.ldapStrategy);
  }

  /** 注册一个策略（也支持外部扩展注册新策略） */
  register(strategy: AuthStrategy): void {
    this.strategies.set(strategy.type, strategy);
  }

  /** 获取当前默认策略类型 */
  getCurrentStrategy(): AuthStrategyType {
    return this.currentStrategy;
  }

  /**
   * 运行时动态切换全局默认认证策略
   * @param type 目标策略类型
   */
  setStrategy(type: AuthStrategyType): void {
    if (!this.strategies.has(type)) {
      // 切换到一个未注册的策略属于客户端请求参数错误，返回 400
      throw new BadRequestException(`不支持的认证策略: ${type}`);
    }
    this.currentStrategy = type;
  }

  /** 列出所有已注册策略及当前默认策略 */
  listStrategies(): { current: AuthStrategyType; available: AuthStrategyType[] } {
    return {
      current: this.currentStrategy,
      available: Array.from(this.strategies.keys()),
    };
  }

  /**
   * 执行认证
   *
   * 策略选择优先级：
   *  1. credentials.strategy（单次请求显式指定）
   *  2. 当前全局默认策略
   *
   * @param credentials 登录凭证
   */
  async execute(credentials: CredentialPayload) {
    const strategyType = credentials.strategy || this.currentStrategy;
    const strategy = this.strategies.get(strategyType);
    if (!strategy) {
      // 未找到对应策略通常意味着系统配置异常，返回 401 表明无法完成认证
      throw new UnauthorizedException(
        `未找到认证策略: ${strategyType}，请检查系统配置`,
      );
    }
    return strategy.authenticate(credentials);
  }

  /** 获取指定类型的策略实例（用于调用策略特有方法，如 OAuth2 的 buildAuthorizeUrl） */
  getStrategy<T extends AuthStrategy>(type: AuthStrategyType): T {
    const strategy = this.strategies.get(type);
    if (!strategy) {
      // 代码层面请求了一个未注册的策略，属于服务端资源/配置缺失，返回 404
      throw new NotFoundException(`未找到认证策略: ${type}`);
    }
    return strategy as T;
  }
}
