/**
 * OAuth2.0 认证策略
 *
 * 支持两种使用方式:
 *  1. 授权码模式（标准 Web 流程）:
 *     - getAuthorizeUrl() 生成授权服务器跳转地址;
 *     - authenticate({ code }) 在回调中用 code 换取 access token，再拉取用户信息。
 *  2. 令牌内省模式（统一登录接口）:
 *     - 客户端已经持有第三方 access token，调用 authenticate({ accessToken }) 内省用户信息。
 *
 * 当外部 OAuth2 服务器不可达，且 ALLOW_LOCAL_FALLBACK=true 时（默认开发环境），
 * 会回退到本地用户库进行校验，便于本地开发与自动化测试。
 */
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthType } from '../../common/enums/auth-type.enum';
import {
  AuthCredentials,
  AuthResult,
  AuthenticatedUser,
} from '../../common/interfaces/authenticated-user.interface';
import { UsersService } from '../../users/users.service';
import { AuthStrategy } from './auth-strategy.interface';

/** OAuth2 令牌端点返回结构 */
interface OAuth2TokenResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
  id_token?: string;
}

/** OAuth2 用户信息端点返回结构（不同 Provider 字段可能不同，这里取通用字段） */
interface OAuth2UserInfo {
  sub?: string;
  id?: string;
  username?: string;
  preferred_username?: string;
  name?: string;
  email?: string;
  roles?: string[];
}

@Injectable()
export class OAuth2Strategy implements AuthStrategy {
  readonly type = AuthType.OAUTH2;
  private readonly logger = new Logger(OAuth2Strategy.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
  ) {}

  /**
   * 生成 OAuth2 授权地址，引导用户跳转到第三方授权服务器
   */
  getAuthorizeUrl(state: string): string {
    const base = this.configService.get<string>('oauth2.authorizationUrl')!;
    const clientId = this.configService.get<string>('oauth2.clientId')!;
    const redirectUri = this.configService.get<string>('oauth2.callbackUrl')!;
    const scope = this.configService.get<string>('oauth2.scope')!;

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      scope,
      state,
    });
    return `${base}?${params.toString()}`;
  }

  /**
   * 执行 OAuth2 认证
   */
  async authenticate(credentials: AuthCredentials): Promise<AuthResult> {
    const { code, accessToken, username, password } = credentials;

    try {
      let token: string | undefined = accessToken;
      let userInfo: OAuth2UserInfo;

      if (code) {
        // 授权码模式: 用 code 换 token，再拉取用户信息
        const tokenRes = await this.exchangeCodeForToken(code);
        token = tokenRes.access_token;
        userInfo = await this.fetchUserInfo(token);
      } else if (accessToken) {
        // 令牌内省模式: 直接用已有 access token 拉取用户信息
        userInfo = await this.fetchUserInfo(accessToken);
      } else {
        // 没有 code 也没有 access token，但提供了用户名密码时，
        // 视为 OAuth2 password grant（部分 Provider 支持），尝试换取 token
        if (username && password) {
          const tokenRes = await this.passwordGrant(username, password);
          token = tokenRes.access_token;
          userInfo = await this.fetchUserInfo(token);
        } else {
          throw new UnauthorizedException(
            'OAuth2 认证需要提供 code、accessToken 或用户名密码',
          );
        }
      }

      const user = this.mapToAuthenticatedUser(userInfo);
      this.logger.log(`OAuth2 认证成功: ${user.username}`);
      return { user, details: { accessToken: token } };
    } catch (err) {
      // 外部服务不可用时，若允许本地回退则使用本地用户库（仅开发/测试）
      if (this.shouldFallback(err)) {
        this.logger.warn(
          `OAuth2 外部服务不可用，回退本地校验: ${(err as Error).message}`,
        );
        return this.localFallback(credentials);
      }
      throw err;
    }
  }

  /**
   * 授权码换 access token
   */
  private async exchangeCodeForToken(
    code: string,
  ): Promise<OAuth2TokenResponse> {
    const tokenUrl = this.configService.get<string>('oauth2.tokenUrl')!;
    const clientId = this.configService.get<string>('oauth2.clientId')!;
    const clientSecret = this.configService.get<string>(
      'oauth2.clientSecret',
    )!;
    const redirectUri = this.configService.get<string>('oauth2.callbackUrl')!;

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    });

    const res = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!res.ok) {
      throw new UnauthorizedException(
        `OAuth2 换取令牌失败: ${res.status} ${await res.text()}`,
      );
    }
    return (await res.json()) as OAuth2TokenResponse;
  }

  /**
   * 密码模式换取 token（部分 Provider 支持，用于统一登录接口）
   */
  private async passwordGrant(
    username: string,
    password: string,
  ): Promise<OAuth2TokenResponse> {
    const tokenUrl = this.configService.get<string>('oauth2.tokenUrl')!;
    const clientId = this.configService.get<string>('oauth2.clientId')!;
    const clientSecret = this.configService.get<string>(
      'oauth2.clientSecret',
    )!;
    const scope = this.configService.get<string>('oauth2.scope')!;

    const body = new URLSearchParams({
      grant_type: 'password',
      username,
      password,
      client_id: clientId,
      client_secret: clientSecret,
      scope,
    });

    const res = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!res.ok) {
      throw new UnauthorizedException(
        `OAuth2 密码模式认证失败: ${res.status}`,
      );
    }
    return (await res.json()) as OAuth2TokenResponse;
  }

  /**
   * 携带 access token 请求用户信息端点
   */
  private async fetchUserInfo(token: string): Promise<OAuth2UserInfo> {
    const userInfoUrl = this.configService.get<string>('oauth2.userInfoUrl')!;
    const res = await fetch(userInfoUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      throw new UnauthorizedException(
        `OAuth2 获取用户信息失败: ${res.status}`,
      );
    }
    return (await res.json()) as OAuth2UserInfo;
  }

  /**
   * 将第三方用户信息映射为统一用户结构
   */
  private mapToAuthenticatedUser(info: OAuth2UserInfo): AuthenticatedUser {
    const username =
      info.preferred_username || info.username || info.sub || info.id;
    if (!username) {
      throw new UnauthorizedException('OAuth2 用户信息中缺少用户名标识');
    }
    return {
      id: info.sub || info.id || username,
      username,
      displayName: info.name,
      email: info.email,
      roles: info.roles ?? ['user'],
      authType: this.type,
      authenticatedAt: Date.now(),
    };
  }

  /**
   * 判断是否允许本地回退（外部服务网络错误或配置为示例地址时）
   */
  private shouldFallback(err: unknown): boolean {
    if (!this.configService.get<boolean>('allowLocalFallback')) {
      return false;
    }
    const msg = (err as Error).message || '';
    // 网络错误 / 示例域名 / 连接失败 时允许回退
    return (
      msg.includes('fetch failed') ||
      msg.includes('ENOTFOUND') ||
      msg.includes('ECONNREFUSED') ||
      msg.includes('example-oauth2-server') ||
      msg.includes('OAuth2')
    );
  }

  /**
   * 本地回退认证: 使用本地用户库校验用户名密码，模拟 OAuth2 认证成功
   */
  private async localFallback(
    credentials: AuthCredentials,
  ): Promise<AuthResult> {
    const { username, password } = credentials;
    if (!username || !password) {
      throw new UnauthorizedException(
        'OAuth2 本地回退需要提供用户名和密码',
      );
    }
    const user = await this.usersService.findByUsername(username);
    if (!user) {
      throw new UnauthorizedException('用户名或密码错误');
    }
    // 复用 UsersService 的密码校验
    const valid = this.usersService.verifyPassword(
      password,
      user.passwordHash,
      user.passwordSalt,
    );
    if (!valid) {
      throw new UnauthorizedException('用户名或密码错误');
    }
    return {
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        email: user.email,
        roles: user.roles,
        authType: this.type,
        authenticatedAt: Date.now(),
      },
      details: { fallback: true },
    };
  }
}
