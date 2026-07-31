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
 * 2. 内存降级仅在显式开启（REDIS_ALLOW_MEMORY_FALLBACK=true）时可用，
 *    默认关闭：生产/分布式部署必须依赖真实 Redis，避免多实例间会话状态不一致（问题 6）。
 *    未开启降级且 Redis 不可用时，启动直接失败（fail-fast），暴露配置问题。
 * 3. 对外暴露 get / set / del / expire / delIfEquals 等语义化方法，屏蔽底层差异。
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
  // 是否允许内存降级（来自配置）
  private allowMemoryFallback = false;

  constructor(private readonly configService: ConfigService) {}

  /**
   * 模块初始化时尝试建立 Redis 连接。
   * 使用 lazyConnect + 手动 connect，便于捕获连接失败。
   */
  async onModuleInit(): Promise<void> {
    const redisConfig = this.configService.get('redis');
    this.allowMemoryFallback = !!redisConfig.allowMemoryFallback;

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
        this.logger.warn(`Redis 连接异常：${err.message}`);
      });

      await this.client.connect();
      this.logger.log('Redis 连接成功');
    } catch (err) {
      // 安全改造（问题 6）：连接失败时，是否降级取决于显式配置。
      if (this.allowMemoryFallback) {
        this.useMemoryFallback = true;
        this.logger.warn(
          `无法连接 Redis（${err.message}），已启用内存会话存储。` +
            `警告：内存存储不适用于分布式部署，仅供本地开发/演示使用！`,
        );
      } else {
        // 默认行为：直接抛错，阻止服务在无可靠会话存储的情况下启动
        this.logger.error(
          `无法连接 Redis（${err.message}），且未开启内存降级（REDIS_ALLOW_MEMORY_FALLBACK）。服务启动终止。`,
        );
        throw err;
      }
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

  /**
   * 条件删除：仅当 key 当前值等于 expectedValue 时才删除（原子操作）。
   * 用于避免并发场景下误删他人写入的映射（问题 5）。
   * @returns 是否发生了删除
   */
  async delIfEquals(key: string, expectedValue: string): Promise<boolean> {
    if (this.isMemoryMode()) {
      const item = this.memoryStore.get(key);
      if (item && item.value === expectedValue) {
        this.memoryStore.delete(key);
        return true;
      }
      return false;
    }
    // 使用 Lua 脚本保证"比较+删除"的原子性
    const script =
      'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end';
    const result = (await this.client.eval(script, 1, key, expectedValue)) as number;
    return result === 1;
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
   * 发布消息到频道（用于会话吊销的全局广播，问题 7）。
   * 内存模式下无跨实例广播能力，静默跳过。
   */
  async publish(channel: string, message: string): Promise<void> {
    if (this.isMemoryMode()) {
      return;
    }
    await this.client.publish(channel, message);
  }

  /** 判断当前是否处于内存降级模式（供外部感知，如健康检查） */
  isDegraded(): boolean {
    return this.isMemoryMode();
  }

  /**
   * 判断是否使用内存降级模式。
   * 仅在显式开启降级且客户端不可用时才走内存存储。
   */
  private isMemoryMode(): boolean {
    if (!this.allowMemoryFallback) {
      return false;
    }
    return (
      this.useMemoryFallback || !this.client || this.client.status !== 'ready'
    );
  }
}
