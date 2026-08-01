import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import {
  AuthCredentials,
  AuthenticatedUser,
  IAuthStrategy,
} from './auth-strategy.interface';

/** bcrypt 哈希计算强度（10 为安全与性能的常用平衡点） */
const BCRYPT_ROUNDS = 10;

/**
 * JWT 本地账号认证策略
 * 使用本地用户目录校验用户名 / 密码。
 * 密码以 bcrypt 哈希形式存储，杜绝明文落盘；
 * 接入业务系统时可替换为数据库查询（数据库中同样只保存哈希）。
 */
@Injectable()
export class JwtStrategyImpl implements IAuthStrategy, OnModuleInit {
  readonly name = 'jwt';
  private readonly logger = new Logger(JwtStrategyImpl.name);

  /**
   * 内置模拟用户表（演示用途）
   * 仅在 onModuleInit 异步初始化完成后填充，避免阻塞事件循环。
   * NestJS 会在应用开始监听前等待 onModuleInit 完成，
   * 因此对外提供服务时用户表必然已就绪。
   */
  private users: Array<{
    userId: string;
    username: string;
    passwordHash: string;
    permissions: string[];
  }> = [];

  /**
   * 模块初始化：异步生成演示账号的密码哈希
   * 使用异步 bcrypt.hash 而非 hashSync，避免启动阶段阻塞事件循环
   */
  async onModuleInit(): Promise<void> {
    // 演示账号定义（username -> 明文密码与权限，仅启动时用于生成哈希，运行期不保留明文）
    const demoUsers = [
      {
        userId: 'u-1001',
        username: 'admin',
        plainPassword: 'admin123',
        permissions: ['profile:read', 'admin:access', 'auth:strategy:switch'],
      },
      {
        userId: 'u-1002',
        username: 'alice',
        plainPassword: 'alice123',
        permissions: ['profile:read'],
      },
    ];

    // 并行异步哈希，初始化完成后立即丢弃明文
    this.users = await Promise.all(
      demoUsers.map(async ({ plainPassword, ...rest }) => ({
        ...rest,
        passwordHash: await bcrypt.hash(plainPassword, BCRYPT_ROUNDS),
      })),
    );
  }

  /**
   * 校验用户名密码，返回标准化用户
   */
  async authenticate(
    credentials: AuthCredentials,
  ): Promise<AuthenticatedUser | null> {
    const { username, password } = credentials;
    if (!username || !password) {
      return null;
    }

    const user = this.users.find((u) => u.username === username);
    if (!user) {
      this.logger.warn(`JWT 策略认证失败: 用户不存在 username=${username}`);
      return null;
    }

    // 使用 bcrypt.compare 做恒定时间比对，防止时序攻击
    const matched = await bcrypt.compare(password, user.passwordHash);
    if (!matched) {
      this.logger.warn(`JWT 策略认证失败: 密码错误 username=${username}`);
      return null;
    }

    return {
      userId: user.userId,
      username: user.username,
      permissions: user.permissions,
      provider: this.name,
    };
  }
}
