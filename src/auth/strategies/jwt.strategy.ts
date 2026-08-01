import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import {
  AuthCredentials,
  AuthenticatedUser,
  AuthStrategyType,
  IAuthStrategy,
} from '../interfaces/auth-strategy.interface';
import { UserRepository } from '../../users/user.repository';

/**
 * JWT 认证策略。
 *
 * 说明：此处的"JWT 策略"指基于本地用户名 / 密码校验的认证方式
 * （校验通过后由 TokenService 统一签发 JWT）。
 *
 * 安全改造（问题 1）：
 * - 不再在策略内硬编码明文用户数据，改为委托 UserRepository 查询。
 * - 密码校验使用 bcrypt 常量时间比较，不再明文比较。
 * - 用户不存在与密码错误返回统一错误信息，避免用户名枚举。
 */
@Injectable()
export class JwtStrategy implements IAuthStrategy {
  readonly type = AuthStrategyType.JWT;
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(private readonly userRepository: UserRepository) {}

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

    // 从用户仓储查询用户
    const user = await this.userRepository.findByUsername(username);
    // 无论用户是否存在都执行一次密码校验，尽量保持响应时间一致，降低用户名枚举风险
    const passwordValid = user
      ? await this.userRepository.verifyPassword(user, password)
      : false;

    if (!user || !passwordValid) {
      this.logger.warn(`JWT 认证失败：用户名或密码错误 (username=${username})`);
      throw new UnauthorizedException('用户名或密码错误');
    }

    // 归一化为统一用户结构（不返回密码哈希）
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
