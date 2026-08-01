import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as ldap from 'ldapjs';
import * as bcrypt from 'bcryptjs';
import {
  AuthCredentials,
  AuthenticatedUser,
  IAuthStrategy,
} from './auth-strategy.interface';
import configuration from '../../config/configuration';

/** bcrypt 哈希计算强度 */
const BCRYPT_ROUNDS = 10;
/** LDAP bind 整体超时时间（毫秒），防止目录服务器不可用时请求挂起 */
const LDAP_BIND_TIMEOUT_MS = 5000;
/**
 * unbind 报文发出后到强制销毁 socket 的宽限时间（毫秒）
 * 保证 unbind 请求有机会发往服务器，同时兜底回调不触发的异常场景
 */
const LDAP_UNBIND_GRACE_MS = 500;

/**
 * LDAP 认证策略
 * 通过 LDAP bind 操作校验用户凭据。
 * 未配置 LDAP_URL 时使用内置模拟目录（框架演示 / 测试用途，密码同样以 bcrypt 哈希存储）。
 */
@Injectable()
export class LdapStrategyImpl implements IAuthStrategy, OnModuleInit {
  readonly name = 'ldap';
  private readonly logger = new Logger(LdapStrategyImpl.name);
  private readonly config = configuration();

  /**
   * 内置模拟目录（演示用途）：uid -> { passwordHash, userId, permissions }
   * 密码以 bcrypt 哈希存储；在 onModuleInit 中异步生成，避免阻塞事件循环
   */
  private mockDirectory: Record<
    string,
    { passwordHash: string; userId: string; permissions: string[] }
  > = {};

  /**
   * 模块初始化：异步生成模拟目录的密码哈希
   * 使用异步 bcrypt.hash 而非 hashSync，避免启动阶段阻塞事件循环
   */
  async onModuleInit(): Promise<void> {
    this.mockDirectory = {
      carol: {
        passwordHash: await bcrypt.hash('carol123', BCRYPT_ROUNDS),
        userId: 'ldap-3001',
        permissions: ['profile:read'],
      },
    };
  }

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

    // 演示模式：查内置模拟目录，bcrypt 恒定时间比对
    const entry = this.mockDirectory[username];
    if (!entry || !(await bcrypt.compare(password, entry.passwordHash))) {
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
   * 防挂起设计：
   * 1. client 级别 connectTimeout / timeout 限制单次操作；
   * 2. Promise 级别整体定时器兜底，超时按认证失败处理；
   * 3. 结束时先 unbind 正常关闭会话，再 client.destroy() 强制释放底层 socket，
   *    覆盖 unbind 自身可能挂起（服务器无响应）的异常场景。
   * @returns bind 成功返回 true，否则 false
   */
  private bind(url: string, dn: string, password: string): Promise<boolean> {
    return new Promise((resolve) => {
      const client = ldap.createClient({
        url,
        connectTimeout: LDAP_BIND_TIMEOUT_MS,
        timeout: LDAP_BIND_TIMEOUT_MS,
      });

      /** 防止超时与正常回调同时触发导致重复 resolve */
      let settled = false;
      /** 整体超时兜底定时器 */
      const timer = setTimeout(() => {
        this.logger.warn(`LDAP bind 超时（>${LDAP_BIND_TIMEOUT_MS}ms）: dn=${dn}`);
        done(false);
      }, LDAP_BIND_TIMEOUT_MS);

      /** 统一收尾：释放连接资源并 resolve 结果（幂等） */
      const done = (result: boolean) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        this.releaseClient(client, dn);
        resolve(result);
      };

      client.on('error', (err) => {
        // 连接层错误（如服务器不可达）
        this.logger.error(`LDAP 连接异常: ${err.message}`);
        done(false);
      });

      client.bind(dn, password, (err) => {
        if (err) {
          this.logger.warn(`LDAP bind 失败: dn=${dn}, ${err.message}`);
        }
        done(!err);
      });
    });
  }

  /**
   * 释放 LDAP 客户端资源
   * 释放顺序设计：
   * 1. unbind 回调内 destroy —— 正常路径，unbind 报文发出后再销毁 socket；
   * 2. 宽限期定时器兜底 destroy —— 服务器无响应导致 unbind 回调不触发时，
   *    在 LDAP_UNBIND_GRACE_MS 后强制销毁，避免连接泄漏。
   */
  private releaseClient(client: ldap.Client, dn: string): void {
    /** 保证 destroy 只执行一次 */
    let destroyed = false;
    const destroyOnce = () => {
      if (destroyed) {
        return;
      }
      destroyed = true;
      try {
        client.destroy();
      } catch (err) {
        this.logger.warn(
          `LDAP socket 销毁异常: dn=${dn}, ${(err as Error).message}`,
        );
      }
    };

    try {
      // 正常路径：unbind 报文发出并完成后再销毁 socket
      client.unbind(() => destroyOnce());
    } catch (err) {
      // unbind 调用本身抛错（如连接已断开），直接销毁
      this.logger.warn(
        `LDAP unbind 异常: dn=${dn}, ${(err as Error).message}`,
      );
      destroyOnce();
      return;
    }

    // 兜底路径：宽限期后回调仍未触发则强制销毁；unref 避免阻止进程退出
    setTimeout(destroyOnce, LDAP_UNBIND_GRACE_MS).unref();
  }
}
