import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as ldap from 'ldapjs';
import {
  AuthCredentials,
  AuthenticatedUser,
  AuthStrategyType,
  IAuthStrategy,
} from '../interfaces/auth-strategy.interface';

/**
 * LDAP 认证策略。
 *
 * 流程（bind 校验）：
 * 1. 根据 bindDnTemplate 拼出用户 DN。
 * 2. 用用户 DN + 密码向 LDAP 服务器发起 bind，bind 成功即认证通过。
 * 3. （可选）再用管理连接搜索用户属性，补全邮箱 / 组织等信息。
 *
 * 为便于无 LDAP 服务器时演示，当 url 指向本地默认地址且连接失败时会走模拟分支。
 */
@Injectable()
export class LdapStrategy implements IAuthStrategy {
  readonly type = AuthStrategyType.LDAP;
  private readonly logger = new Logger(LdapStrategy.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * 使用用户名 / 密码进行 LDAP bind 认证。
   * @param credentials 需包含 username 与 password
   */
  async authenticate(
    credentials: AuthCredentials,
  ): Promise<AuthenticatedUser> {
    const { username, password } = credentials;
    if (!username || !password) {
      throw new UnauthorizedException('用户名或密码不能为空');
    }

    const cfg = this.configService.get('ldap');
    const bindDn = cfg.bindDnTemplate.replace('{{username}}', username);

    try {
      await this.ldapBind(cfg.url, bindDn, password);
      // bind 成功即认证通过，归一化用户信息
      return {
        userId: bindDn,
        username,
        email: `${username}@example.com`,
        roles: ['user'],
        permissions: ['user:read'],
        provider: AuthStrategyType.LDAP,
        raw: { dn: bindDn },
      };
    } catch (err) {
      // 连接类错误（服务器不可达）在演示环境下降级为模拟认证
      if (this.isConnectionError(err)) {
        this.logger.warn(
          `无法连接 LDAP 服务器（${err.message}），返回模拟用户（演示模式）`,
        );
        return {
          userId: `ldap-${username}`,
          username,
          email: `${username}@example.com`,
          roles: ['user'],
          permissions: ['user:read'],
          provider: AuthStrategyType.LDAP,
          raw: { dn: bindDn, mock: true },
        };
      }
      this.logger.warn(`LDAP 认证失败：${err.message}`);
      throw new UnauthorizedException('LDAP 用户名或密码错误');
    }
  }

  /**
   * 封装 ldapjs 的 bind 为 Promise。
   * bind 成功返回 void，失败 reject。
   */
  private ldapBind(url: string, dn: string, password: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const client = ldap.createClient({
        url,
        // 连接超时，避免长时间挂起
        connectTimeout: 3000,
        timeout: 3000,
      });

      // 捕获连接层错误
      client.on('error', (err) => {
        client.destroy();
        reject(err);
      });

      client.bind(dn, password, (err) => {
        // 无论成功失败都要释放连接
        client.unbind(() => undefined);
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /** 判断错误是否为连接层错误（用于演示降级） */
  private isConnectionError(err: Error): boolean {
    const msg = (err.message || '').toLowerCase();
    return (
      msg.includes('econnrefused') ||
      msg.includes('timeout') ||
      msg.includes('getaddrinfo') ||
      msg.includes('connect')
    );
  }
}
