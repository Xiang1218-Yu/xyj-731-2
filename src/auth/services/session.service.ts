import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { RedisService } from '../../redis/redis.service';
import {
  AuthenticatedUser,
  SessionData,
} from '../interfaces/auth-strategy.interface';

/**
 * 会话服务：负责在 Redis 中管理登录会话状态。
 *
 * 存储的 key 约定：
 * - session:{sessionId}      -> 序列化的 SessionData（会话主体）
 * - user-sessions:{userId}   -> 该用户的当前会话 ID（用于按用户维度管理 / 吊销）
 *
 * 所有会话都带 TTL（配置项 SESSION_TTL），到期自动清理。
 */
@Injectable()
export class SessionService {
  private readonly ttl: number;

  constructor(
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {
    this.ttl = this.configService.get('redis').sessionTtl;
  }

  /**
   * 创建会话并写入 Redis。
   * @param user 认证用户信息
   * @param refreshTokenId 关联的刷新令牌 ID
   * @returns 新建会话的数据
   */
  async createSession(
    user: AuthenticatedUser,
    refreshTokenId: string,
  ): Promise<SessionData> {
    const sessionId = randomUUID();
    const session: SessionData = {
      sessionId,
      user,
      provider: user.provider,
      createdAt: Date.now(),
      refreshTokenId,
    };
    await this.redisService.set(
      this.sessionKey(sessionId),
      JSON.stringify(session),
      this.ttl,
    );
    // 记录用户 -> 会话映射，便于后续吊销
    await this.redisService.set(
      this.userSessionKey(user.userId),
      sessionId,
      this.ttl,
    );
    return session;
  }

  /** 根据会话 ID 读取会话数据 */
  async getSession(sessionId: string): Promise<SessionData | null> {
    const raw = await this.redisService.get(this.sessionKey(sessionId));
    return raw ? (JSON.parse(raw) as SessionData) : null;
  }

  /**
   * 更新会话的刷新令牌 ID 并续期（刷新令牌时调用，实现刷新令牌轮换）。
   */
  async rotateRefreshToken(
    sessionId: string,
    newRefreshTokenId: string,
  ): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) return;
    session.refreshTokenId = newRefreshTokenId;
    await this.redisService.set(
      this.sessionKey(sessionId),
      JSON.stringify(session),
      this.ttl,
    );
  }

  /** 销毁会话（登出时调用） */
  async destroySession(sessionId: string): Promise<void> {
    const session = await this.getSession(sessionId);
    if (session) {
      await this.redisService.del(this.userSessionKey(session.user.userId));
    }
    await this.redisService.del(this.sessionKey(sessionId));
  }

  private sessionKey(sessionId: string): string {
    return `session:${sessionId}`;
  }

  private userSessionKey(userId: string): string {
    return `user-sessions:${userId}`;
  }
}
