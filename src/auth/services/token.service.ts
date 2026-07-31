import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import {
  AuthenticatedUser,
  TokenPair,
} from '../interfaces/auth-strategy.interface';

/** access token 载荷结构 */
export interface AccessTokenPayload {
  sub: string; // userId
  username: string;
  roles: string[];
  permissions: string[];
  provider: string;
  sid: string; // sessionId
  type: 'access';
}

/** refresh token 载荷结构 */
export interface RefreshTokenPayload {
  sub: string; // userId
  sid: string; // sessionId
  jti: string; // refreshTokenId，用于轮换与吊销校验
  type: 'refresh';
}

/**
 * 令牌服务：统一负责 access / refresh 令牌的签发与校验。
 * access 与 refresh 使用不同的过期时间；refresh 携带 jti 以支持轮换。
 */
@Injectable()
export class TokenService {
  private readonly accessExpiresIn: number;
  private readonly refreshExpiresIn: number;
  private readonly secret: string;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    const jwtCfg = this.configService.get('jwt');
    this.secret = jwtCfg.secret;
    this.accessExpiresIn = jwtCfg.accessExpiresIn;
    this.refreshExpiresIn = jwtCfg.refreshExpiresIn;
  }

  /**
   * 为指定用户与会话签发一对令牌。
   * @param user 认证用户
   * @param sessionId 会话 ID
   * @param refreshTokenId 刷新令牌 ID（jti），由调用方生成并同时存入会话
   */
  async issueTokenPair(
    user: AuthenticatedUser,
    sessionId: string,
    refreshTokenId: string,
  ): Promise<TokenPair> {
    const accessPayload: AccessTokenPayload = {
      sub: user.userId,
      username: user.username,
      roles: user.roles,
      permissions: user.permissions,
      provider: user.provider,
      sid: sessionId,
      type: 'access',
    };
    const refreshPayload: RefreshTokenPayload = {
      sub: user.userId,
      sid: sessionId,
      jti: refreshTokenId,
      type: 'refresh',
    };

    const accessToken = await this.jwtService.signAsync(accessPayload, {
      secret: this.secret,
      expiresIn: this.accessExpiresIn,
    });
    const refreshToken = await this.jwtService.signAsync(refreshPayload, {
      secret: this.secret,
      expiresIn: this.refreshExpiresIn,
    });

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.accessExpiresIn,
    };
  }

  /** 校验并解析 access token */
  async verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    try {
      const payload = await this.jwtService.verifyAsync<AccessTokenPayload>(
        token,
        { secret: this.secret },
      );
      if (payload.type !== 'access') {
        throw new Error('令牌类型错误');
      }
      return payload;
    } catch (err) {
      throw new UnauthorizedException(`访问令牌无效或已过期：${err.message}`);
    }
  }

  /** 校验并解析 refresh token */
  async verifyRefreshToken(token: string): Promise<RefreshTokenPayload> {
    try {
      const payload = await this.jwtService.verifyAsync<RefreshTokenPayload>(
        token,
        { secret: this.secret },
      );
      if (payload.type !== 'refresh') {
        throw new Error('令牌类型错误');
      }
      return payload;
    } catch (err) {
      throw new UnauthorizedException(`刷新令牌无效或已过期：${err.message}`);
    }
  }

  /** 生成新的刷新令牌 ID（jti） */
  generateRefreshTokenId(): string {
    return randomUUID();
  }
}
