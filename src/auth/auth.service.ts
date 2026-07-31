import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID, randomBytes } from 'crypto';
import { StrategyManager } from './strategy-manager.service';
import { SessionService, SessionData } from '../session/session.service';
import { AuthCredentials } from './strategies/auth-strategy.interface';
import configuration from '../config/configuration';

/**
 * 认证核心服务
 * 编排：策略选择 -> 认证 -> 会话创建 -> 令牌签发 / 刷新 / 注销
 */
@Injectable()
export class AuthService {
  private readonly config = configuration();

  constructor(
    private readonly strategyManager: StrategyManager,
    private readonly sessionService: SessionService,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * 统一登录
   * @param credentials 统一认证入参
   * @param strategyName 可选：指定本次登录使用的策略，不传则使用当前全局生效策略
   */
  async login(credentials: AuthCredentials, strategyName?: string) {
    // 选择策略：优先使用请求中显式指定的策略
    const strategy = strategyName
      ? this.getStrategyOrThrow(strategyName)
      : this.strategyManager.getActive();

    // 执行认证
    const user = await strategy.authenticate(credentials);
    if (!user) {
      throw new UnauthorizedException('认证失败：凭据无效');
    }

    // 创建会话并签发令牌
    return this.issueTokens(user.userId, user.username, user.permissions, strategy.name);
  }

  /**
   * 统一登出：删除服务端会话，使访问令牌与刷新令牌同时失效
   * @param sessionId 当前会话 ID（从访问令牌中解析）
   */
  async logout(sessionId: string): Promise<void> {
    await this.sessionService.delete(sessionId);
  }

  /**
   * 统一刷新令牌
   * 校验刷新令牌 -> 轮换刷新令牌 -> 重新签发访问令牌
   * @param refreshToken 登录时签发的刷新令牌
   */
  async refresh(refreshToken: string) {
    const session = await this.findSessionByRefreshToken(refreshToken);
    if (!session) {
      throw new UnauthorizedException('刷新令牌无效或已过期');
    }
    // 令牌轮换：签发新令牌并覆盖旧会话，旧刷新令牌随即失效
    return this.issueTokens(
      session.userId,
      session.username,
      session.permissions,
      session.strategy,
      session.sessionId,
    );
  }

  /**
   * 切换运行时认证策略
   */
  switchStrategy(name: string) {
    this.strategyManager.switchTo(name);
    return {
      activeStrategy: this.strategyManager.getActiveName(),
      availableStrategies: this.strategyManager.listStrategies(),
    };
  }

  /** 查询当前策略状态 */
  getStrategyStatus() {
    return {
      activeStrategy: this.strategyManager.getActiveName(),
      availableStrategies: this.strategyManager.listStrategies(),
    };
  }

  /**
   * 签发访问令牌 + 刷新令牌，并写入会话存储
   * @param existingSessionId 刷新场景复用原会话 ID
   */
  private async issueTokens(
    userId: string,
    username: string,
    permissions: string[],
    strategy: string,
    existingSessionId?: string,
  ) {
    const sessionId = existingSessionId ?? randomUUID();
    const refreshToken = randomBytes(48).toString('hex');

    // 写入会话（Redis，过期时间取刷新令牌 TTL）
    const session: SessionData = {
      sessionId,
      userId,
      username,
      permissions,
      strategy,
      refreshToken,
      createdAt: Date.now(),
    };
    await this.sessionService.set(session, this.config.refreshTokenTtl);

    // 签发访问令牌：sid 用于关联服务端会话
    const accessToken = await this.jwtService.signAsync({
      sub: userId,
      username,
      sid: sessionId,
    });

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.config.jwt.accessTokenTtl,
      strategy,
    };
  }

  /**
   * 按刷新令牌查找会话（委托给 SessionService）
   */
  private async findSessionByRefreshToken(
    refreshToken: string,
  ): Promise<SessionData | null> {
    return this.sessionService.findByRefreshToken(refreshToken);
  }

  /** 获取指定名称的策略，不存在时抛出 401 */
  private getStrategyOrThrow(name: string) {
    const strategy = this.strategyManager.getByName(name);
    if (!strategy) {
      throw new UnauthorizedException(`不支持的认证策略: ${name}`);
    }
    return strategy;
  }
}
