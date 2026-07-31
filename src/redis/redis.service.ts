import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Redis 服务封装。
 *
 * 设计要点：
 * 1. 统一管理 ioredis 客户端的生命周期（连接 / 断开）。
 * 2. 当 Redis 不可用时（例如本地未启动 Redis），自动降级为进程内内存存储，
 *    保证认证服务在开发 / 演示环境下依然可用（生产环境应保证 Redis 可用）。
 * 3. 对外只暴露 get / set / del / expire 等语义化方法，屏蔽底层差异。
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;

  // 降级用的内存存储：key -> { value, expireAt(ms 时间戳，0 表示永不过期) }
  private readonly memoryStore = new Map<
    string,
    { value: string; expireAt: number }
  >();

  // 标记当前是否处于内存降级模式
  private useMemoryFallback = false;

  constructor(private readonly configService: ConfigService) {}

  /**
   * 模块初始化时尝试建立 Redis 连接。
   * 使用 lazyConnect + 手动 connect，便于捕获连接失败并触发降级。
   */
  async onModuleInit(): Promise<void> {
    const redisConfig = this.configService.get('redis');
    try {
      this.client = new Redis({
        host: redisConfig.host,
        port: redisConfig.port,
        password: redisConfig.password,
        db: redisConfig.db,
        lazyConnect: true,
        // 只重试有限次数，避免启动时长时间阻塞
        retryStrategy: (times) => (times > 3 ? null : 200),
        maxRetriesPerRequest: 1,
      });

      // 监听错误事件，防止未捕获异常导致进程崩溃
      this.client.on('error', (err) => {
        if (!this.useMemoryFallback) {
          this.logger.warn(`Redis 连接异常，后续将降级为内存存储：${err.message}`);
        }
      });

      await this.client.connect();
      this.logger.log('Redis 连接成功');
    } catch (err) {
      // 连接失败：切换到内存降级模式
      this.useMemoryFallback = true;
      this.logger.warn(
        `无法连接 Redis（${err.message}），已启用内存会话存储（仅供开发/演示使用）`,
      );
    }
  }

  /** 模块销毁时优雅关闭 Redis 连接 */
  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      await this.client.quit().catch(() => undefined);
    }
  }

  /** 写入键值，可选设置过期时间（秒） */
  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (this.isMemoryMode()) {
      const expireAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : 0;
      this.memoryStore.set(key, { value, expireAt });
      return;
    }
    if (ttlSeconds) {
      await this.client.set(key, value, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, value);
    }
  }

  /** 读取键值，不存在或已过期返回 null */
  async get(key: string): Promise<string | null> {
    if (this.isMemoryMode()) {
      const item = this.memoryStore.get(key);
      if (!item) return null;
      // 惰性过期：读取时判断是否过期
      if (item.expireAt && item.expireAt < Date.now()) {
        this.memoryStore.delete(key);
        return null;
      }
      return item.value;
    }
    return this.client.get(key);
  }

  /** 删除键 */
  async del(key: string): Promise<void> {
    if (this.isMemoryMode()) {
      this.memoryStore.delete(key);
      return;
    }
    await this.client.del(key);
  }

  /** 更新键的过期时间（秒） */
  async expire(key: string, ttlSeconds: number): Promise<void> {
    if (this.isMemoryMode()) {
      const item = this.memoryStore.get(key);
      if (item) {
        item.expireAt = Date.now() + ttlSeconds * 1000;
      }
      return;
    }
    await this.client.expire(key, ttlSeconds);
  }

  /**
   * 判断是否使用内存降级模式。
   * 当显式降级，或客户端未处于就绪状态时，都走内存存储。
   */
  private isMemoryMode(): boolean {
    return this.useMemoryFallback || !this.client || this.client.status !== 'ready';
  }
}
