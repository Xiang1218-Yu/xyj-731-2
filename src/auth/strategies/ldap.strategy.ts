/**
 * LDAP 认证策略
 *
 * 标准 LDAP 认证流程:
 *  1. 使用管理员账号（bindDn / bindCredentials）连接 LDAP 服务器;
 *  2. 根据用户名搜索用户条目，获取其 DN;
 *  3. 使用找到的用户 DN + 用户输入的密码重新绑定（bind），密码正确则认证通过;
 *  4. 将 LDAP 条目映射为统一的 AuthenticatedUser。
 *
 * 当 LDAP 服务器不可达，且 ALLOW_LOCAL_FALLBACK=true 时，
 * 回退到本地用户库校验，便于本地开发与自动化测试。
 */
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as ldap from 'ldapjs';
import { AuthType } from '../../common/enums/auth-type.enum';
import {
  AuthCredentials,
  AuthResult,
  AuthenticatedUser,
} from '../../common/interfaces/authenticated-user.interface';
import {
  getRequiredBoolean,
  getRequiredString,
} from '../../common/utils/config.util';
import { UsersService } from '../../users/users.service';
import { AuthStrategy } from './auth-strategy.interface';

@Injectable()
export class LdapStrategy implements AuthStrategy {
  readonly type = AuthType.LDAP;
  private readonly logger = new Logger(LdapStrategy.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
  ) {}

  /**
   * 执行 LDAP 认证
   */
  async authenticate(credentials: AuthCredentials): Promise<AuthResult> {
    const { username, password } = credentials;

    if (!username || !password) {
      throw new UnauthorizedException('用户名和密码不能为空');
    }

    try {
      const user = await this.ldapBindAndSearch(username, password);
      this.logger.log(`LDAP 认证成功: ${username}`);
      return { user };
    } catch (err) {
      // LDAP 服务器不可达等连接类错误时，若允许则回退本地校验
      if (this.shouldFallback(err)) {
        this.logger.warn(
          `LDAP 服务不可用，回退本地校验: ${(err as Error).message}`,
        );
        return this.localFallback(username, password);
      }
      if (err instanceof UnauthorizedException) {
        throw err;
      }
      throw new UnauthorizedException('LDAP 认证失败');
    }
  }

  /**
   * 连接 LDAP、搜索用户、再以用户身份绑定校验密码
   */
  private ldapBindAndSearch(
    username: string,
    password: string,
  ): Promise<AuthenticatedUser> {
    // 显式读取并校验必填配置项，不使用非空断言
    const url = getRequiredString(this.configService, 'ldap.url');
    const bindDn = getRequiredString(this.configService, 'ldap.bindDn');
    const bindCredentials = getRequiredString(
      this.configService,
      'ldap.bindCredentials',
    );
    const searchBase = getRequiredString(
      this.configService,
      'ldap.searchBase',
    );
    const filterTpl = getRequiredString(
      this.configService,
      'ldap.searchFilter',
    );
    const filter = filterTpl.replace('{{username}}', this.escapeLdap(username));

    return new Promise((resolve, reject) => {
      // 创建 LDAP 客户端
      const client = ldap.createClient({
        url,
        timeout: 5000,
        connectTimeout: 5000,
      });

      // 统一清理连接
      const cleanup = () => {
        try {
          client.unbind();
        } catch {
          /* ignore */
        }
      };

      client.on('error', (err) => {
        cleanup();
        reject(err);
      });

      // 1. 管理员绑定
      client.bind(bindDn, bindCredentials, (bindErr) => {
        if (bindErr) {
          cleanup();
          return reject(bindErr);
        }

        // 2. 搜索用户条目
        const entries: ldap.SearchEntry[] = [];
        client.search(
          searchBase,
          { filter, scope: 'sub' },
          (searchErr, searchRes) => {
            if (searchErr) {
              cleanup();
              return reject(searchErr);
            }

            searchRes.on('searchEntry', (entry: ldap.SearchEntry) => {
              entries.push(entry);
            });

            searchRes.on('error', (e) => {
              cleanup();
              reject(e);
            });

            searchRes.on('end', () => {
              if (entries.length === 0) {
                cleanup();
                return reject(
                  new UnauthorizedException('LDAP 用户不存在'),
                );
              }
              // ldapjs v3 中 SearchEntry.objectName 即条目的 DN
              const userDn = entries[0].objectName;
              if (!userDn) {
                cleanup();
                return reject(
                  new UnauthorizedException('无法解析 LDAP 用户 DN'),
                );
              }

              // 3. 以用户 DN + 用户密码重新绑定，校验密码
              client.bind(userDn, password, (userBindErr) => {
                cleanup();
                if (userBindErr) {
                  return reject(
                    new UnauthorizedException('LDAP 用户名或密码错误'),
                  );
                }
                resolve(this.mapEntry(entries[0]));
              });
            });
          },
        );
      });
    });
  }

  /**
   * 将 LDAP 条目映射为统一用户结构
   * ldapjs v3 中 SearchEntry.attributes 为 Attribute[]，每个属性含 type 与 values
   */
  private mapEntry(entry: ldap.SearchEntry): AuthenticatedUser {
    // 将属性数组转换为 { 属性名: 值 } 的普通对象便于读取
    const attrs: Record<string, string> = {};
    for (const attr of entry.attributes) {
      const values = attr.values;
      // values 可能是字符串或字符串数组，统一取第一个
      attrs[attr.type] = Array.isArray(values) ? values[0] : values;
    }
    const get = (k: string) => attrs[k];
    const uid = get('uid') || get('sAMAccountName') || get('cn');
    return {
      id: get('entryUUID') || String(uid),
      username: String(uid),
      displayName: get('displayName') || get('cn') || String(uid),
      email: get('mail'),
      // LDAP 组通常需要额外查询，这里默认赋予 user 角色
      roles: ['user'],
      authType: this.type,
      authenticatedAt: Date.now(),
    };
  }

  /**
   * 转义 LDAP 过滤特殊字符，防止 LDAP 注入
   */
  private escapeLdap(value: string): string {
    return value
      .replace(/\\/g, '\\5c')
      .replace(/\*/g, '\\2a')
      .replace(/\(/g, '\\28')
      .replace(/\)/g, '\\29')
      .replace(/\0/g, '\\00');
  }

  /**
   * 判断是否可以本地回退。
   *
   * 与 OAuth2 策略一致: 仅连接/网络层故障才回退，认证失败类错误不回退。
   * 通过错误码(.code)或消息中明确的系统错误码判定，避免宽泛的子串匹配
   * （如 'connect'/'timeout'）误伤业务错误。
   */
  private static readonly NETWORK_ERROR_CODES = new Set<string>([
    'ECONNREFUSED',
    'ENOTFOUND',
    'ETIMEDOUT',
    'ECONNRESET',
    'EHOSTUNREACH',
    'ENETUNREACH',
    'EAI_AGAIN',
  ]);

  private shouldFallback(err: unknown): boolean {
    if (!getRequiredBoolean(this.configService, 'allowLocalFallback')) {
      return false;
    }
    // 业务层显式抛出的认证失败绝不回退
    if (err instanceof UnauthorizedException) {
      return false;
    }

    // 1. 优先检查错误对象及其 cause 链上的系统错误码
    let current: unknown = err;
    for (let depth = 0; depth < 5 && current; depth++) {
      const code = (current as { code?: string }).code;
      if (
        typeof code === 'string' &&
        LdapStrategy.NETWORK_ERROR_CODES.has(code)
      ) {
        return true;
      }
      current = (current as { cause?: unknown }).cause;
    }

    // 2. ldapjs 可能把系统错误码放入 message，按明确错误码匹配（不含宽泛的 connect/timeout）
    const message = (err as Error)?.message || '';
    for (const code of LdapStrategy.NETWORK_ERROR_CODES) {
      if (message.includes(code)) {
        return true;
      }
    }
    return false;
  }

  /**
   * 本地回退认证
   */
  private async localFallback(
    username: string,
    password: string,
  ): Promise<AuthResult> {
    const user = await this.usersService.findByUsername(username);
    if (!user) {
      throw new UnauthorizedException('用户名或密码错误');
    }
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
