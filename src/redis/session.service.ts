import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { SessionRecord } from '../common/interfaces/auth.interface';
import { REDIS_CLIENT, MemoryRedis } from './redis.provider';
import Redis from 'ioredis';

/**
 * 会话存储服务
 *
 * 负责将会话（SessionRecord）持久化到 Redis，并提供
 * 创建、查询、删除、刷新等操作。上层 AuthService 不直接
 * 操作 Redis key，而是通过该服务完成会话生命周期管理。
 *
 * 会话结构以 JSON 字符串存储，key 形如：auth:session:{sessionId}
 */
@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);
  private readonly prefix: string;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis | MemoryRedis,
    private readonly config: ConfigService,
  ) {
    this.prefix = config.get<string>('redis.sessionPrefix') || 'auth:session:';
  }

  /**
   * 创建新会话
   * @param data 会话基础数据（userId、username、roles、strategy、refreshTokenHash）
   * @param ttlSeconds 会话过期时间（秒），通常等于 refresh token 有效期
   */
  async createSession(
    data: Omit<SessionRecord, 'sessionId' | 'createdAt' | 'expiresAt'>,
    ttlSeconds: number,
  ): Promise<SessionRecord> {
    const now = Date.now();
    const session: SessionRecord = {
      ...data,
      sessionId: uuidv4(),
      createdAt: now,
      expiresAt: now + ttlSeconds * 1000,
    };
    await this.redis.set(
      this.buildKey(session.sessionId),
      JSON.stringify(session),
      'EX',
      ttlSeconds,
    );
    this.logger.log(
      `会话已创建: sessionId=${session.sessionId}, user=${session.username}`,
    );
    return session;
  }

  /** 根据 sessionId 获取会话，不存在或已过期返回 null */
  async getSession(sessionId: string): Promise<SessionRecord | null> {
    const raw = await this.redis.get(this.buildKey(sessionId));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as SessionRecord;
    } catch {
      return null;
    }
  }

  /** 删除会话（登出时调用） */
  async destroySession(sessionId: string): Promise<boolean> {
    const deleted = await this.redis.del(this.buildKey(sessionId));
    this.logger.log(`会话已销毁: sessionId=${sessionId}, result=${deleted > 0}`);
    return deleted > 0;
  }

  /**
   * 刷新会话 TTL（滑动续期）
   * @returns 是否刷新成功
   */
  async touchSession(sessionId: string, ttlSeconds: number): Promise<boolean> {
    const session = await this.getSession(sessionId);
    if (!session) return false;
    session.expiresAt = Date.now() + ttlSeconds * 1000;
    await this.redis.set(
      this.buildKey(sessionId),
      JSON.stringify(session),
      'EX',
      ttlSeconds,
    );
    return true;
  }

  /**
   * 更新会话的部分字段（用于回填 refreshTokenHash 等），保留原 TTL 剩余时间。
   * 若会话不存在则返回 null。
   */
  async updateSession(
    sessionId: string,
    patch: Partial<SessionRecord>,
  ): Promise<SessionRecord | null> {
    const session = await this.getSession(sessionId);
    if (!session) return null;
    const merged: SessionRecord = { ...session, ...patch, sessionId };
    // 用剩余有效期作为 TTL 重新写入
    const remainingTtl = Math.max(
      1,
      Math.floor((session.expiresAt - Date.now()) / 1000),
    );
    await this.redis.set(
      this.buildKey(sessionId),
      JSON.stringify(merged),
      'EX',
      remainingTtl,
    );
    return merged;
  }

  /** 构建带前缀的 Redis key */
  private buildKey(sessionId: string): string {
    return `${this.prefix}${sessionId}`;
  }
}
