import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHmac, timingSafeEqual } from 'crypto';
import { AuthPrincipal, TokenPair } from '../../common/interfaces/auth.interface';

/**
 * JWT 令牌载荷
 *
 * access token 中携带的业务字段。注意不要放敏感信息（如密码），
 * 因为 JWT 的 payload 仅是 Base64 编码，并非加密。
 */
export interface JwtPayload {
  /** 会话 ID（关联 Redis 中的会话记录） */
  sub: string;
  userId: string;
  username: string;
  roles: string[];
  /** 令牌类型：access / refresh */
  type: 'access' | 'refresh';
}

/**
 * 令牌服务
 *
 * 统一负责 access token / refresh token 的签发、验证与哈希处理。
 * 该服务与认证策略解耦——无论哪种策略认证成功，都由它签发统一格式的令牌。
 */
@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /**
   * 为已认证主体签发令牌对
   * @param principal 认证主体
   * @param sessionId 会话 ID（写入 token 的 sub，校验时反查 Redis）
   */
  async issueTokens(
    principal: AuthPrincipal,
    sessionId: string,
  ): Promise<TokenPair> {
    const expiresIn = this.config.get<number>('jwt.expiresIn')!;
    const refreshExpiresIn = this.config.get<number>(
      'jwt.refreshExpiresIn',
    )!;

    const accessToken = await this.signToken(
      {
        sub: sessionId,
        userId: principal.userId,
        username: principal.username,
        roles: principal.roles,
        type: 'access',
      },
      expiresIn,
    );

    const refreshToken = await this.signToken(
      {
        sub: sessionId,
        userId: principal.userId,
        username: principal.username,
        roles: principal.roles,
        type: 'refresh',
      },
      refreshExpiresIn,
    );

    return {
      accessToken,
      refreshToken,
      expiresIn,
      tokenType: 'Bearer',
    };
  }

  /**
   * 验证 access/refresh token 签名与有效期，返回载荷
   */
  async verifyToken(token: string): Promise<JwtPayload> {
    return this.jwt.verifyAsync<JwtPayload>(token, {
      secret: this.config.get<string>('jwt.secret'),
    });
  }

  /**
   * 生成 refresh token 的摘要
   *
   * 设计说明：
   * refresh token 本身是由 JWT 签发的高熵随机串（攻击者无法离线枚举/猜测），
   * 因此不需要像用户密码那样使用 bcrypt 这种"慢哈希"来抵御暴力破解。
   * 这里改用基于服务端密钥的 HMAC-SHA256：
   *  - 性能比 bcrypt(10 轮) 高数个数量级，避免高并发刷新场景的 CPU 瓶颈；
   *  - 存储的是带密钥的摘要而非明文，即使会话存储泄漏也无法直接还原 token；
   *  - 比对时使用 timingSafeEqual 防止时序攻击。
   *
   * 注意：用户密码仍然应该使用 bcrypt/argon2 等慢哈希（见 JwtAuthStrategy）。
   */
  hashRefreshToken(refreshToken: string): string {
    const secret = this.config.get<string>('jwt.secret') || '';
    return createHmac('sha256', secret).update(refreshToken).digest('hex');
  }

  /** 比对 refresh token 与会话中存储的摘要（常量时间比较，防时序攻击） */
  compareRefreshToken(refreshToken: string, hash: string): boolean {
    if (!hash) return false;
    const expected = Buffer.from(this.hashRefreshToken(refreshToken), 'hex');
    const actual = Buffer.from(hash, 'hex');
    // 长度不一致时 timingSafeEqual 会抛错，需先判断长度
    if (expected.length !== actual.length) return false;
    return timingSafeEqual(expected, actual);
  }

  private async signToken(
    payload: JwtPayload,
    expiresIn: number,
  ): Promise<string> {
    return this.jwt.signAsync(payload, {
      secret: this.config.get<string>('jwt.secret'),
      expiresIn,
    });
  }
}
