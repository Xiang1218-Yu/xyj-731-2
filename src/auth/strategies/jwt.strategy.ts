/**
 * JWT 本地账号认证策略
 *
 * 处理最常见的用户名 + 密码登录场景:
 *  1. 根据用户名查询本地用户库;
 *  2. 使用 Node 内置 crypto scrypt 对密码做加盐哈希比对（不存储明文）;
 *  3. 认证通过后返回统一的 AuthenticatedUser。
 *
 * 注意: 本策略负责"登录时校验账号密码"，登录成功后由 AuthService 签发 JWT。
 *       请求携带 JWT 访问受保护接口时的校验逻辑由 JwtAuthGuard + Passport 完成。
 */
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { AuthType } from '../../common/enums/auth-type.enum';
import {
  AuthCredentials,
  AuthResult,
} from '../../common/interfaces/authenticated-user.interface';
import { UsersService } from '../../users/users.service';
import { AuthStrategy } from './auth-strategy.interface';

@Injectable()
export class JwtStrategy implements AuthStrategy {
  readonly type = AuthType.JWT;
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * 执行用户名密码认证
   */
  async authenticate(credentials: AuthCredentials): Promise<AuthResult> {
    const { username, password } = credentials;

    if (!username || !password) {
      throw new UnauthorizedException('用户名和密码不能为空');
    }

    // 1. 查询用户
    const user = await this.usersService.findByUsername(username);
    if (!user) {
      this.logger.warn(`JWT 认证失败: 用户 ${username} 不存在`);
      throw new UnauthorizedException('用户名或密码错误');
    }

    // 2. 校验密码（使用 scrypt 加盐哈希，比对结果防止时序攻击）
    const passwordValid = this.verifyPassword(
      password,
      user.passwordHash,
      user.passwordSalt,
    );
    if (!passwordValid) {
      this.logger.warn(`JWT 认证失败: 用户 ${username} 密码错误`);
      throw new UnauthorizedException('用户名或密码错误');
    }

    this.logger.log(`JWT 认证成功: ${username}`);

    // 3. 返回统一用户结构（去除敏感字段）
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
    };
  }

  /**
   * 使用 scrypt 校验密码
   * storedHash 格式: scrypt$<saltHex>$<hashHex>
   */
  private verifyPassword(
    plain: string,
    storedHash: string,
    storedSalt: string,
  ): boolean {
    if (!storedHash || !storedSalt) {
      return false;
    }
    const hash = crypto
      .scryptSync(plain, storedSalt, 64)
      .toString('hex');
    // 使用 timingSafeEqual 防止时序攻击
    const a = Buffer.from(hash, 'hex');
    const b = Buffer.from(storedHash, 'hex');
    if (a.length !== b.length) {
      return false;
    }
    return crypto.timingSafeEqual(a, b);
  }
}
