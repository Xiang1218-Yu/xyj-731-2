import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthStrategy } from './auth-strategy.interface';
import { AuthStrategyType } from '../../common/enums/auth-strategy.enum';
import {
  AuthPrincipal,
  CredentialPayload,
} from '../../common/interfaces/auth.interface';
import { ErrorMessage } from '../../common/constants/error-messages';

/**
 * 本地用户实体（演示用）
 *
 * 实际生产中应替换为数据库查询。这里内置几个用户以便本地启动即可测试。
 * 密码均使用 bcrypt 哈希存储，明文如下：
 *  - admin / admin123  （角色：admin, user）
 *  - user  / user123   （角色：user）
 */
interface LocalUser {
  userId: string;
  username: string;
  passwordHash: string;
  displayName: string;
  email: string;
  roles: string[];
}

@Injectable()
export class JwtAuthStrategy implements AuthStrategy {
  readonly type = AuthStrategyType.JWT;

  /**
   * 演示用户表（内存存储）
   * 生产环境应通过 UserRepository 从数据库加载。
   */
  private readonly users: LocalUser[] = [
    {
      userId: 'u-1001',
      username: 'admin',
      // bcrypt hash of "admin123"
      passwordHash:
        '$2a$10$wql7SKM0qvrx4ueD3w0d.eIeSEEM0hYa9uUzvdZ8hBKQV8CEHuHru',
      displayName: '系统管理员',
      email: 'admin@example.com',
      roles: ['admin', 'user'],
    },
    {
      userId: 'u-1002',
      username: 'user',
      // bcrypt hash of "user123"
      passwordHash:
        '$2a$10$KNWeg1yqDiXHOniBYMQZde3jSeOqMCvS.PfDak/ZO25G1C2VcsSZu',
      displayName: '普通用户',
      email: 'user@example.com',
      roles: ['user'],
    },
  ];

  /**
   * JWT 策略认证流程
   * 1. 根据用户名查找用户
   * 2. 使用 bcrypt 比对密码
   * 3. 返回统一的用户主体
   *
   * 注意：此策略名为 "JwtAuthStrategy"，含义是"使用用户名密码登录后签发 JWT"，
   * 而非校验 JWT。JWT 的校验由 JwtAuthGuard 负责。
   */
  async authenticate(credentials: CredentialPayload): Promise<AuthPrincipal> {
    const { username, password } = credentials;

    if (!username || !password) {
      throw new UnauthorizedException(ErrorMessage.JWT_CREDENTIALS_REQUIRED);
    }

    const user = this.users.find((u) => u.username === username);
    if (!user) {
      throw new UnauthorizedException(ErrorMessage.JWT_INVALID_CREDENTIALS);
    }

    // 使用 bcrypt 比对密码哈希，避免明文存储与比较
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException(ErrorMessage.JWT_INVALID_CREDENTIALS);
    }

    return {
      userId: user.userId,
      username: user.username,
      displayName: user.displayName,
      email: user.email,
      roles: user.roles,
      strategy: this.type,
      authenticatedAt: Date.now(),
    };
  }
}
