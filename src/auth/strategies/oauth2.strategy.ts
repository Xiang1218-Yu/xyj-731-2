import { Injectable, Logger } from '@nestjs/common';
import {
  AuthCredentials,
  AuthenticatedUser,
  IAuthStrategy,
} from './auth-strategy.interface';
import configuration from '../../config/configuration';

/**
 * OAuth2.0 认证策略
 * 使用第三方颁发的 access_token 调用认证服务器的 userinfo 端点换取用户信息。
 * 未配置 OAUTH2_USERINFO_URL 时使用内置模拟令牌表（框架演示 / 测试用途）。
 */
@Injectable()
export class OAuth2StrategyImpl implements IAuthStrategy {
  readonly name = 'oauth2';
  private readonly logger = new Logger(OAuth2StrategyImpl.name);
  private readonly config = configuration();

  /**
   * 内置模拟第三方令牌表（演示用途）
   * key 为 access_token，value 为该令牌对应的用户信息
   */
  private readonly mockTokens: Record<
    string,
    { userId: string; username: string; permissions: string[] }
  > = {
    'mock-oauth-token-bob': {
      userId: 'oauth-2001',
      username: 'bob',
      permissions: ['profile:read'],
    },
  };

  /**
   * 使用第三方 access_token 完成认证
   */
  async authenticate(
    credentials: AuthCredentials,
  ): Promise<AuthenticatedUser | null> {
    const { accessToken } = credentials;
    if (!accessToken) {
      return null;
    }

    const userinfoUrl = this.config.oauth2.userinfoUrl;
    if (userinfoUrl) {
      // 真实模式：携带 Bearer Token 调用认证服务器 userinfo 端点
      try {
        const resp = await fetch(userinfoUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!resp.ok) {
          this.logger.warn(`OAuth2 userinfo 校验失败: HTTP ${resp.status}`);
          return null;
        }
        const info: any = await resp.json();
        return {
          userId: String(info.sub ?? info.id),
          username: info.preferred_username ?? info.name ?? String(info.sub),
          // 权限映射规则可按接入方约定调整
          permissions: Array.isArray(info.permissions) ? info.permissions : [],
          provider: this.name,
        };
      } catch (err) {
        this.logger.error(`OAuth2 userinfo 请求异常: ${(err as Error).message}`);
        return null;
      }
    }

    // 演示模式：查内置模拟令牌表
    const mock = this.mockTokens[accessToken];
    if (!mock) {
      this.logger.warn('OAuth2 策略认证失败: 无效的模拟 access_token');
      return null;
    }
    return { ...mock, provider: this.name };
  }
}
