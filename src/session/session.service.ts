import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import Redis from 'ioredis';
import configuration from '../config/configuration';

/** 会话数据结构 */
export interface SessionData {
  /** 会话 ID */
  sessionId: string;
  /** 用户唯一标识 */
  userId: string;
  /** 用户名 */
  username: string;
  /** 用户权限列表 */
  permissions: string[];
  /** 本次登录使用的认证策略 */
  strategy: string;
  /** 刷新令牌 */
  refreshToken: string;
  /** 会话创建时间（毫秒时间戳） */
  createdAt: number;
}

/**
 * 会话服务
 * 优先使用 Redis 存储会话；当 Redis 连接失败时降级为进程内 Map，
 * 保证框架在无 Redis 的演示 / 测试环境下依然可以运行。
 */
@Injectable()
export class SessionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SessionService.name);
  private readonly config = configuration();

  /** Redis 客户端实例 */
  private redis: Redis;
  /** Redis 是否可用 */
  private redisAvailable = false;
  /** 内存降级存储：key -> { value, expireAt } */
  private memoryStore = new Map<string, { value: string; expireAt: number }>();

  /** Redis 中会话键前缀 */
  private readonly keyPrefix = 'auth:session:';

  async onModuleInit() {
    const { host, port, password, db, maxRetries } = this.config.redis;
    this.redis = new Redis({
      host,
      port,
      password,
      db,
      // 连接失败最多重试 maxRetries 次，之后放弃重连，走内存降级
      retryStrategy: (times) => (times > maxRetries ? null : Math.min(times * 200, 2000)),
      lazyConnect: true,
    });

    try {
      await this.redis.connect();
      this.redisAvailable = true;
      this.logger.log(`Redis 会话存储已连接: ${host}:${port}`);
    } catch (err) {
      this.redisAvailable = false;
      this.logger.warn(
        `Redis 连接失败，已降级为内存会话存储（仅适用于开发/测试）: ${(err as Error).message}`,
      );
    }

    // 运行期 Redis 断开时切换为内存模式
    this.redis.on('error', () => {
      if (this.redisAvailable) {
        this.redisAvailable = false;
        this.logger.warn('Redis 连接中断，切换为内存会话存储');
      }
    });
  }

  async onModuleDestroy() {
    if (this.redis) {
      // 静默关闭连接，避免退出时报错
      this.redis.disconnect();
    }
  }

  /**
   * 创建 / 覆盖会话
   * @param data 会话数据
   * @param ttlSeconds 会话有效期（秒）
   */
  async set(data: SessionData, ttlSeconds: number): Promise<void> {
    const key = this.keyPrefix + data.sessionId;
    const value = JSON.stringify(data);
    if (this.redisAvailable) {
      await this.redis.set(key, value, 'EX', ttlSeconds);
    } else {
      this.memoryStore.set(key, {
        value,
        expireAt: Date.now() + ttlSeconds * 1000,
      });
    }
  }

  /**
   * 读取会话，不存在或已过期返回 null
   */
  async get(sessionId: string): Promise<SessionData | null> {
    const key = this.keyPrefix + sessionId;
    let raw: string | null = null;

    if (this.redisAvailable) {
      raw = await this.redis.get(key);
    } else {
      const entry = this.memoryStore.get(key);
      if (entry) {
        if (entry.expireAt < Date.now()) {
          // 惰性过期清理
          this.memoryStore.delete(key);
        } else {
          raw = entry.value;
        }
      }
    }

    return raw ? (JSON.parse(raw) as SessionData) : null;
  }

  /**
   * 删除会话（用于登出）
   */
  async delete(sessionId: string): Promise<void> {
    const key = this.keyPrefix + sessionId;
    if (this.redisAvailable) {
      await this.redis.del(key);
    } else {
      this.memoryStore.delete(key);
    }
  }

  /**
   * 按刷新令牌查找会话
   * 说明：演示级实现采用遍历方式；生产环境建议额外维护
   * refreshToken -> sessionId 的反向索引以提升性能。
   */
  async findByRefreshToken(refreshToken: string): Promise<SessionData | null> {
    if (!this.redisAvailable) {
      // 内存模式：直接遍历内存表
      for (const entry of this.memoryStore.values()) {
        const session: SessionData = JSON.parse(entry.value);
        if (
          session.refreshToken === refreshToken &&
          entry.expireAt > Date.now()
        ) {
          return session;
        }
      }
      return null;
    }

    // Redis 模式：SCAN 遍历会话键，避免 KEYS 阻塞
    let cursor = '0';
    do {
      const [next, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        `${this.keyPrefix}*`,
        'COUNT',
        100,
      );
      cursor = next;
      for (const key of keys) {
        const raw = await this.redis.get(key);
        if (raw) {
          const session: SessionData = JSON.parse(raw);
          if (session.refreshToken === refreshToken) {
            return session;
          }
        }
      }
    } while (cursor !== '0');
    return null;
  }
}
