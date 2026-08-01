import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
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
 * 吊销事件通过 SESSION_REVOKED_CHANNEL 广播；本服务在启动时订阅该频道（问题 1），
 * 收到事件后在本实例维护一份短时的"已吊销"本地缓存，作为 Redis 黑名单之前的快速拦截，
 * 并可在此扩展本地缓存清理等响应逻辑。
 *
 * 所有会话都带 TTL（配置项 SESSION_TTL），到期自动清理。
 */
@Injectable()
export class SessionService implements OnModuleInit {
  private readonly logger = new Logger(SessionService.name);
  private readonly ttl: number;

  // 本地已吊销缓存：sessionId -> 加入时间（ms）。用于跨实例事件到达后的快速本地拦截。
  private readonly localRevoked = new Map<string, number>();

  constructor(
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {
    this.ttl = this.configService.get('redis').sessionTtl;
  }

  /**
   * 模块初始化：订阅会话吊销频道（问题 1）。
   * 任一实例吊销会话后，所有实例都会收到事件并同步更新本地缓存 / 执行清理。
   */
  async onModuleInit(): Promise<void> {
    await this.redisService.subscribe(SESSION_REVOKED_CHANNEL, (sessionId) => {
      this.onSessionRevoked(sessionId);
    });
  }

  /**
   * 收到吊销事件的处理器（本实例侧响应）。
   * - 记入本地已吊销缓存，供 isRevoked 快速命中，减少对 Redis 的往返依赖。
   * - 预留清理本地相关缓存的位置（如按用户缓存的会话信息）。
   */
  private onSessionRevoked(sessionId: string): void {
    this.localRevoked.set(sessionId, Date.now());
    this.logger.debug(`收到会话吊销事件，已更新本地缓存：sid=${sessionId}`);
    // 惰性清理：移除超过 TTL 的本地记录，避免 Map 无限增长
    this.evictExpiredLocalRevoked();
  }

  /** 清理本地吊销缓存中已超过 TTL 的条目 */
  private evictExpiredLocalRevoked(): void {
    const expireBefore = Date.now() - this.ttl * 1000;
    for (const [sid, addedAt] of this.localRevoked) {
      if (addedAt < expireBefore) {
        this.localRevoked.delete(sid);
      }
    }
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
    // 立即写入本实例本地缓存（广播回环到达前也能拦截）
    this.localRevoked.set(sessionId, Date.now());
    const receivers = await this.redisService.publish(
      SESSION_REVOKED_CHANNEL,
      sessionId,
    );
    this.logger.log(
      `会话已吊销并广播：sid=${sessionId}，通知订阅者数=${receivers}`,
    );
  }

  /**
   * 判断会话是否已被吊销。
   * 先查本地已吊销缓存（O(1)，由订阅事件同步），未命中再回退到 Redis 黑名单。
   */
  async isRevoked(sessionId: string): Promise<boolean> {
    if (this.localRevoked.has(sessionId)) {
      return true;
    }
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
