/**
 * 认证服务
 *
 * 作为认证领域的门面（Facade），协调:
 *  - AuthStrategyFactory: 运行时动态选择认证策略;
 *  - JwtService: 签发与校验 access/refresh token;
 *  - SessionService: 会话状态的 Redis 存储。
 *
 * 提供统一的登录/登出/刷新令牌能力，对上层控制器屏蔽各认证方式的差异。
 */
import {
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import { AuthType } from '../common/enums/auth-type.enum';
import {
  AuthCredentials,
  AuthenticatedUser,
} from '../common/interfaces/authenticated-user.interface';
import { SessionService } from '../session/session.service';
import { UsersService } from '../users/users.service';
import { AuthResponseDto } from './dto/auth-response.dto';
import { AuthStrategyFactory } from './strategies/auth-strategy.factory';

/** Access Token 中承载的载荷结构 */
interface JwtPayload {
  /** 令牌唯一 ID (JWT ID)，保证每次签发的令牌唯一 */
  jti: string;
  sub: string; // 用户 ID
  username: string;
  roles: string[];
  authType: string;
  sessionId: string;
  type: 'access';
}

/** Refresh Token 中承载的载荷结构 */
interface RefreshPayload {
  jti: string;
  sub: string;
  username: string;
  sessionId: string;
  type: 'refresh';
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly strategyFactory: AuthStrategyFactory,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly sessionService: SessionService,
    private readonly usersService: UsersService,
  ) {}

  /**
   * 统一登录入口
   * 根据 credentials.authType 动态选择认证策略，认证通过后签发令牌并创建会话
   */
  async login(credentials: AuthCredentials & { authType: AuthType }): Promise<AuthResponseDto> {
    // 1. 运行时动态获取认证策略
    const strategy = this.strategyFactory.getStrategy(credentials.authType);
    this.logger.log(
      `使用 ${strategy.type} 策略进行认证, 用户=${credentials.username ?? credentials.accessToken ?? 'code'}`,
    );

    // 2. 执行认证
    const result = await strategy.authenticate(credentials);
    const user = result.user;

    // 3. 创建会话（存储到 Redis，不可用时降级内存）
    const session = await this.sessionService.createSession({
      userId: user.id,
      username: user.username,
      authType: user.authType,
      roles: user.roles,
    });

    // 4. 签发令牌
    const tokens = await this.issueTokens(user, session.sessionId);

    return {
      ...tokens,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        email: user.email,
        roles: user.roles,
        authType: user.authType,
      },
      sessionId: session.sessionId,
    };
  }

  /**
   * 统一登出
   * 校验 refresh token 后销毁对应会话（同时达到吊销令牌的效果）
   */
  async logout(refreshToken: string): Promise<void> {
    if (!refreshToken) {
      throw new UnauthorizedException('refreshToken 不能为空');
    }

    let payload: RefreshPayload;
    try {
      payload = await this.jwtService.verifyAsync<RefreshPayload>(
        refreshToken,
        {
          secret: this.configService.get<string>('jwt.secret'),
        },
      );
    } catch {
      throw new UnauthorizedException('refreshToken 无效或已过期');
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('令牌类型错误');
    }

    // 销毁会话
    await this.sessionService.destroySession(payload.sessionId);
    this.logger.log(`用户 ${payload.username} 已登出`);
  }

  /**
   * 刷新令牌
   * 校验 refresh token 与对应会话是否仍然有效，有效则签发新的 access token
   * （refresh token 采用滑动续期，也一并重新签发）
   */
  async refresh(refreshToken: string): Promise<AuthResponseDto> {
    if (!refreshToken) {
      throw new UnauthorizedException('refreshToken 不能为空');
    }

    let payload: RefreshPayload;
    try {
      payload = await this.jwtService.verifyAsync<RefreshPayload>(
        refreshToken,
        {
          secret: this.configService.get<string>('jwt.secret'),
        },
      );
    } catch {
      throw new UnauthorizedException('refreshToken 无效或已过期');
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('令牌类型错误');
    }

    // 校验会话是否存在（已登出则无法刷新）
    const session = await this.sessionService.getSession(payload.sessionId);
    if (!session) {
      throw new UnauthorizedException('会话已失效，请重新登录');
    }

    // 刷新会话活跃时间
    await this.sessionService.touchSession(payload.sessionId);

    // 组装用户信息（从会话中恢复，避免再查库）
    const user: AuthenticatedUser = {
      id: session.userId,
      username: session.username,
      roles: session.roles,
      authType: session.authType,
    };

    // 重新签发令牌（refresh token 滑动续期）
    const tokens = await this.issueTokens(user, session.sessionId);

    // 查询用户的展示信息
    const fullUser = await this.usersService.findById(user.id);

    return {
      ...tokens,
      user: {
        id: user.id,
        username: user.username,
        displayName: fullUser?.displayName,
        email: fullUser?.email,
        roles: user.roles,
        authType: user.authType,
      },
      sessionId: session.sessionId,
    };
  }

  /**
   * 校验 access token 并返回用户信息（供 JwtStrategy/Passport 使用）
   */
  async validateAccessToken(payload: JwtPayload): Promise<AuthenticatedUser> {
    // 校验会话是否仍然有效（支持服务端登出/踢人）
    const session = await this.sessionService.getSession(payload.sessionId);
    if (!session) {
      throw new UnauthorizedException('会话已失效');
    }
    // 刷新会话活跃时间
    await this.sessionService.touchSession(payload.sessionId);

    return {
      id: payload.sub,
      username: payload.username,
      roles: payload.roles,
      authType: payload.authType,
    };
  }

  /**
   * 获取当前支持的认证类型列表
   */
  getSupportedAuthTypes(): string[] {
    return this.strategyFactory.getSupportedTypes();
  }

  /**
   * 签发 access token 与 refresh token
   */
  private async issueTokens(
    user: AuthenticatedUser,
    sessionId: string,
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    tokenType: string;
  }> {
    const secret = this.configService.get<string>('jwt.secret')!;
    const accessExpiresIn = this.configService.get<string>('jwt.expiresIn')!;
    const refreshExpiresIn = this.configService.get<string>(
      'jwt.refreshExpiresIn',
    )!;
    const issuer = this.configService.get<string>('jwt.issuer')!;

    const accessPayload: JwtPayload = {
      jti: crypto.randomUUID(),
      sub: user.id,
      username: user.username,
      roles: user.roles,
      authType: user.authType,
      sessionId,
      type: 'access',
    };

    const refreshPayload: RefreshPayload = {
      jti: crypto.randomUUID(),
      sub: user.id,
      username: user.username,
      sessionId,
      type: 'refresh',
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(accessPayload, {
        secret,
        expiresIn: accessExpiresIn,
        issuer,
      }),
      this.jwtService.signAsync(refreshPayload, {
        secret,
        expiresIn: refreshExpiresIn,
        issuer,
      }),
    ]);

    // 将 expiresIn 字符串(如 15m)换算为秒，返回给客户端
    const expiresInSeconds = this.parseDurationToSeconds(accessExpiresIn);

    return {
      accessToken,
      refreshToken,
      expiresIn: expiresInSeconds,
      tokenType: 'Bearer',
    };
  }

  /**
   * 将形如 "15m" / "7d" / "3600s" / 数字 的时长解析为秒数
   */
  private parseDurationToSeconds(duration: string | number): number {
    if (typeof duration === 'number') {
      return duration;
    }
    const match = /^(\d+)([smhd])$/.exec(duration.trim());
    if (!match) {
      return parseInt(duration, 10) || 900;
    }
    const value = parseInt(match[1], 10);
    const unit = match[2];
    const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
    return value * multipliers[unit];
  }
}
