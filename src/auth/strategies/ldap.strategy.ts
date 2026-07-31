import { Injectable, Logger } from '@nestjs/common';
import * as ldap from 'ldapjs';
import {
  AuthCredentials,
  AuthenticatedUser,
  IAuthStrategy,
} from './auth-strategy.interface';
import configuration from '../../config/configuration';

/**
 * LDAP 认证策略
 * 通过 LDAP bind 操作校验用户凭据。
 * 未配置 LDAP_URL 时使用内置模拟目录（框架演示 / 测试用途）。
 */
@Injectable()
export class LdapStrategyImpl implements IAuthStrategy {
  readonly name = 'ldap';
  private readonly logger = new Logger(LdapStrategyImpl.name);
  private readonly config = configuration();

  /**
   * 内置模拟目录（演示用途）：uid -> { password, userId, permissions }
   */
  private readonly mockDirectory: Record<
    string,
    { password: string; userId: string; permissions: string[] }
  > = {
    carol: {
      password: 'carol123',
      userId: 'ldap-3001',
      permissions: ['profile:read'],
    },
  };

  /**
   * 使用用户名 / 密码执行 LDAP 认证
   */
  async authenticate(
    credentials: AuthCredentials,
  ): Promise<AuthenticatedUser | null> {
    const { username, password } = credentials;
    if (!username || !password) {
      return null;
    }

    const ldapUrl = this.config.ldap.url;
    if (ldapUrl) {
      // 真实模式：以用户 DN 执行 bind 校验
      const userDn = this.config.ldap.userDnTemplate.replace(
        '{{username}}',
        username,
      );
      const ok = await this.bind(ldapUrl, userDn, password);
      if (!ok) {
        return null;
      }
      return {
        userId: `ldap-${username}`,
        username,
        // LDAP 场景权限通常来自用户组映射，此处给出框架级默认权限
        permissions: ['profile:read'],
        provider: this.name,
      };
    }

    // 演示模式：查内置模拟目录
    const entry = this.mockDirectory[username];
    if (!entry || entry.password !== password) {
      this.logger.warn(`LDAP 策略认证失败: username=${username}`);
      return null;
    }
    return {
      userId: entry.userId,
      username,
      permissions: entry.permissions,
      provider: this.name,
    };
  }

  /**
   * 执行 LDAP bind 校验
   * @returns bind 成功返回 true，否则 false
   */
  private bind(url: string, dn: string, password: string): Promise<boolean> {
    return new Promise((resolve) => {
      const client = ldap.createClient({ url, connectTimeout: 5000 });
      client.bind(dn, password, (err) => {
        // 无论成功与否都及时释放连接
        client.unbind(() => undefined);
        if (err) {
          this.logger.warn(`LDAP bind 失败: dn=${dn}, ${err.message}`);
          resolve(false);
        } else {
          resolve(true);
        }
      });
      // 连接层错误（如服务器不可达）兜底处理
      client.on('error', (err) => {
        this.logger.error(`LDAP 连接异常: ${err.message}`);
        resolve(false);
      });
    });
  }
}
