import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthStrategyRegistry } from '../registry/auth-strategy.registry';
import { SessionService } from './session.service';
import { TokenService } from './token.service';
import { LoginDto } from '../dto/login.dto';
import {
  AuthenticatedUser,
  TokenPair,
} from '../interfaces/auth-strategy.interface';

/**
 * 认证服务（业务编排层）。
 *
 * 负责把"策略认证 -> 创建会话 -> 签发令牌"串成统一流程，
 * 对外提供 login / logout / refresh 三个统一接口，
 * 屏蔽不同认证策略（JWT / OAuth2 / LDAP）的差异。
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly registry: AuthStrategyRegistry,
    private readonly sessionService: SessionService,
    private readonly tokenService: TokenService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * 统一登录。
   * 1. 依据 strategy（或默认策略）选择认证策略并认证；
   * 2. 生成刷新令牌 ID 并创建 Redis 会话；
   * 3. 签发 access / refresh 令牌对。
   */
  async login(
    dto: LoginDto,
  ): Promise<{ user: AuthenticatedUser; tokens: TokenPair }> {
    // 运行时动态切换：优先用请求指定策略，否则用默认策略
    const strategyType = dto.strategy || this.configService.get('defaultAuthStrategy');
    const strategy = this.registry.getStrategy(strategyType);

    // 委托具体策略完成认证
    const user = await strategy.authenticate({
      username: dto.username,
      password: dto.password,
      code: dto.code,
    });

    // 生成刷新令牌 ID，并据此创建会话
    const refreshTokenId = this.tokenService.generateRefreshTokenId();
    const session = await this.sessionService.createSession(
      user,
      refreshTokenId,
    );

    // 签发令牌对
    const tokens = await this.tokenService.issueTokenPair(
      user,
      session.sessionId,
      refreshTokenId,
    );

    this.logger.log(
      `用户登录成功：username=${user.username}, provider=${user.provider}, sid=${session.sessionId}`,
    );
    return { user, tokens };
  }

  /**
   * 统一登出。
   * 依据 access token 中的 sid 销毁会话，使该会话下的令牌全部失效。
   * @param sessionId 由守卫从 access token 中解析注入
   */
  async logout(sessionId: string): Promise<void> {
    await this.sessionService.destroySession(sessionId);
    this.logger.log(`用户登出，会话已销毁：sid=${sessionId}`);
  }

  /**
   * 刷新令牌（含刷新令牌轮换）。
   * 1. 校验 refresh token 合法性；
   * 2. 校验会话存在且 jti 与会话中记录一致（防止旧刷新令牌重放）；
   * 3. 轮换刷新令牌 ID 并重新签发令牌对。
   */
  async refresh(refreshToken: string): Promise<{ tokens: TokenPair }> {
    const payload = await this.tokenService.verifyRefreshToken(refreshToken);

    const session = await this.sessionService.getSession(payload.sid);
    if (!session) {
      throw new UnauthorizedException('会话不存在或已过期，请重新登录');
    }
    // jti 校验：确保使用的是会话当前最新的刷新令牌
    if (session.refreshTokenId !== payload.jti) {
      throw new UnauthorizedException('刷新令牌已失效（可能已被使用或吊销）');
    }

    // 轮换刷新令牌 ID
    const newRefreshTokenId = this.tokenService.generateRefreshTokenId();
    await this.sessionService.rotateRefreshToken(
      session.sessionId,
      newRefreshTokenId,
    );

    const tokens = await this.tokenService.issueTokenPair(
      session.user,
      session.sessionId,
      newRefreshTokenId,
    );
    this.logger.log(`令牌刷新成功：sid=${session.sessionId}`);
    return { tokens };
  }

  /** 列出当前可用的认证策略（供前端 / 文档展示） */
  getAvailableStrategies(): string[] {
    return this.registry.getAvailableStrategies();
  }
}
