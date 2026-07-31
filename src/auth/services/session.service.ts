import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { RedisService } from '../../redis/redis.service';
import {
  AuthenticatedUser,
  SessionData,
} from '../interfaces/auth-strategy.interface';

/** 会话吊销事件广播频道名（跨实例通知） */
export const SESSION_REVOKED_CHANNEL = 'session:revoked';

/**
 * 会话服务：负责在 Redis 中管理登录会话状态。
 *
 * 存储的 key 约定：
 * - session:{sessionId}         -> 序列化的 SessionData（会话主体）
 * - user-sessions:{userId}      -> 该用户的当前会话 ID（用于按用户维度管理 / 吊销）
 * - session-blacklist:{sid}     -> 会话吊销标记（问题 7：显式黑名单，带 TTL）
 *
 * 所有会话都带 TTL（配置项 SESSION_TTL），到期自动清理。
 */
@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);
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

  /**
   * 销毁会话（登出时调用）。
   *
   * 安全改造：
   * - 问题 5：删除 user-sessions 映射时使用条件删除（仅当其值确实等于当前 sessionId），
   *   避免用户在其他设备重新登录后误删其最新会话映射。
   * - 问题 7：写入吊销黑名单并广播吊销事件，实现"删除之外"的显式吊销与跨实例通知。
   */
  async destroySession(sessionId: string): Promise<void> {
    const session = await this.getSession(sessionId);

    // 1) 删除会话主体
    await this.redisService.del(this.sessionKey(sessionId));

    // 2) 条件删除用户->会话映射，避免误删其它会话（问题 5）
    if (session) {
      const deleted = await this.redisService.delIfEquals(
        this.userSessionKey(session.user.userId),
        sessionId,
      );
      if (!deleted) {
        this.logger.debug(
          `用户 ${session.user.userId} 的会话映射已指向其它会话，跳过删除以免误删`,
        );
      }
    }

    // 3) 写入吊销黑名单并广播（问题 7）
    await this.revokeSession(sessionId);
  }

  /**
   * 将会话加入吊销黑名单并广播吊销事件。
   * 黑名单 TTL 与会话 TTL 一致，覆盖令牌可能的最长有效期，到期自动清理。
   */
  async revokeSession(sessionId: string): Promise<void> {
    await this.redisService.set(this.blacklistKey(sessionId), '1', this.ttl);
    await this.redisService.publish(SESSION_REVOKED_CHANNEL, sessionId);
    this.logger.log(`会话已吊销并广播：sid=${sessionId}`);
  }

  /** 判断会话是否已被吊销（黑名单校验，供守卫在校验令牌时调用） */
  async isRevoked(sessionId: string): Promise<boolean> {
    const flag = await this.redisService.get(this.blacklistKey(sessionId));
    return flag === '1';
  }

  private sessionKey(sessionId: string): string {
    return `session:${sessionId}`;
  }

  private userSessionKey(userId: string): string {
    return `user-sessions:${userId}`;
  }

  private blacklistKey(sessionId: string): string {
    return `session-blacklist:${sessionId}`;
  }
}
