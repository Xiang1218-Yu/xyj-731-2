import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
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
   * 生成 refresh token 的 bcrypt 哈希
   * 存到会话中，刷新时比对，避免明文落库
   */
  async hashRefreshToken(refreshToken: string): Promise<string> {
    return bcrypt.hash(refreshToken, 10);
  }

  /** 比对 refresh token 与会话中存储的哈希 */
  async compareRefreshToken(
    refreshToken: string,
    hash: string,
  ): Promise<boolean> {
    return bcrypt.compare(refreshToken, hash);
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
