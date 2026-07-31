import { Injectable, Logger } from '@nestjs/common';
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
export class JwtStrategyImpl implements IAuthStrategy {
  readonly name = 'jwt';
  private readonly logger = new Logger(JwtStrategyImpl.name);

  /**
   * 内置模拟用户表（演示用途）
   * passwordHash 为 bcrypt 哈希，在构造时由明文演示密码生成，
   * 验证时通过 bcrypt.compare 比对，全程不出现明文存储。
   */
  private readonly users: Array<{
    userId: string;
    username: string;
    passwordHash: string;
    permissions: string[];
  }>;

  constructor() {
    // 启动时一次性生成演示账号的密码哈希，避免每次登录重复哈希计算
    this.users = [
      {
        userId: 'u-1001',
        username: 'admin',
        passwordHash: bcrypt.hashSync('admin123', BCRYPT_ROUNDS),
        permissions: ['profile:read', 'admin:access', 'auth:strategy:switch'],
      },
      {
        userId: 'u-1002',
        username: 'alice',
        passwordHash: bcrypt.hashSync('alice123', BCRYPT_ROUNDS),
        permissions: ['profile:read'],
      },
    ];
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
