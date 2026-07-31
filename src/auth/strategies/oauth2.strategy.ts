import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AuthCredentials,
  AuthenticatedUser,
  AuthStrategyType,
  IAuthStrategy,
} from '../interfaces/auth-strategy.interface';

/**
 * OAuth2.0 认证策略（授权码模式 Authorization Code Flow）。
 *
 * 流程：
 * 1. 前端引导用户跳转到授权服务器（getAuthorizationUrl 生成的地址）。
 * 2. 用户授权后，授权服务器带 code 回调到本服务。
 * 3. 本策略用 code 向授权服务器换取 access_token，再拉取用户信息。
 *
 * 为保证在无外部 OAuth 服务器时也能演示，当未配置 tokenUrl 时会走模拟分支。
 */
@Injectable()
export class OAuth2Strategy implements IAuthStrategy {
  readonly type = AuthStrategyType.OAUTH2;
  private readonly logger = new Logger(OAuth2Strategy.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * 生成授权服务器的登录跳转 URL，供前端重定向使用。
   * @param state 防 CSRF 的随机串
   */
  getAuthorizationUrl(state: string): string {
    const cfg = this.configService.get('oauth2');
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: cfg.clientId,
      redirect_uri: cfg.redirectUri,
      scope: cfg.scope,
      state,
    });
    return `${cfg.authorizationUrl}?${params.toString()}`;
  }

  /**
   * 使用授权码换取用户信息。
   * @param credentials 需包含 code（授权码）
   */
  async authenticate(
    credentials: AuthCredentials,
  ): Promise<AuthenticatedUser> {
    const { code } = credentials;
    if (!code) {
      throw new UnauthorizedException('缺少 OAuth2 授权码 code');
    }

    const cfg = this.configService.get('oauth2');

    // 判断是否配置了真实授权服务器
    const hasRealServer =
      cfg.tokenUrl &&
      !cfg.tokenUrl.includes('example.com') &&
      cfg.userInfoUrl &&
      cfg.clientId &&
      cfg.clientSecret;

    if (!hasRealServer) {
      // 安全改造（问题 2）：未配置真实服务器时，绝不放行未经校验的授权码。
      // 仅当显式开启演示模式（OAUTH2_ALLOW_MOCK=true）时才返回模拟用户，
      // 否则直接拒绝，避免任意 code 换取有效身份。
      if (cfg.allowMock) {
        this.logger.warn(
          'OAuth2 演示模式已开启（OAUTH2_ALLOW_MOCK=true），返回模拟用户。切勿在生产启用！',
        );
        return this.buildMockUser(code);
      }
      this.logger.error('OAuth2 未配置真实授权服务器，拒绝认证');
      throw new UnauthorizedException(
        'OAuth2 认证不可用：服务端未正确配置授权服务器',
      );
    }

    try {
      // 第一步：用授权码换取 access_token
      const tokenResp = await fetch(cfg.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          client_id: cfg.clientId,
          client_secret: cfg.clientSecret,
          redirect_uri: cfg.redirectUri,
        }),
      });
      if (!tokenResp.ok) {
        throw new Error(`换取令牌失败：HTTP ${tokenResp.status}`);
      }
      const tokenData = (await tokenResp.json()) as {
        access_token: string;
      };

      // 第二步：使用 access_token 拉取用户信息
      const userResp = await fetch(cfg.userInfoUrl, {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      if (!userResp.ok) {
        throw new Error(`获取用户信息失败：HTTP ${userResp.status}`);
      }
      const profile = (await userResp.json()) as Record<string, unknown>;

      // 归一化第三方用户信息
      return {
        userId: String(profile.sub ?? profile.id ?? profile.user_id),
        username: String(profile.preferred_username ?? profile.name ?? ''),
        email: profile.email as string,
        roles: (profile.roles as string[]) ?? ['user'],
        permissions: (profile.permissions as string[]) ?? [],
        provider: AuthStrategyType.OAUTH2,
        raw: profile,
      };
    } catch (err) {
      this.logger.error(`OAuth2 认证失败：${err.message}`);
      throw new UnauthorizedException(`OAuth2 认证失败：${err.message}`);
    }
  }

  /** 构造演示模式下的模拟用户 */
  private buildMockUser(code: string): AuthenticatedUser {
    return {
      userId: 'oauth-1001',
      username: `oauth_user_${code.slice(0, 6)}`,
      email: 'oauth.user@example.com',
      roles: ['user'],
      permissions: ['user:read'],
      provider: AuthStrategyType.OAUTH2,
      raw: { code, mock: true },
    };
  }
}
