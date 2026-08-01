/**
 * Redis 会话存储（主实现）
 *
 * 使用 ioredis 连接 Redis 存储会话数据，支持 TTL 自动过期。
 * 应用启动时尝试连接 Redis，连接失败时根据 REDIS_FALLBACK_MEMORY 配置
 * 决定是否自动降级为内存存储（由 SessionService 协调）。
 */
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import {
  getOptionalString,
  getRequiredNumber,
  getRequiredString,
} from '../common/utils/config.util';
import { SessionData } from '../common/interfaces/authenticated-user.interface';
import { SessionStore } from './session-store.interface';

@Injectable()
export class RedisSessionStore
  implements SessionStore, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(RedisSessionStore.name);
  private client: Redis | null = null;
  private connected = false;

  constructor(private readonly configService: ConfigService) {}

  /**
   * 模块初始化时尝试连接 Redis
   * 使用 lazyConnect，避免在 Redis 不可用时阻塞应用启动
   */
  async onModuleInit(): Promise<void> {
    // 显式读取并校验必填配置项，不使用非空断言。
    // host/port/keyPrefix/db 均有默认值，但仍通过共享工具校验，防止默认值被意外移除。
    const host = getRequiredString(this.configService, 'redis.host');
    const port = getRequiredNumber(this.configService, 'redis.port', {
      min: 1,
      max: 65535,
    });
    const db = getRequiredNumber(this.configService, 'redis.db', {
      min: 0,
      max: 15,
    });
    const keyPrefix = getRequiredString(
      this.configService,
      'redis.keyPrefix',
    );
    // password 本身允许为空（无密码 Redis），使用可选读取
    const password = getOptionalString(
      this.configService,
      'redis.password',
    );

    this.client = new Redis({
      host,
      port,
      password,
      db,
      keyPrefix,
      lazyConnect: true,
      // 失败后不自动重试过多次，交给降级逻辑处理
      retryStrategy: (times) => {
        if (times > 3) {
          this.logger.warn('Redis 重试次数超限，停止重试');
          return null;
        }
        return Math.min(times * 200, 1000);
      },
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });

    this.client.on('error', (err) => {
      this.logger.warn(`Redis 连接错误: ${err.message}`);
    });

    try {
      await this.client.connect();
      this.connected = true;
      this.logger.log(`Redis 会话存储已连接: ${host}:${port}`);
    } catch (err) {
      this.connected = false;
      this.logger.warn(
        `Redis 连接失败: ${(err as Error).message}，将根据配置决定是否降级`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      // 强制断开连接，释放套接字句柄，避免进程无法退出
      this.client.disconnect();
      this.client = null;
      this.connected = false;
    }
  }

  isAvailable(): boolean {
    return this.connected && this.client !== null && this.client.status === 'ready';
  }

  async set(
    sessionId: string,
    data: SessionData,
    ttlSeconds: number,
  ): Promise<void> {
    if (!this.client) {
      throw new Error('Redis 客户端未初始化');
    }
    // 使用 SETEX 原子写入并设置过期时间
    await this.client.set(
      sessionId,
      JSON.stringify(data),
      'EX',
      ttlSeconds,
    );
  }

  async get(sessionId: string): Promise<SessionData | null> {
    if (!this.client) {
      return null;
    }
    const raw = await this.client.get(sessionId);
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw) as SessionData;
    } catch {
      this.logger.warn(`会话数据解析失败: ${sessionId}`);
      return null;
    }
  }

  async delete(sessionId: string): Promise<void> {
    if (!this.client) {
      return;
    }
    await this.client.del(sessionId);
  }

  async touch(sessionId: string, ttlSeconds: number): Promise<boolean> {
    if (!this.client) {
      return false;
    }
    // EXPIRE 返回 1 表示成功刷新，0 表示 key 不存在
    const result = await this.client.expire(sessionId, ttlSeconds);
    return result === 1;
  }
}
