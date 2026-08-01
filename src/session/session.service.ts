/**
 * 会话服务
 *
 * 对外提供统一的会话管理能力: 创建、读取、销毁、刷新。
 * 内部优先使用 Redis 存储，当 Redis 不可用且配置允许降级时，
 * 自动切换到内存存储，保证服务可用性（开发/测试友好）。
 *
 * 会话 ID 通过 refresh token 携带，登出/刷新时据此操作会话。
 */
import {
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { ConfigurationException } from '../common/exceptions/configuration.exception';
import { getRequiredBoolean, getRequiredNumber } from '../common/utils/config.util';
import { SessionData } from '../common/interfaces/authenticated-user.interface';
import { MemorySessionStore } from './memory-session.store';
import { RedisSessionStore } from './redis-session.store';
import { SessionStore } from './session-store.interface';

@Injectable()
export class SessionService implements OnModuleInit {
  private readonly logger = new Logger(SessionService.name);
  private store!: SessionStore;
  private readonly sessionTtl: number;

  constructor(
    private readonly redisStore: RedisSessionStore,
    private readonly memoryStore: MemorySessionStore,
    private readonly configService: ConfigService,
  ) {
    // 使用共享工具读取并校验会话 TTL（必须为正整数秒），不使用非空断言
    this.sessionTtl = getRequiredNumber(
      this.configService,
      'redis.sessionTtl',
      { min: 1 },
    );
  }

  /**
   * 启动时选择存储后端。
   *
   * 优先使用 Redis；Redis 不可用时，若允许内存降级则切换内存存储；
   * 若未允许降级则显式抛出异常中止应用启动，避免"假启动"——
   * 即进程存活但所有会话操作都会失败、调用方却无感知的情况。
   */
  onModuleInit(): void {
    if (this.redisStore.isAvailable()) {
      this.store = this.redisStore;
      this.logger.log('会话存储使用 Redis');
      return;
    }

    // 使用共享工具读取并校验降级开关
    const fallbackEnabled = getRequiredBoolean(
      this.configService,
      'redis.fallbackMemory',
    );

    if (fallbackEnabled) {
      this.store = this.memoryStore;
      this.logger.warn(
        'Redis 不可用，会话存储已降级为内存存储（仅限开发/测试环境）',
      );
      return;
    }

    // Redis 不可用且未启用降级，直接抛出异常阻止应用启动
    throw new ConfigurationException(
      'Redis 不可用且未启用内存降级（REDIS_FALLBACK_MEMORY=false），' +
        '请检查 Redis 连接配置或启用降级后重试。应用启动中止。',
    );
  }

  /**
   * 创建新会话
   * @returns 会话 ID
   */
  async createSession(
    data: Omit<SessionData, 'sessionId' | 'createdAt' | 'lastActiveAt' | 'expiresAt'>,
  ): Promise<SessionData> {
    const sessionId = this.generateSessionId();
    const now = Date.now();
    const session: SessionData = {
      ...data,
      sessionId,
      createdAt: now,
      lastActiveAt: now,
      expiresAt: now + this.sessionTtl * 1000,
    };
    await this.store.set(sessionId, session, this.sessionTtl);
    this.logger.log(`会话已创建: ${sessionId} 用户=${data.username}`);
    return session;
  }

  /**
   * 获取会话
   */
  async getSession(sessionId: string): Promise<SessionData | null> {
    return this.store.get(sessionId);
  }

  /**
   * 销毁会话（登出）
   */
  async destroySession(sessionId: string): Promise<void> {
    await this.store.delete(sessionId);
    this.logger.log(`会话已销毁: ${sessionId}`);
  }

  /**
   * 刷新会话活跃时间与过期时间
   */
  async touchSession(sessionId: string): Promise<boolean> {
    return this.store.touch(sessionId, this.sessionTtl);
  }

  /**
   * 获取当前使用的存储类型（用于健康检查/调试）
   */
  getStoreType(): string {
    return this.store instanceof RedisSessionStore ? 'redis' : 'memory';
  }

  /**
   * 生成加密安全的随机会话 ID
   */
  private generateSessionId(): string {
    return crypto.randomBytes(32).toString('hex');
  }
}
