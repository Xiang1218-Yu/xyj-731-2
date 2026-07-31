import {
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
// ldapjs 采用 CommonJS 导出，使用 import * 以兼容 esModuleInterop
import * as ldap from 'ldapjs';
import { AuthStrategy } from './auth-strategy.interface';
import { AuthStrategyType } from '../../common/enums/auth-strategy.enum';
import {
  AuthPrincipal,
  CredentialPayload,
} from '../../common/interfaces/auth.interface';

/**
 * LDAP 目录服务认证策略
 *
 * 认证流程：
 *  1. 使用管理员账号（bindDn/bindCredentials）连接 LDAP 服务器
 *  2. 根据 searchFilter 搜索用户，拿到用户 DN
 *  3. 使用"用户 DN + 用户输入密码"重新 bind，验证密码正确性
 *  4. 从用户条目中提取属性，映射为统一 AuthPrincipal
 *
 * 该实现基于 ldapjs 的回调 API，通过 Promise 封装为 async/await。
 */
@Injectable()
export class LdapAuthStrategy implements AuthStrategy {
  readonly type = AuthStrategyType.LDAP;
  private readonly logger = new Logger(LdapAuthStrategy.name);

  constructor(private readonly config: ConfigService) {}

  async authenticate(credentials: CredentialPayload): Promise<AuthPrincipal> {
    const { username, password } = credentials;
    if (!username || !password) {
      throw new UnauthorizedException('LDAP 认证需要提供 username 和 password');
    }

    const url = this.config.get<string>('ldap.url')!;
    const bindDn = this.config.get<string>('ldap.bindDn')!;
    const bindCredentials = this.config.get<string>('ldap.bindCredentials')!;
    const searchBase = this.config.get<string>('ldap.searchBase')!;
    const searchFilterTpl = this.config.get<string>('ldap.searchFilter')!;

    // 将模板中的 {{username}} 替换为实际用户名，并做 LDAP 特殊字符转义
    const escapedUsername = this.escapeLdap(username);
    const filter = searchFilterTpl.replace('{{username}}', escapedUsername);

    return new Promise<AuthPrincipal>((resolve, reject) => {
      // 创建 LDAP 客户端
      const client = ldap.createClient({ url });

      client.on('error', (err: Error) => {
        this.logger.error(`LDAP 连接错误: ${err.message}`);
        reject(
          new InternalServerErrorException(
            `无法连接 LDAP 服务器: ${err.message}`,
          ),
        );
      });

      // 步骤 1：管理员绑定
      client.bind(bindDn, bindCredentials, (bindErr) => {
        if (bindErr) {
          client.unbind();
          return reject(
            new InternalServerErrorException(
              `LDAP 管理员绑定失败: ${bindErr.message}`,
            ),
          );
        }

        // 步骤 2：搜索用户
        const opts: ldap.SearchOptions = {
          scope: 'sub',
          filter,
          attributes: ['dn', 'uid', 'cn', 'mail', 'sn', 'givenName', 'memberOf'],
        };

        client.search(searchBase, opts, (searchErr, res) => {
          if (searchErr) {
            client.unbind();
            return reject(
              new UnauthorizedException(`LDAP 搜索失败: ${searchErr.message}`),
            );
          }

          let userEntry: ldap.SearchEntry | null = null;

          res.on('searchEntry', (entry: ldap.SearchEntry) => {
            // 取第一个匹配条目
            if (!userEntry) userEntry = entry;
          });

          res.on('error', (err: Error) => {
            client.unbind();
            reject(new UnauthorizedException(`LDAP 搜索错误: ${err.message}`));
          });

          res.on('end', () => {
            if (!userEntry) {
              client.unbind();
              return reject(new UnauthorizedException('LDAP 用户不存在'));
            }

            // 进入回调后 userEntry 不会再被赋值，锁定为非空引用
            const matchedEntry = userEntry;
            const userDn = matchedEntry.objectName
              ? matchedEntry.objectName.toString()
              : '';
            if (!userDn) {
              client.unbind();
              return reject(
                new UnauthorizedException('LDAP 用户条目缺少 DN'),
              );
            }
            // 步骤 3：用用户 DN + 密码重新绑定验证
            client.bind(userDn, password, (userBindErr) => {
              if (userBindErr) {
                client.unbind();
                return reject(
                  new UnauthorizedException('LDAP 用户名或密码错误'),
                );
              }

              // 步骤 4：提取属性映射为 AuthPrincipal
              const attrs = this.extractAttributes(matchedEntry);
              client.unbind();
              resolve({
                userId: attrs.uid || username,
                username,
                displayName: attrs.cn || username,
                email: attrs.mail,
                // memberOf 形如 CN=group,... 这里简化取 CN 作为角色
                roles: attrs.memberOf.length ? attrs.memberOf : ['user'],
                strategy: this.type,
                authenticatedAt: Date.now(),
                raw: attrs.all,
              });
            });
          });
        });
      });
    });
  }

  /**
   * 从 ldapjs SearchEntry 中提取常见属性
   */
  private extractAttributes(entry: ldap.SearchEntry): {
    uid?: string;
    cn?: string;
    mail?: string;
    memberOf: string[];
    all: Record<string, any>;
  } {
    const all: Record<string, any> = {};
    const result: {
      uid?: string;
      cn?: string;
      mail?: string;
      memberOf: string[];
      all: Record<string, any>;
    } = { memberOf: [], all };

    // ldapjs 的 SearchEntry 通过 pojo 属性可拿到原始对象
    const pojo: any = (entry as any).pojo || {};
    const attributes: any[] = pojo.attributes || [];

    for (const attr of attributes) {
      const vals = attr.values || [];
      all[attr.type] = vals.length === 1 ? vals[0] : vals;
      if (attr.type === 'uid') result.uid = vals[0];
      else if (attr.type === 'cn') result.cn = vals[0];
      else if (attr.type === 'mail') result.mail = vals[0];
      else if (attr.type === 'memberOf') {
        // 从 DN（如 CN=admins,OU=groups,...）中提取 CN 作为角色名
        result.memberOf = vals.map((dn: string) => this.extractCn(dn));
      }
    }
    return result;
  }

  /** 从 DN 中提取第一个 CN 值（作为角色名） */
  private extractCn(dn: string): string {
    const match = /CN=([^,]+)/i.exec(dn);
    return match ? match[1] : dn;
  }

  /** 转义 LDAP 搜索过滤器中的特殊字符，防止注入 */
  private escapeLdap(value: string): string {
    return value
      .replace(/\\/g, '\\5c')
      .replace(/\*/g, '\\2a')
      .replace(/\(/g, '\\28')
      .replace(/\)/g, '\\29')
      .replace(/\0/g, '\\00');
  }
}
