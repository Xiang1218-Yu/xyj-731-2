import {
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { AuthStrategy } from './auth-strategy.interface';
import { AuthStrategyType } from '../../common/enums/auth-strategy.enum';
import {
  AuthPrincipal,
  CredentialPayload,
} from '../../common/interfaces/auth.interface';

/**
 * OAuth2.0 授权码模式认证策略
 *
 * 标准流程：
 *  1. 前端重定向到授权服务器 /authorize 获取授权码 code
 *  2. 前端把 code 提交给本服务 /auth/login（strategy=oauth2）
 *  3. 本策略用 code 向 /token 端点换取 access_token
 *  4. 用 access_token 请求 /userinfo 获取用户信息
 *  5. 映射为统一 AuthPrincipal 返回
 *
 * 由于真实 OAuth2 服务器需要外网可达，本实现通过 fetch 请求配置的端点；
 * 若端点不可达，会抛出明确的错误，便于接入真实环境时验证。
 */
@Injectable()
export class OAuth2AuthStrategy implements AuthStrategy {
  readonly type = AuthStrategyType.OAUTH2;
  private readonly logger = new Logger(OAuth2AuthStrategy.name);

  constructor(private readonly config: ConfigService) {}

  /**
   * 读取必填的 OAuth2 配置项
   *
   * 统一在运行时对环境变量做存在性校验，避免使用非空断言（!）掩盖配置缺失。
   * 配置缺失属于服务端部署/配置错误，抛出 500 并给出明确的环境变量名提示，
   * 比在后续 fetch/URL 拼装阶段产生晦涩的 undefined 错误更易于排查。
   */
  private requireConfig(key: string): string {
    const value = this.config.get<string>(key);
    if (value === undefined || value === null || value === '') {
      throw new InternalServerErrorException(
        `OAuth2 配置缺失: ${key}，请检查 .env 中的相关环境变量`,
      );
    }
    return value;
  }

  /**
   * 构造授权服务器的授权地址
   * 前端可调用 GET /auth/oauth2/authorize 拿到该地址后重定向用户。
   */
  buildAuthorizeUrl(state?: string): string {
    const authUrl = this.requireConfig('oauth2.authUrl');
    const clientId = this.requireConfig('oauth2.clientId');
    const callbackUrl = this.requireConfig('oauth2.callbackUrl');
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: callbackUrl,
      state: state || crypto.randomBytes(16).toString('hex'),
    });
    return `${authUrl}?${params.toString()}`;
  }

  async authenticate(credentials: CredentialPayload): Promise<AuthPrincipal> {
    const { code } = credentials;
    if (!code) {
      throw new UnauthorizedException('OAuth2 认证需要提供授权码 code');
    }

    // 1. 用授权码换取 access_token
    const tokenUrl = this.requireConfig('oauth2.tokenUrl');
    const clientId = this.requireConfig('oauth2.clientId');
    const clientSecret = this.requireConfig('oauth2.clientSecret');
    const callbackUrl = this.requireConfig('oauth2.callbackUrl');

    let tokenResponse: any;
    try {
      const resp = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: callbackUrl,
          client_id: clientId,
          client_secret: clientSecret,
        }).toString(),
      });
      tokenResponse = await resp.json();
    } catch (err) {
      this.logger.error(`请求 OAuth2 token 端点失败: ${(err as Error).message}`);
      throw new UnauthorizedException(
        '无法连接 OAuth2 授权服务器，请检查网络或配置',
      );
    }

    if (!tokenResponse?.access_token) {
      throw new UnauthorizedException(
        `OAuth2 授权码换取令牌失败: ${tokenResponse?.error_description || tokenResponse?.error || '未知错误'}`,
      );
    }

    // 2. 用 access_token 获取用户信息
    const userInfoUrl = this.requireConfig('oauth2.userInfoUrl');
    let userInfo: any;
    try {
      const resp = await fetch(userInfoUrl, {
        headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
      });
      userInfo = await resp.json();
    } catch (err) {
      this.logger.error(`请求 OAuth2 userinfo 端点失败: ${(err as Error).message}`);
      throw new UnauthorizedException('获取 OAuth2 用户信息失败');
    }

    // 3. 映射为统一主体
    // 不同厂商字段可能不同（sub/openid/id, preferred_username/username 等），
    // 这里做通用兼容映射，实际接入时可根据厂商调整。
    const userId =
      userInfo.sub || userInfo.id || userInfo.user_id || userInfo.openid;
    const username =
      userInfo.preferred_username ||
      userInfo.username ||
      userInfo.login ||
      userInfo.email;

    if (!userId || !username) {
      throw new UnauthorizedException('OAuth2 用户信息缺少必要字段（id/username）');
    }

    return {
      userId: String(userId),
      username: String(username),
      displayName: userInfo.name || userInfo.nickname || username,
      email: userInfo.email,
      // OAuth2 用户默认角色为 user；如需精细角色，可从 userInfo.roles 解析
      roles: Array.isArray(userInfo.roles) ? userInfo.roles : ['user'],
      strategy: this.type,
      authenticatedAt: Date.now(),
      raw: userInfo,
    };
  }
}
