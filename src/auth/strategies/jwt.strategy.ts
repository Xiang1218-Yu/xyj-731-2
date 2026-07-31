import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import {
  AuthCredentials,
  AuthenticatedUser,
  AuthStrategyType,
  IAuthStrategy,
} from '../interfaces/auth-strategy.interface';

/**
 * JWT 认证策略。
 *
 * 说明：JWT 本身是令牌的载体形式，此处的"JWT 策略"指基于
 * 本地用户名 / 密码校验的认证方式（校验通过后由 TokenService 统一签发 JWT）。
 * 为便于演示，这里使用内置的模拟用户表；生产环境应替换为数据库查询 + 加盐哈希校验。
 */
@Injectable()
export class JwtStrategy implements IAuthStrategy {
  readonly type = AuthStrategyType.JWT;
  private readonly logger = new Logger(JwtStrategy.name);

  // 模拟用户表（生产环境请替换为数据库 + bcrypt 校验）
  private readonly mockUsers: Array<{
    userId: string;
    username: string;
    password: string;
    email: string;
    roles: string[];
    permissions: string[];
  }> = [
    {
      userId: '1',
      username: 'admin',
      password: 'admin123',
      email: 'admin@example.com',
      roles: ['admin'],
      permissions: ['user:read', 'user:write', 'system:manage'],
    },
    {
      userId: '2',
      username: 'user',
      password: 'user123',
      email: 'user@example.com',
      roles: ['user'],
      permissions: ['user:read'],
    },
  ];

  /**
   * 使用用户名 / 密码进行本地认证。
   * @param credentials 需包含 username 与 password
   */
  async authenticate(
    credentials: AuthCredentials,
  ): Promise<AuthenticatedUser> {
    const { username, password } = credentials;
    if (!username || !password) {
      throw new UnauthorizedException('用户名或密码不能为空');
    }

    // 查找用户并校验密码（演示用明文比较，生产应使用哈希比较）
    const user = this.mockUsers.find(
      (u) => u.username === username && u.password === password,
    );
    if (!user) {
      this.logger.warn(`JWT 认证失败：用户名或密码错误 (username=${username})`);
      throw new UnauthorizedException('用户名或密码错误');
    }

    // 归一化为统一用户结构
    return {
      userId: user.userId,
      username: user.username,
      email: user.email,
      roles: user.roles,
      permissions: user.permissions,
      provider: AuthStrategyType.JWT,
    };
  }
}
