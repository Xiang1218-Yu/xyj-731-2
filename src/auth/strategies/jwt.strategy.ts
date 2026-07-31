import { Injectable, Logger } from '@nestjs/common';
import {
  AuthCredentials,
  AuthenticatedUser,
  IAuthStrategy,
} from './auth-strategy.interface';

/**
 * JWT 本地账号认证策略
 * 使用本地用户目录校验用户名 / 密码。
 * 注意：框架层面使用内置模拟用户表，接入业务系统时可替换为数据库查询。
 */
@Injectable()
export class JwtStrategyImpl implements IAuthStrategy {
  readonly name = 'jwt';
  private readonly logger = new Logger(JwtStrategyImpl.name);

  /**
   * 内置模拟用户表（演示用途）
   * 真实场景应替换为数据库 + 哈希密码（如 bcrypt）校验
   */
  private readonly users = [
    {
      userId: 'u-1001',
      username: 'admin',
      password: 'admin123',
      permissions: ['profile:read', 'admin:access', 'auth:strategy:switch'],
    },
    {
      userId: 'u-1002',
      username: 'alice',
      password: 'alice123',
      permissions: ['profile:read'],
    },
  ];

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

    const user = this.users.find(
      (u) => u.username === username && u.password === password,
    );
    if (!user) {
      this.logger.warn(`JWT 策略认证失败: username=${username}`);
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
