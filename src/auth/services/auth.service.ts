import {
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthStrategyContext } from '../strategies/auth-strategy.context';
import { TokenService } from './token.service';
import { SessionService } from '../../redis/session.service';
import { OAuth2AuthStrategy } from '../strategies/oauth2-auth.strategy';
import {
  AuthResult,
  CredentialPayload,
} from '../../common/interfaces/auth.interface';
import { AuthStrategyType } from '../../common/enums/auth-strategy.enum';

/**
 * 统一认证服务
 *
 * 作为认证领域的门面（Facade），对外提供统一的登录、登出、刷新令牌能力，
 * 内部编排：策略上下文（认证）→ 令牌服务（签发 JWT）→ 会话服务（Redis 持久化）。
 *
 * 调用方无需了解底层使用的是 JWT、OAuth2 还是 LDAP，真正实现"统一身份认证"。
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly strategyContext: AuthStrategyContext,
    private readonly tokenService: TokenService,
    private readonly sessionService: SessionService,
    private readonly config: ConfigService,
  ) {}

  /**
   * 统一登录
   *
   * 流程：
   *  1. 通过策略上下文执行认证（内部根据策略类型动态分发）
   *  2. 创建 Redis 会话（先占位，拿到 sessionId）
   *  3. 用 sessionId 签发 access/refresh token
   *  4. 把 refresh token 哈希回填到会话，供刷新/登出时校验
   */
  async login(credentials: CredentialPayload): Promise<AuthResult> {
    // 执行具体策略认证
    const principal = await this.strategyContext.execute(credentials);

    const refreshTtl = this.config.get<number>('jwt.refreshExpiresIn')!;

    // 先创建会话拿到 sessionId（token.sub 即 sessionId）
    const session = await this.sessionService.createSession(
      {
        userId: principal.userId,
        username: principal.username,
        roles: principal.roles,
        strategy: principal.strategy,
        refreshTokenHash: '',
        metadata: {
          displayName: principal.displayName,
          email: principal.email,
        },
      },
      refreshTtl,
    );

    // 签发令牌对（access/refresh）
    const tokens = await this.tokenService.issueTokens(
      principal,
      session.sessionId,
    );

    // 将 refresh token 的摘要回填到会话，避免明文落库
    const refreshTokenHash = this.tokenService.hashRefreshToken(
      tokens.refreshToken,
    );
    await this.sessionService.updateSession(session.sessionId, {
      refreshTokenHash,
    });

    return { principal, tokens };
  }

  /**
   * 登出
   *
   * 根据 access token 中的 sessionId 删除 Redis 会话，实现服务端令牌失效。
   */
  async logout(sessionId: string): Promise<boolean> {
    return this.sessionService.destroySession(sessionId);
  }

  /**
   * 刷新令牌
   *
   * 流程：
   *  1. 验证 refresh token 签名与类型
   *  2. 根据 sub(sessionId) 从 Redis 读取会话
   *  3. 比对 refresh token 哈希（防止已登出的 token 被重用）
   *  4. 删除旧会话，签发新令牌对（refresh token rotation）
   *
   * @param refreshToken 客户端持有的 refresh token
   */
  async refresh(refreshToken: string): Promise<AuthResult> {
    let payload;
    try {
      payload = await this.tokenService.verifyToken(refreshToken);
    } catch {
      throw new UnauthorizedException('refresh token 无效或已过期');
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('请使用 refresh token 刷新');
    }

    // 从 Redis 查询会话是否仍然有效
    const session = await this.sessionService.getSession(payload.sub);
    if (!session) {
      throw new UnauthorizedException('会话已失效，请重新登录');
    }

    // 校验 refresh token 摘要
    const valid = this.tokenService.compareRefreshToken(
      refreshToken,
      session.refreshTokenHash,
    );
    if (!valid) {
      // refresh token 可能被盗用，销毁会话强制重新登录
      await this.sessionService.destroySession(session.sessionId);
      throw new UnauthorizedException('refresh token 不匹配，会话已失效');
    }

    // 删除旧会话（refresh token rotation，防止旧 token 被重用）
    await this.sessionService.destroySession(session.sessionId);

    const refreshTtl = this.config.get<number>('jwt.refreshExpiresIn')!;

    // 创建新会话，签发新令牌对
    const newSession = await this.sessionService.createSession(
      {
        userId: session.userId,
        username: session.username,
        roles: session.roles,
        strategy: session.strategy,
        refreshTokenHash: '',
        metadata: session.metadata,
      },
      refreshTtl,
    );

    const tokens = await this.tokenService.issueTokens(
      {
        userId: session.userId,
        username: session.username,
        roles: session.roles,
        strategy: session.strategy,
        authenticatedAt: Date.now(),
      } as any,
      newSession.sessionId,
    );

    // 回填新 refresh token 摘要
    const newHash = this.tokenService.hashRefreshToken(tokens.refreshToken);
    await this.sessionService.updateSession(newSession.sessionId, {
      refreshTokenHash: newHash,
    });

    return {
      principal: {
        userId: session.userId,
        username: session.username,
        roles: session.roles,
        strategy: session.strategy,
        authenticatedAt: Date.now(),
      },
      tokens,
    };
  }

  /**
   * 验证 access token 并返回会话信息（供 Guard 使用）
   *
   * 同时检查 Redis 会话是否存在，实现服务端可吊销。
   */
  async validateAccessToken(accessToken: string) {
    let payload;
    try {
      payload = await this.tokenService.verifyToken(accessToken);
    } catch {
      throw new UnauthorizedException('access token 无效或已过期');
    }

    if (payload.type !== 'access') {
      throw new UnauthorizedException('令牌类型错误');
    }

    const session = await this.sessionService.getSession(payload.sub);
    if (!session) {
      throw new UnauthorizedException('会话已失效，请重新登录');
    }

    return { payload, session };
  }

  /** 获取 OAuth2 授权地址（供前端跳转） */
  getOAuth2AuthorizeUrl(state?: string): string {
    return this.strategyContext
      .getStrategy<OAuth2AuthStrategy>(AuthStrategyType.OAUTH2)
      .buildAuthorizeUrl(state);
  }

  /** 查询当前策略与可用策略列表 */
  getStrategyInfo() {
    return this.strategyContext.listStrategies();
  }

  /** 运行时动态切换全局默认认证策略 */
  setStrategy(type: AuthStrategyType) {
    this.strategyContext.setStrategy(type);
    this.logger.warn(`默认认证策略已切换为: ${type}`);
    return this.strategyContext.listStrategies();
  }
}
